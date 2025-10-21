-- FASE 1: Voeg Loondienst Kennis toe
-- Deze migration voegt de missende loondienst inschaalgegevens toe

INSERT INTO ai_knowledge_base (
  org_id,
  user_id,
  category, 
  key, 
  value, 
  confidence_score, 
  validation_status,
  role_tags,
  jurisdiction
) 
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  (SELECT id FROM auth.users LIMIT 1),
  cat,
  k,
  v,
  cs,
  vs,
  rt,
  'NL'
FROM (VALUES
  -- 1. Salarisschaal NV4
  (
    'salarisschalen',
    'loondienst_salarisschaal_begeleider_nv4',
    jsonb_build_object(
      'functieniveau', 'NV4',
      'functiebenaming', 'Begeleider',
      'salarisschaal', '45-55',
      'bruto_minimum', 2800,
      'bruto_maximum', 3600,
      'bruto_ervaring_5jaar', 3200,
      'werkgeverslasten_percentage', 40,
      'totale_kosten_minimum', 3920,
      'totale_kosten_maximum', 5040,
      'totale_kosten_ervaring_5jaar', 4480,
      'toelichting', 'Voor een begeleider op MBO-niveau 4 met 5 jaar ervaring bedraagt het bruto maandsalaris circa €3.200. De werkgever betaalt hier 40% werkgeverslasten bovenop, wat de totale kosten voor de werkgever op €4.480 per maand brengt (exclusief ORT-toeslagen).'
    ),
    1.0,
    'verified',
    ARRAY['HR', 'Facturatie', 'Planning']
  ),

  -- 2. Definitie "Inschalen"
  (
    'hr_begrippen',
    'definitie_inschalen_loondienst',
    jsonb_build_object(
      'begrip', 'Inschalen',
      'betekenis', '"Inschalen" betekent het toekennen van een functie aan een bepaalde salarisschaal binnen de CAO of het salarissysteem van de organisatie. Dit geldt ALLEEN voor medewerkers in loondienst (uitzendkrachten of vaste werknemers). ZZP''ers worden NIET ingeschaald, zij ontvangen een uurtarief op basis van een overeenkomst.',
      'voorbeelden', jsonb_build_object(
        'correct_gebruik', 'Een begeleider NV4 met 5 jaar ervaring inschalen op schaal 50',
        'incorrect_gebruik', 'Een ZZP''er inschalen (ZZP''ers hebben geen salarisschaal)'
      )
    ),
    1.0,
    'verified',
    ARRAY['HR', 'Planning']
  ),

  -- 3. Verschil ZZP vs Loondienst
  (
    'hr_begrippen',
    'verschil_zzp_vs_loondienst',
    jsonb_build_object(
      'loondienst', jsonb_build_object(
        'kenmerken', ARRAY['Salarisschaal', 'Bruto maandsalaris', 'Werkgeverslasten', 'Vast contract of uitzendkracht'],
        'begrippen', ARRAY['Inschalen', 'Schaal', 'FTE', 'CAO']
      ),
      'zzp', jsonb_build_object(
        'kenmerken', ARRAY['Uurtarief', 'Geen salarisschaal', 'Geen werkgeverslasten', 'Opdrachtnemer'],
        'begrippen', ARRAY['Uurtarief', 'ORT-toeslag', 'Factuur', 'Opdracht']
      ),
      'regel', 'Gebruik "inschalen" ALLEEN bij loondienst. Gebruik "uurtarief" ALLEEN bij ZZP.'
    ),
    1.0,
    'verified',
    ARRAY['HR', 'Planning', 'Facturatie']
  )
) AS new_knowledge(cat, k, v, cs, vs, rt)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_knowledge_base 
  WHERE key IN (
    'loondienst_salarisschaal_begeleider_nv4',
    'definitie_inschalen_loondienst',
    'verschil_zzp_vs_loondienst'
  )
);