-- Fix percentiles structuur: converteer objecten naar arrays met Nederlandse namen
UPDATE public.prioritizer_state
SET percentiles = jsonb_build_object(
  'scores', '[]'::jsonb,
  'klant_impact', '[]'::jsonb,
  'omzet_bescherming', '[]'::jsonb,
  'overgang_voorbereiding', '[]'::jsonb,
  'compliance', '[]'::jsonb,
  'operationeel', '[]'::jsonb
),
last_updated = now();