-- Fase 1: Database Schema Uitbreiding voor Professionals
-- Voeg ontbrekende kolommen toe voor volledige data synchronisatie

-- Opleidingen als JSONB voor flexibele structuur
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS opleidingen jsonb DEFAULT '[]'::jsonb;

-- Talen als text array
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS talen text[] DEFAULT '{}'::text[];

-- Regio voorkeur als text array (meerdere regio's mogelijk)
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS regio_voorkeur text[] DEFAULT '{}'::text[];

-- Specifieke doelgroepen ervaring
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS specifieke_doelgroepen text[] DEFAULT '{}'::text[];

-- Maximum reisafstand in kilometers
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS max_reisafstand_km integer;

-- Certificaten als text array
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS certificaten text[] DEFAULT '{}'::text[];

-- Specialisaties als text array
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS specialisaties text[] DEFAULT '{}'::text[];

-- Fase 3: Repair bestaande professionals met data uit hun applications
UPDATE public.professionals p
SET 
  postcode = COALESCE(p.postcode, (pa.extracted_data->>'postcode')),
  woonplaats = COALESCE(p.woonplaats, (pa.extracted_data->>'woonplaats')),
  geboortedatum = CASE 
    WHEN p.geboortedatum IS NULL AND pa.extracted_data->>'geboortedatum' IS NOT NULL 
    THEN (pa.extracted_data->>'geboortedatum')::date 
    ELSE p.geboortedatum 
  END,
  opleidingen = COALESCE(
    CASE WHEN p.opleidingen = '[]'::jsonb THEN NULL ELSE p.opleidingen END,
    pa.extracted_data->'opleidingen',
    '[]'::jsonb
  ),
  talen = COALESCE(
    CASE WHEN p.talen = '{}'::text[] THEN NULL ELSE p.talen END,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(pa.extracted_data->'talen', '[]'::jsonb))),
    '{}'::text[]
  ),
  regio_voorkeur = COALESCE(
    CASE WHEN p.regio_voorkeur = '{}'::text[] THEN NULL ELSE p.regio_voorkeur END,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(pa.extracted_data->'regio_voorkeur', '[]'::jsonb))),
    '{}'::text[]
  ),
  certificaten = COALESCE(
    CASE WHEN p.certificaten = '{}'::text[] THEN NULL ELSE p.certificaten END,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(pa.extracted_data->'certificaten', '[]'::jsonb))),
    '{}'::text[]
  ),
  specialisaties = COALESCE(
    CASE WHEN p.specialisaties = '{}'::text[] THEN NULL ELSE p.specialisaties END,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(pa.extracted_data->'specialisaties', '[]'::jsonb))),
    '{}'::text[]
  )
FROM public.professional_applications pa
WHERE pa.professional_id = p.id
AND pa.extracted_data IS NOT NULL;