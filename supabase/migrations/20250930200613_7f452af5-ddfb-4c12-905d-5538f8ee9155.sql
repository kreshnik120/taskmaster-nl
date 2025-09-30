-- Update bestaande prioritizer_state records met nieuwe weight structuur
UPDATE public.prioritizer_state
SET weights = jsonb_build_object(
  'w_klant_impact', 0.30,
  'w_omzet_bescherming', 0.30,
  'w_overgang_voorbereiding', 0.20,
  'w_compliance', 0.10,
  'w_operationeel', 0.10
),
percentiles = '{}'::jsonb,
betas = '{}'::jsonb,
last_updated = now()
WHERE weights ?| array['w_business', 'w_money', 'w_quality', 'w_urgency', 'w_growth'];

-- Reset percentiles voor nieuwe berekeningen
UPDATE public.prioritizer_state
SET percentiles = jsonb_build_object(
  'clientImpact', jsonb_build_object('p10', 0, 'p90', 1),
  'revenueProtection', jsonb_build_object('p10', 0, 'p90', 1),
  'transitionPrep', jsonb_build_object('p10', 0, 'p90', 1),
  'compliance', jsonb_build_object('p10', 0, 'p90', 1),
  'operational', jsonb_build_object('p10', 0, 'p90', 1)
),
last_updated = now();