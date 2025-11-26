-- ========================================
-- FASE 1: Recruitment Database Foundation
-- ========================================

-- 1. Voeg pipeline_stage kolom toe aan professional_applications
ALTER TABLE public.professional_applications 
ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'nieuw';

COMMENT ON COLUMN public.professional_applications.pipeline_stage IS 
'Pipeline status: nieuw, screening, interview, goedgekeurd, geplaatst, afgewezen';

-- 2. Maak professional_interviews tabel aan
CREATE TABLE IF NOT EXISTS public.professional_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scheduled_at timestamptz,
  interviewer_id uuid,
  notes text,
  outcome text, -- positief, negatief, vervolgnodig
  ai_assessment jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.professional_interviews IS 
'Tracks interviews with professionals during recruitment process';

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_professional_interviews_application 
ON public.professional_interviews(application_id);

CREATE INDEX IF NOT EXISTS idx_professional_interviews_org 
ON public.professional_interviews(org_id);

CREATE INDEX IF NOT EXISTS idx_professional_interviews_scheduled 
ON public.professional_interviews(scheduled_at);

-- 3. Maak professional_client_matches tabel aan
CREATE TABLE IF NOT EXISTS public.professional_client_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  match_score numeric CHECK (match_score >= 0 AND match_score <= 100),
  match_reasoning jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'suggested', -- suggested, approved, rejected, placed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

COMMENT ON TABLE public.professional_client_matches IS 
'AI-generated matches between professionals and clients with reasoning';

COMMENT ON COLUMN public.professional_client_matches.match_reasoning IS 
'JSON with AI explanation why this is a good/bad match';

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_professional_client_matches_professional 
ON public.professional_client_matches(professional_id);

CREATE INDEX IF NOT EXISTS idx_professional_client_matches_client 
ON public.professional_client_matches(client_id);

CREATE INDEX IF NOT EXISTS idx_professional_client_matches_org 
ON public.professional_client_matches(org_id);

CREATE INDEX IF NOT EXISTS idx_professional_client_matches_status 
ON public.professional_client_matches(status);

CREATE INDEX IF NOT EXISTS idx_professional_client_matches_score 
ON public.professional_client_matches(match_score DESC);

-- 4. Maak trigger functie voor automatisch event logging
CREATE OR REPLACE FUNCTION public.log_recruitment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_type_name text;
  event_data_json jsonb;
  metadata_json jsonb;
BEGIN
  -- Bepaal event type
  IF TG_OP = 'INSERT' THEN
    event_type_name := TG_TABLE_NAME || '_created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check specifieke status changes
    IF TG_TABLE_NAME = 'professional_applications' AND OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
      event_type_name := 'application_stage_changed';
    ELSIF TG_TABLE_NAME = 'professional_applications' AND OLD.status IS DISTINCT FROM NEW.status THEN
      event_type_name := 'application_status_changed';
    ELSIF TG_TABLE_NAME = 'professional_clients' AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      event_type_name := 'placement_status_changed';
    ELSE
      event_type_name := TG_TABLE_NAME || '_updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    event_type_name := TG_TABLE_NAME || '_deleted';
  END IF;

  -- Build event data
  event_data_json := to_jsonb(NEW);
  
  -- Build metadata met old/new vergelijking
  metadata_json := jsonb_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME
  );

  IF TG_OP = 'UPDATE' THEN
    metadata_json := metadata_json || jsonb_build_object(
      'old_values', CASE 
        WHEN TG_TABLE_NAME = 'professional_applications' THEN 
          jsonb_build_object(
            'status', OLD.status,
            'pipeline_stage', OLD.pipeline_stage,
            'completeness_score', OLD.completeness_score
          )
        WHEN TG_TABLE_NAME = 'professional_clients' THEN
          jsonb_build_object(
            'is_active', OLD.is_active,
            'end_date', OLD.end_date
          )
        ELSE '{}'::jsonb
      END,
      'new_values', CASE 
        WHEN TG_TABLE_NAME = 'professional_applications' THEN 
          jsonb_build_object(
            'status', NEW.status,
            'pipeline_stage', NEW.pipeline_stage,
            'completeness_score', NEW.completeness_score
          )
        WHEN TG_TABLE_NAME = 'professional_clients' THEN
          jsonb_build_object(
            'is_active', NEW.is_active,
            'end_date', NEW.end_date
          )
        ELSE '{}'::jsonb
      END
    );
  END IF;

  -- Insert event naar system_events
  INSERT INTO public.system_events (
    org_id, 
    user_id, 
    event_type, 
    entity_type, 
    entity_id, 
    event_data, 
    metadata
  )
  VALUES (
    NEW.org_id,
    COALESCE(auth.uid(), NEW.created_by),
    event_type_name,
    TG_TABLE_NAME,
    NEW.id,
    event_data_json,
    metadata_json
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_recruitment_events() IS 
'Automatically logs recruitment-related events to system_events for AI learning';

-- 5. Voeg triggers toe aan tabellen
DROP TRIGGER IF EXISTS log_application_events ON public.professional_applications;
CREATE TRIGGER log_application_events
  AFTER INSERT OR UPDATE ON public.professional_applications
  FOR EACH ROW 
  EXECUTE FUNCTION public.log_recruitment_events();

DROP TRIGGER IF EXISTS log_placement_events ON public.professional_clients;
CREATE TRIGGER log_placement_events
  AFTER INSERT OR UPDATE ON public.professional_clients
  FOR EACH ROW 
  EXECUTE FUNCTION public.log_recruitment_events();

DROP TRIGGER IF EXISTS log_interview_events ON public.professional_interviews;
CREATE TRIGGER log_interview_events
  AFTER INSERT OR UPDATE ON public.professional_interviews
  FOR EACH ROW 
  EXECUTE FUNCTION public.log_recruitment_events();

DROP TRIGGER IF EXISTS log_match_events ON public.professional_client_matches;
CREATE TRIGGER log_match_events
  AFTER INSERT OR UPDATE ON public.professional_client_matches
  FOR EACH ROW 
  EXECUTE FUNCTION public.log_recruitment_events();

-- 6. RLS Policies voor professional_interviews
ALTER TABLE public.professional_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can manage interviews"
  ON public.professional_interviews
  FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
    AND EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = professional_interviews.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view interviews"
  ON public.professional_interviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = professional_interviews.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

-- 7. RLS Policies voor professional_client_matches
ALTER TABLE public.professional_client_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can manage matches"
  ON public.professional_client_matches
  FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
    AND EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = professional_client_matches.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view matches"
  ON public.professional_client_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = professional_client_matches.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

-- 8. Update trigger voor updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_professional_interviews_timestamp ON public.professional_interviews;
CREATE TRIGGER update_professional_interviews_timestamp
  BEFORE UPDATE ON public.professional_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_timestamp();

DROP TRIGGER IF EXISTS update_professional_client_matches_timestamp ON public.professional_client_matches;
CREATE TRIGGER update_professional_client_matches_timestamp
  BEFORE UPDATE ON public.professional_client_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_timestamp();