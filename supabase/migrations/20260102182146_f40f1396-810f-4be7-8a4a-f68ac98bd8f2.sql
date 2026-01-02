-- =====================================================
-- FASE 2: VACATURE-KOPPELING
-- Koppel sollicitaties aan specifieke vacatures
-- =====================================================

-- 1. Voeg target_vacancy_id kolom toe aan professional_applications
ALTER TABLE public.professional_applications 
ADD COLUMN IF NOT EXISTS target_vacancy_id UUID REFERENCES public.vacancies(id);

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_applications_target_vacancy 
ON public.professional_applications(target_vacancy_id) 
WHERE target_vacancy_id IS NOT NULL;

-- =====================================================
-- FASE 4: EVIDENCE SOURCE LOGGING
-- Track welk document/email elke data-waarde leverde
-- =====================================================

-- 1. Profile Fact Sources tabel voor evidence tracking
CREATE TABLE public.profile_fact_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  
  -- Welk veld
  field_name TEXT NOT NULL,
  field_value TEXT,
  
  -- Bron informatie
  source_type TEXT NOT NULL CHECK (source_type IN ('cv', 'email_reply', 'manual_input', 'document', 'api_extraction', 'user_correction')),
  source_reference TEXT, -- file_path, email_id, etc.
  source_detail TEXT, -- page number, section name, etc.
  
  -- Confidence en metadata
  confidence NUMERIC(3,2) DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  extracted_by TEXT, -- 'ai', 'manual', 'system'
  extraction_method TEXT, -- 'gemini_vision', 'regex', 'user_input'
  
  -- Timestamps
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_profile_fact_sources_application ON public.profile_fact_sources(application_id);
CREATE INDEX idx_profile_fact_sources_field ON public.profile_fact_sources(field_name);
CREATE INDEX idx_profile_fact_sources_source ON public.profile_fact_sources(source_type);

-- Enable RLS
ALTER TABLE public.profile_fact_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view fact sources"
ON public.profile_fact_sources FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Org members can create fact sources"
ON public.profile_fact_sources FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update fact sources"
ON public.profile_fact_sources FOR UPDATE
USING (
  org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage all fact sources"
ON public.profile_fact_sources FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Helper function om fact source te loggen
CREATE OR REPLACE FUNCTION public.log_profile_fact_source(
  p_application_id UUID,
  p_field_name TEXT,
  p_field_value TEXT,
  p_source_type TEXT,
  p_source_reference TEXT DEFAULT NULL,
  p_source_detail TEXT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT 0.8,
  p_extracted_by TEXT DEFAULT 'ai',
  p_extraction_method TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_fact_id UUID;
BEGIN
  -- Haal org_id op van application
  SELECT org_id INTO v_org_id 
  FROM public.professional_applications 
  WHERE id = p_application_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Application not found: %', p_application_id;
  END IF;
  
  -- Insert fact source
  INSERT INTO public.profile_fact_sources (
    application_id,
    org_id,
    field_name,
    field_value,
    source_type,
    source_reference,
    source_detail,
    confidence,
    extracted_by,
    extraction_method
  ) VALUES (
    p_application_id,
    v_org_id,
    p_field_name,
    p_field_value,
    p_source_type,
    p_source_reference,
    p_source_detail,
    p_confidence,
    p_extracted_by,
    p_extraction_method
  ) RETURNING id INTO v_fact_id;
  
  RETURN v_fact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. View voor application met fact sources summary
CREATE OR REPLACE VIEW public.application_evidence_summary AS
SELECT 
  pa.id as application_id,
  pa.extracted_data->>'naam' as candidate_name,
  COUNT(pfs.id) as total_facts,
  COUNT(CASE WHEN pfs.source_type = 'cv' THEN 1 END) as facts_from_cv,
  COUNT(CASE WHEN pfs.source_type = 'email_reply' THEN 1 END) as facts_from_email,
  COUNT(CASE WHEN pfs.source_type = 'manual_input' THEN 1 END) as facts_from_manual,
  COUNT(CASE WHEN pfs.verified_at IS NOT NULL THEN 1 END) as verified_facts,
  AVG(pfs.confidence) as avg_confidence
FROM public.professional_applications pa
LEFT JOIN public.profile_fact_sources pfs ON pfs.application_id = pa.id
WHERE pa.deleted_at IS NULL
GROUP BY pa.id, pa.extracted_data->>'naam';