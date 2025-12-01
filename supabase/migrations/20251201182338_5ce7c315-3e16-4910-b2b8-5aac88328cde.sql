-- Fix RLS policy voor professionals tabel: voeg WITH CHECK toe zodat admins kunnen inserten
DROP POLICY IF EXISTS "Admins can manage all professionals" ON public.professionals;

CREATE POLICY "Admins can manage all professionals"
ON public.professionals
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND EXISTS (
    SELECT 1 FROM user_organizations 
    WHERE user_organizations.org_id = professionals.org_id 
    AND user_organizations.user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND EXISTS (
    SELECT 1 FROM user_organizations 
    WHERE user_organizations.org_id = professionals.org_id 
    AND user_organizations.user_id = auth.uid()
  )
);

-- Converteer de 2 bestaande goedgekeurde applicaties naar professionals met correcte werkvorm mapping
INSERT INTO public.professionals (
  org_id,
  full_name,
  functie_niveau,
  werkvorm,
  regio,
  provincie,
  telefoonnummer,
  email,
  heeft_auto,
  heeft_rijbewijs,
  status
)
SELECT
  pa.org_id,
  (pa.extracted_data->>'naam')::text,
  (pa.extracted_data->>'functie_niveau')::text,
  -- Map werkvorm naar correcte constraint waarden
  CASE LOWER(pa.extracted_data->>'werkvorm')
    WHEN 'zzp' THEN 'ZZP'
    WHEN 'uitzend' THEN 'Uitzendkracht'
    WHEN 'uitzendkracht' THEN 'Uitzendkracht'
    WHEN 'abcito' THEN 'ABCito constructie'
    WHEN 'abcito constructie' THEN 'ABCito constructie'
    WHEN 'beide' THEN 'Beide'
    ELSE 'Uitzendkracht' -- Fallback
  END,
  (pa.extracted_data->>'regio')::text,
  CASE
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%utrecht%' THEN 'Utrecht'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%noord-holland%' OR LOWER(pa.extracted_data->>'regio') LIKE '%amsterdam%' THEN 'Noord-Holland'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%zuid-holland%' OR LOWER(pa.extracted_data->>'regio') LIKE '%rotterdam%' OR LOWER(pa.extracted_data->>'regio') LIKE '%den haag%' THEN 'Zuid-Holland'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%noord-brabant%' OR LOWER(pa.extracted_data->>'regio') LIKE '%eindhoven%' OR LOWER(pa.extracted_data->>'regio') LIKE '%tilburg%' THEN 'Noord-Brabant'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%gelderland%' OR LOWER(pa.extracted_data->>'regio') LIKE '%arnhem%' OR LOWER(pa.extracted_data->>'regio') LIKE '%nijmegen%' THEN 'Gelderland'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%limburg%' OR LOWER(pa.extracted_data->>'regio') LIKE '%maastricht%' THEN 'Limburg'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%overijssel%' OR LOWER(pa.extracted_data->>'regio') LIKE '%enschede%' THEN 'Overijssel'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%flevoland%' OR LOWER(pa.extracted_data->>'regio') LIKE '%almere%' THEN 'Flevoland'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%groningen%' THEN 'Groningen'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%friesland%' OR LOWER(pa.extracted_data->>'regio') LIKE '%leeuwarden%' THEN 'Friesland'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%drenthe%' OR LOWER(pa.extracted_data->>'regio') LIKE '%assen%' THEN 'Drenthe'
    WHEN LOWER(pa.extracted_data->>'regio') LIKE '%zeeland%' THEN 'Zeeland'
    ELSE 'Gelderland' -- Fallback voor nijmegen
  END,
  (pa.extracted_data->>'telefoon')::text,
  pa.email_from,
  COALESCE((pa.extracted_data->>'eigen_vervoer')::boolean, false),
  COALESCE((pa.extracted_data->>'eigen_vervoer')::boolean, false),
  'actief'
FROM public.professional_applications pa
WHERE pa.pipeline_stage = 'goedgekeurd'
  AND pa.professional_id IS NULL
  AND pa.deleted_at IS NULL
  AND pa.extracted_data->>'naam' IS NOT NULL
RETURNING id, full_name, werkvorm;

-- Update de applicaties met de nieuwe professional_id
UPDATE public.professional_applications pa
SET professional_id = p.id
FROM public.professionals p
WHERE pa.pipeline_stage = 'goedgekeurd'
  AND pa.professional_id IS NULL
  AND pa.deleted_at IS NULL
  AND LOWER(pa.extracted_data->>'naam') = LOWER(p.full_name)
  AND pa.org_id = p.org_id;

-- Log system events voor de conversies
INSERT INTO public.system_events (
  org_id,
  user_id,
  event_type,
  entity_type,
  entity_id,
  event_data,
  metadata
)
SELECT
  pa.org_id,
  NULL,
  'professional_created_from_application',
  'professional_applications',
  pa.id,
  jsonb_build_object(
    'application_id', pa.id,
    'professional_id', pa.professional_id,
    'naam', pa.extracted_data->>'naam',
    'functie_niveau', pa.extracted_data->>'functie_niveau',
    'werkvorm', pa.extracted_data->>'werkvorm',
    'trigger', 'manual_data_repair_fase_3'
  ),
  jsonb_build_object(
    'source', 'database_migration',
    'reason', 'rls_policy_fix_and_data_repair'
  )
FROM public.professional_applications pa
WHERE pa.pipeline_stage = 'goedgekeurd'
  AND pa.professional_id IS NOT NULL
  AND pa.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.system_events se
    WHERE se.event_type = 'professional_created_from_application'
    AND se.entity_id = pa.id
  );