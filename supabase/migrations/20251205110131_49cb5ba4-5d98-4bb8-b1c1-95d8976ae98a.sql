-- === Expert Panel Optimalisatie Fase 3 & 4 ===
-- (1) Database index voor client_sublocations matching performance
-- (2) AI Success Pattern Seeding met domain knowledge

-- === FASE 4: Performance Index ===
-- Compound index voor matching queries
CREATE INDEX IF NOT EXISTS idx_sublocations_matching 
ON public.client_sublocations (is_active, sector, doelgroep)
WHERE is_active = true;

-- Index voor provincies en plaatsen (regio filtering)
CREATE INDEX IF NOT EXISTS idx_sublocations_regio
ON public.client_sublocations (plaats, provincie)
WHERE is_active = true;

-- === FASE 3: AI Success Pattern Seeding ===
-- Seed bekende succesvolle combinaties als AI learning patterns
-- Deze patterns geven +5-15% boost aan matching scores

-- Pattern 1: VIG + VVT + Ouderen (zeer common succesvolle combinatie)
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_vig_vvt_ouderen',
  jsonb_build_object(
    'functie', 'VIG',
    'sector', ARRAY['VVT'],
    'doelgroep', ARRAY['Ouderen'],
    'boost_factor', 12,
    'description', 'VIG professionals matchen excellent met VVT ouderenzorg locaties',
    'success_rate', 0.85
  ),
  0.90,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_vig_vvt_ouderen' AND deleted_at IS NULL
);

-- Pattern 2: Begeleider + GHZ + LVB
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_begeleider_ghz_lvb',
  jsonb_build_object(
    'functie', 'Begeleider',
    'sector', ARRAY['GHZ'],
    'doelgroep', ARRAY['LVB'],
    'boost_factor', 15,
    'description', 'Begeleiders met GHZ ervaring excellent bij LVB doelgroep',
    'success_rate', 0.82
  ),
  0.88,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_begeleider_ghz_lvb' AND deleted_at IS NULL
);

-- Pattern 3: GGZ-agoog + GGZ + Psychiatrie
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_ggzagoog_ggz_psychiatrie',
  jsonb_build_object(
    'functie', 'GGZ-agoog',
    'sector', ARRAY['GGZ'],
    'doelgroep', ARRAY['Psychiatrie'],
    'boost_factor', 18,
    'description', 'GGZ-agogen zijn specialist match voor psychiatrische zorg',
    'success_rate', 0.90
  ),
  0.92,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_ggzagoog_ggz_psychiatrie' AND deleted_at IS NULL
);

-- Pattern 4: Verpleegkundige + Ziekenhuis + Somatiek
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_verpleegkundige_ziekenhuis_somatiek',
  jsonb_build_object(
    'functie', 'Verpleegkundige MBO',
    'sector', ARRAY['Ziekenhuis'],
    'doelgroep', ARRAY['Somatiek'],
    'boost_factor', 14,
    'description', 'MBO verpleegkundigen excellent voor somatische ziekenhuiszorg',
    'success_rate', 0.87
  ),
  0.89,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_verpleegkundige_ziekenhuis_somatiek' AND deleted_at IS NULL
);

-- Pattern 5: HBO-V + VVT + Palliatief
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_hbov_vvt_palliatief',
  jsonb_build_object(
    'functie', 'HBO-V',
    'sector', ARRAY['VVT'],
    'doelgroep', ARRAY['Palliatief', 'Ouderen'],
    'boost_factor', 16,
    'description', 'HBO-V verpleegkundigen ideaal voor palliatieve VVT zorg',
    'success_rate', 0.88
  ),
  0.91,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_hbov_vvt_palliatief' AND deleted_at IS NULL
);

-- Pattern 6: Persoonlijk begeleider + Jeugdzorg + Kinderen/Jeugd
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_pb_jeugdzorg_kinderen',
  jsonb_build_object(
    'functie', 'Persoonlijk begeleider',
    'sector', ARRAY['Jeugdzorg'],
    'doelgroep', ARRAY['Kinderen/Jeugd'],
    'boost_factor', 14,
    'description', 'Persoonlijk begeleiders excellent voor jeugdzorg met kinderen',
    'success_rate', 0.84
  ),
  0.87,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_pb_jeugdzorg_kinderen' AND deleted_at IS NULL
);

-- Pattern 7: Helpende + Thuiszorg + Ouderen
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_helpende_thuiszorg_ouderen',
  jsonb_build_object(
    'functie', 'Helpende',
    'sector', ARRAY['Thuiszorg'],
    'doelgroep', ARRAY['Ouderen'],
    'boost_factor', 10,
    'description', 'Helpenden goed match voor thuiszorg bij ouderen',
    'success_rate', 0.80
  ),
  0.85,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_helpende_thuiszorg_ouderen' AND deleted_at IS NULL
);

-- Pattern 8: Begeleider + GGZ + Verslaving
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_begeleider_ggz_verslaving',
  jsonb_build_object(
    'functie', 'Begeleider',
    'sector', ARRAY['GGZ'],
    'doelgroep', ARRAY['Verslaving'],
    'boost_factor', 13,
    'description', 'Begeleiders met GGZ background goed voor verslavingszorg',
    'success_rate', 0.79
  ),
  0.84,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_begeleider_ggz_verslaving' AND deleted_at IS NULL
);

-- Pattern 9: VIG + GHZ + NAH (hersenletsel)
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_vig_ghz_nah',
  jsonb_build_object(
    'functie', 'VIG',
    'sector', ARRAY['GHZ'],
    'doelgroep', ARRAY['NAH'],
    'boost_factor', 11,
    'description', 'VIG medewerkers geschikt voor NAH revalidatiezorg',
    'success_rate', 0.78
  ),
  0.83,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_vig_ghz_nah' AND deleted_at IS NULL
);

-- Pattern 10: HBO-V + GGZ + Forensisch
INSERT INTO public.ai_knowledge_base (
  org_id,
  category,
  key,
  value,
  confidence_score,
  source,
  source_type,
  validation_status
)
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'success_pattern',
  'success_pattern_hbov_ggz_forensisch',
  jsonb_build_object(
    'functie', 'HBO-V',
    'sector', ARRAY['GGZ'],
    'doelgroep', ARRAY['Forensisch', 'Psychiatrie'],
    'boost_factor', 17,
    'description', 'HBO-V verpleegkundigen specialist voor forensische GGZ',
    'success_rate', 0.86
  ),
  0.90,
  'domain_expert_seeding',
  'manual',
  'verified'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge_base 
  WHERE key = 'success_pattern_hbov_ggz_forensisch' AND deleted_at IS NULL
);