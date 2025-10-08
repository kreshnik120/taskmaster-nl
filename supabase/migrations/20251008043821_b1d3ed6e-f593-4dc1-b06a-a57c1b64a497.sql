-- Oplossing 4: Backward Compatibility Script
-- Voeg role_tags toe aan 6,925 bestaande knowledge items op basis van category

UPDATE ai_knowledge_base
SET role_tags = CASE category
  -- HR-specifieke categorieën
  WHEN 'hr_verlof' THEN ARRAY['HR']
  WHEN 'hr_ziekmelding' THEN ARRAY['HR']
  WHEN 'hr_functioneringsgesprek' THEN ARRAY['HR']
  WHEN 'hr_onboarding' THEN ARRAY['HR']
  WHEN 'hr_verzuim' THEN ARRAY['HR']
  WHEN 'hr_loonstrook' THEN ARRAY['HR']
  WHEN 'hr_arbeidsvoorwaarden' THEN ARRAY['HR']
  
  -- Bedrijfsgegevens en compliance
  WHEN 'bedrijfsgegevens' THEN ARRAY['Compliance', 'HR']
  
  -- Tarieven en facturatie
  WHEN 'tarieven' THEN ARRAY['Facturatie', 'Sales']
  WHEN 'tarieflijst' THEN ARRAY['Facturatie']
  WHEN 'werkgeverslasten' THEN ARRAY['Facturatie', 'HR']
  
  -- Contracten
  WHEN 'contracten' THEN ARRAY['Facturatie', 'Compliance']
  
  -- Processen en planning
  WHEN 'processen' THEN ARRAY['Planning', 'HR']
  WHEN 'personeelsplanning' THEN ARRAY['Planning', 'HR']
  WHEN 'externe_inhuur_markten' THEN ARRAY['Planning', 'Facturatie']
  
  -- Compliance en wetgeving
  WHEN 'compliance' THEN ARRAY['Compliance', 'HR']
  WHEN 'compliance_swz' THEN ARRAY['Compliance', 'HR']
  WHEN 'wetgeving_swz' THEN ARRAY['Compliance']
  WHEN 'registraties_swz' THEN ARRAY['Compliance', 'HR']
  WHEN 'wettelijke verzekeringen' THEN ARRAY['Compliance', 'Facturatie']
  
  -- ZZP en freelancers
  WHEN 'zzp' THEN ARRAY['HR', 'Compliance']
  WHEN 'zzp_swz' THEN ARRAY['HR', 'Compliance']
  WHEN 'zzp_vereisten' THEN ARRAY['HR', 'Compliance']
  
  -- CAO en arbeidsvoorwaarden
  WHEN 'cao_swz' THEN ARRAY['HR', 'Compliance']
  
  -- Opleidingen
  WHEN 'opleidingseisen' THEN ARRAY['HR', 'Compliance']
  
  -- Klanten
  WHEN 'klantinfo' THEN ARRAY['Sales']
  
  -- Default fallback
  ELSE ARRAY['Compliance']
END
WHERE deleted_at IS NULL
  AND (role_tags IS NULL OR cardinality(role_tags) = 0);