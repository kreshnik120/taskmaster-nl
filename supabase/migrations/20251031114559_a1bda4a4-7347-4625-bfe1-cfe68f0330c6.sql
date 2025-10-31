-- Stap 1: Nieuwe tabel voor organization master data (zonder unique org_id constraint)
CREATE TABLE IF NOT EXISTS public.org_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  kvk_number TEXT,
  primary_domain TEXT,
  secondary_domains TEXT[],
  services JSONB DEFAULT '[]'::jsonb,
  excluded_services TEXT[],
  verified BOOLEAN DEFAULT false,
  confidence NUMERIC(3,2) DEFAULT 0.95,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE(org_id, brand_name),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (business_type IN ('bemiddelingsbureau', 'zorginstelling', 'thuiszorg', 'overig'))
);

CREATE INDEX IF NOT EXISTS idx_org_profiles_org_id ON public.org_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_org_profiles_brand ON public.org_profiles(brand_name);

ALTER TABLE public.org_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_profiles_select" ON public.org_profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "org_profiles_admin_all" ON public.org_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Seed ABCzorg org_profile
INSERT INTO public.org_profiles (org_id, brand_name, business_type, kvk_number, primary_domain, verified, confidence)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'ABCzorg',
  'bemiddelingsbureau',
  '87023168',
  'abczorg.nl',
  true,
  0.95
)
ON CONFLICT (org_id, brand_name) DO UPDATE SET
  business_type = EXCLUDED.business_type,
  kvk_number = EXCLUDED.kvk_number,
  primary_domain = EXCLUDED.primary_domain,
  verified = EXCLUDED.verified,
  updated_at = NOW();

-- Seed CitoZorg org_profile
INSERT INTO public.org_profiles (org_id, brand_name, business_type, kvk_number, primary_domain, verified, confidence)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'CitoZorg',
  'bemiddelingsbureau',
  '64756857',
  'citozorg.nl',
  true,
  0.95
)
ON CONFLICT (org_id, brand_name) DO UPDATE SET
  business_type = EXCLUDED.business_type,
  kvk_number = EXCLUDED.kvk_number,
  primary_domain = EXCLUDED.primary_domain,
  verified = EXCLUDED.verified,
  updated_at = NOW();

-- Stap 2: Opschonen problematische kennis
UPDATE public.ai_knowledge_base
SET 
  deleted_at = NOW(),
  deleted_by = 'system_cleanup',
  deletion_reason = jsonb_build_object(
    'reason', 'Incorrect business information (failliet/doorstart/thuiszorg)',
    'cleanup_date', '2025-10-31'
  )
WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
  AND deleted_at IS NULL
  AND (
    value::text ILIKE '%failliet%'
    OR value::text ILIKE '%doorstart%'
    OR value::text ILIKE '%Cito Zorg Thuiszorg B.V.%'
    OR value::text ILIKE '%92363776%'
    OR (category = 'bedrijfsgegevens' AND key ILIKE '%CitoZorg%' AND value::text ILIKE '%thuiszorg%')
  );

UPDATE public.ai_knowledge_base
SET 
  needs_review = true,
  last_validation_error = 'CitoZorg levert geen Huishoudelijke Hulp (user correctie)'
WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
  AND deleted_at IS NULL
  AND value::text ILIKE '%Huishoudelijke Hulp%'
  AND (key ILIKE '%CitoZorg%' OR key ILIKE '%dienstenpakket%');

UPDATE public.ai_knowledge_base
SET 
  value = jsonb_set(value, '{KvK-nummer}', '"87023168"'),
  validation_status = 'verified',
  confidence_score = 0.95,
  updated_at = NOW()
WHERE id = '30e444d5-fc57-456a-8147-d6fe21289e3c';