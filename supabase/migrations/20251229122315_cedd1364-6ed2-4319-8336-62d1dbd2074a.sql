-- ============================================
-- MIGREER HARDCODED FAST PATH PATTERNS NAAR DATABASE
-- ============================================
-- Doel: Alle hardcoded patterns krijgen een database entry zodat ze 
-- profiteren van de feedback loop (confidence updates, popularity tracking)
-- Source: 'hardcoded_backup' (allowed by existing constraint)

-- Default org_id (ABCzorg)
DO $$
DECLARE
  v_org_id UUID := '550e8400-e29b-41d4-a716-446655440000';
BEGIN
  -- ═══════════════════════════════════════════════════════════════════
  -- SIMPELE SECTOR FILTERS
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO fast_path_patterns (
    org_id, pattern_type, table_name, count_column, keywords, filters, active_filter,
    response_template, emoji, confidence_score, is_active, source, learned_from_query
  ) VALUES
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'ggz', 'locaties'],
     '[{"column": "sector", "value": "GGZ", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve GGZ werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel GGZ locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'ghz', 'locaties'],
     '[{"column": "sector", "value": "GHZ", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve GHZ werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel GHZ locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'vvt', 'locaties'],
     '[{"column": "sector", "value": "VVT", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve VVT werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel VVT locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'jeugdzorg', 'locaties'],
     '[{"column": "sector", "value": "Jeugdzorg", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Jeugdzorg werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Jeugdzorg locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'ouderenzorg', 'locaties'],
     '[{"column": "sector", "value": "Ouderenzorg", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Ouderenzorg werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Ouderenzorg locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'gehandicaptenzorg', 'locaties'],
     '[{"column": "sector", "value": "Gehandicaptenzorg", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Gehandicaptenzorg werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Gehandicaptenzorg locaties'),
     
    -- GGZ locaties (zonder prefix)
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['ggz', 'locaties'],
     '[{"column": "sector", "value": "GGZ", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve GGZ werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'GGZ locaties')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════
  -- DOELGROEP FILTERS
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO fast_path_patterns (
    org_id, pattern_type, table_name, count_column, keywords, filters, active_filter,
    response_template, emoji, confidence_score, is_active, source, learned_from_query
  ) VALUES
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'lvb', 'locaties'],
     '[{"column": "doelgroep", "value": "LVB", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve LVB werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel LVB locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'autisme', 'locaties'],
     '[{"column": "doelgroep", "value": "Autisme", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Autisme werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Autisme locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'psychiatrie', 'locaties'],
     '[{"column": "doelgroep", "value": "Psychiatrie", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Psychiatrie werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Psychiatrie locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'nah', 'locaties'],
     '[{"column": "doelgroep", "value": "NAH", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve NAH werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel NAH locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'emb', 'locaties'],
     '[{"column": "doelgroep", "value": "EMB", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve EMB werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel EMB locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'verslaving', 'locaties'],
     '[{"column": "doelgroep", "value": "Verslaving", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Verslaving werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Verslaving locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'dementie', 'locaties'],
     '[{"column": "doelgroep", "value": "Dementie", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Dementie werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Dementie locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'ouderen', 'locaties'],
     '[{"column": "doelgroep", "value": "Ouderen", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve Ouderen werklocaties.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel Ouderen locaties')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════
  -- BASIS COUNT PATTERNS (geen filters)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO fast_path_patterns (
    org_id, pattern_type, table_name, count_column, keywords, filters, active_filter,
    response_template, emoji, confidence_score, is_active, source, learned_from_query
  ) VALUES
    -- Werklocaties basis
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'werklocaties'],
     '[]'::jsonb, true, '📍 Er zijn **{{count}}** actieve werklocaties in het systeem.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel werklocaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'locaties'],
     '[]'::jsonb, true, '📍 Er zijn **{{count}}** actieve werklocaties in het systeem.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel locaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['aantal', 'werklocaties'],
     '[]'::jsonb, true, '📍 Er zijn **{{count}}** actieve werklocaties in het systeem.', '📍', 1.0, true, 'hardcoded_backup', 'aantal werklocaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['tel', 'werklocaties'],
     '[]'::jsonb, true, '📍 Er zijn **{{count}}** actieve werklocaties in het systeem.', '📍', 1.0, true, 'hardcoded_backup', 'tel werklocaties'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['totaal', 'werklocaties'],
     '[]'::jsonb, true, '📍 Er zijn **{{count}}** actieve werklocaties in het systeem.', '📍', 1.0, true, 'hardcoded_backup', 'totaal werklocaties'),

    -- Professionals basis
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'professionals'],
     '[]'::jsonb, false, '👥 Er zijn **{{count}}** professionals geregistreerd in het systeem.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel professionals'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'zzp'],
     '[{"column": "werkvorm", "value": "ZZP", "operator": "ilike"}]'::jsonb, false, '👥 Er zijn **{{count}}** ZZP professionals geregistreerd.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel ZZP professionals'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'uitzendkrachten'],
     '[{"column": "werkvorm", "value": "Uitzend", "operator": "ilike"}]'::jsonb, false, '👥 Er zijn **{{count}}** uitzendkracht professionals geregistreerd.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel uitzendkrachten'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['aantal', 'professionals'],
     '[]'::jsonb, false, '👥 Er zijn **{{count}}** professionals geregistreerd in het systeem.', '👥', 1.0, true, 'hardcoded_backup', 'aantal professionals'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['tel', 'professionals'],
     '[]'::jsonb, false, '👥 Er zijn **{{count}}** professionals geregistreerd in het systeem.', '👥', 1.0, true, 'hardcoded_backup', 'tel professionals'),

    -- Sollicitaties basis
    (v_org_id, 'count', 'professional_applications', 'id',
     ARRAY['hoeveel', 'sollicitaties'],
     '[]'::jsonb, false, '📋 Er zijn **{{count}}** sollicitaties in het systeem.', '📋', 1.0, true, 'hardcoded_backup', 'hoeveel sollicitaties'),
     
    (v_org_id, 'count', 'professional_applications', 'id',
     ARRAY['aantal', 'sollicitaties'],
     '[]'::jsonb, false, '📋 Er zijn **{{count}}** sollicitaties in het systeem.', '📋', 1.0, true, 'hardcoded_backup', 'aantal sollicitaties'),
     
    (v_org_id, 'count', 'professional_applications', 'id',
     ARRAY['tel', 'sollicitaties'],
     '[]'::jsonb, false, '📋 Er zijn **{{count}}** sollicitaties in het systeem.', '📋', 1.0, true, 'hardcoded_backup', 'tel sollicitaties'),
     
    (v_org_id, 'count', 'professional_applications', 'id',
     ARRAY['hoeveel', 'kandidaten'],
     '[]'::jsonb, false, '📋 Er zijn **{{count}}** kandidaten in het systeem.', '📋', 1.0, true, 'hardcoded_backup', 'hoeveel kandidaten'),

    -- Klanten/organisaties basis
    (v_org_id, 'count', 'client_organizations', 'id',
     ARRAY['hoeveel', 'klanten'],
     '[]'::jsonb, false, '🏢 Er zijn **{{count}}** klantorganisaties geregistreerd.', '🏢', 1.0, true, 'hardcoded_backup', 'hoeveel klanten'),
     
    (v_org_id, 'count', 'client_organizations', 'id',
     ARRAY['hoeveel', 'organisaties'],
     '[]'::jsonb, false, '🏢 Er zijn **{{count}}** klantorganisaties geregistreerd.', '🏢', 1.0, true, 'hardcoded_backup', 'hoeveel organisaties'),
     
    (v_org_id, 'count', 'client_organizations', 'id',
     ARRAY['aantal', 'klanten'],
     '[]'::jsonb, false, '🏢 Er zijn **{{count}}** klantorganisaties geregistreerd.', '🏢', 1.0, true, 'hardcoded_backup', 'aantal klanten'),
     
    (v_org_id, 'count', 'client_organizations', 'id',
     ARRAY['tel', 'klanten'],
     '[]'::jsonb, false, '🏢 Er zijn **{{count}}** klantorganisaties geregistreerd.', '🏢', 1.0, true, 'hardcoded_backup', 'tel klanten'),

    -- Plaatsingen basis
    (v_org_id, 'count', 'assignments', 'id',
     ARRAY['hoeveel', 'plaatsingen'],
     '[]'::jsonb, false, '✅ Er zijn **{{count}}** plaatsingen in het systeem.', '✅', 1.0, true, 'hardcoded_backup', 'hoeveel plaatsingen'),
     
    (v_org_id, 'count', 'assignments', 'id',
     ARRAY['aantal', 'plaatsingen'],
     '[]'::jsonb, false, '✅ Er zijn **{{count}}** plaatsingen in het systeem.', '✅', 1.0, true, 'hardcoded_backup', 'aantal plaatsingen'),
     
    (v_org_id, 'count', 'assignments', 'id',
     ARRAY['tel', 'plaatsingen'],
     '[]'::jsonb, false, '✅ Er zijn **{{count}}** plaatsingen in het systeem.', '✅', 1.0, true, 'hardcoded_backup', 'tel plaatsingen'),
     
    (v_org_id, 'count', 'assignments', 'id',
     ARRAY['hoeveel', 'opdrachten'],
     '[]'::jsonb, false, '✅ Er zijn **{{count}}** opdrachten in het systeem.', '✅', 1.0, true, 'hardcoded_backup', 'hoeveel opdrachten')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════
  -- PLAATS FILTERS (werklocaties in specifieke stad)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO fast_path_patterns (
    org_id, pattern_type, table_name, count_column, keywords, filters, active_filter,
    response_template, emoji, confidence_score, is_active, source, learned_from_query
  ) VALUES
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'werklocaties', 'amsterdam'],
     '[{"column": "plaats", "value": "Amsterdam", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Amsterdam.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel werklocaties in Amsterdam'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'locaties', 'amsterdam'],
     '[{"column": "plaats", "value": "Amsterdam", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Amsterdam.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel locaties in Amsterdam'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['werklocaties', 'amsterdam'],
     '[{"column": "plaats", "value": "Amsterdam", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Amsterdam.', '📍', 1.0, true, 'hardcoded_backup', 'werklocaties in Amsterdam'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'werklocaties', 'rotterdam'],
     '[{"column": "plaats", "value": "Rotterdam", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Rotterdam.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel werklocaties in Rotterdam'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'werklocaties', 'utrecht'],
     '[{"column": "plaats", "value": "Utrecht", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Utrecht.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel werklocaties in Utrecht'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'werklocaties', 'arnhem'],
     '[{"column": "plaats", "value": "Arnhem", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Arnhem.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel werklocaties in Arnhem'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'werklocaties', 'nijmegen'],
     '[{"column": "plaats", "value": "Nijmegen", "operator": "ilike"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties in Nijmegen.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel werklocaties in Nijmegen')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════
  -- GEZOCHTE FUNCTIES FILTERS
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO fast_path_patterns (
    org_id, pattern_type, table_name, count_column, keywords, filters, active_filter,
    response_template, emoji, confidence_score, is_active, source, learned_from_query
  ) VALUES
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'locaties', 'zoeken', 'begeleider'],
     '[{"column": "gezochte_functies", "value": "Begeleider", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties die Begeleiders zoeken.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel locaties zoeken Begeleider'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'locaties', 'zoeken', 'vig'],
     '[{"column": "gezochte_functies", "value": "VIG", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties die VIG zoeken.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel locaties zoeken VIG'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'locaties', 'zoeken', 'verpleegkundige'],
     '[{"column": "gezochte_functies", "value": "Verpleegkundige", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties die Verpleegkundiges zoeken.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel locaties zoeken Verpleegkundige'),
     
    (v_org_id, 'count', 'client_sublocations', 'id',
     ARRAY['hoeveel', 'locaties', 'zoeken', 'verzorgende'],
     '[{"column": "gezochte_functies", "value": "Verzorgende", "operator": "contains"}]'::jsonb,
     true, '📍 Er zijn **{{count}}** actieve werklocaties die Verzorgenden zoeken.', '📍', 1.0, true, 'hardcoded_backup', 'hoeveel locaties zoeken Verzorgende')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════
  -- PROFESSIONALS MET PROVINCIE/PLAATS FILTERS
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO fast_path_patterns (
    org_id, pattern_type, table_name, count_column, keywords, filters, active_filter,
    response_template, emoji, confidence_score, is_active, source, learned_from_query
  ) VALUES
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'professionals', 'gelderland'],
     '[{"column": "provincie", "value": "Gelderland", "operator": "ilike"}]'::jsonb,
     false, '👥 Er zijn **{{count}}** professionals in provincie Gelderland.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel professionals in Gelderland'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'professionals', 'noord-holland'],
     '[{"column": "provincie", "value": "Noord-Holland", "operator": "ilike"}]'::jsonb,
     false, '👥 Er zijn **{{count}}** professionals in provincie Noord-Holland.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel professionals in Noord-Holland'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'professionals', 'amsterdam'],
     '[{"column": "woonplaats", "value": "Amsterdam", "operator": "ilike"}]'::jsonb,
     false, '👥 Er zijn **{{count}}** professionals woonachtig in Amsterdam.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel professionals in Amsterdam'),
     
    (v_org_id, 'count', 'professionals', 'id',
     ARRAY['hoeveel', 'professionals', 'rotterdam'],
     '[{"column": "woonplaats", "value": "Rotterdam", "operator": "ilike"}]'::jsonb,
     false, '👥 Er zijn **{{count}}** professionals woonachtig in Rotterdam.', '👥', 1.0, true, 'hardcoded_backup', 'hoeveel professionals in Rotterdam')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Hardcoded Fast Path patterns successfully migrated to database with source=hardcoded_backup';
END $$;

-- Add comment explaining migration purpose
COMMENT ON TABLE fast_path_patterns IS 'Stores Fast Path query patterns for count queries. Includes learned patterns (source=auto_learned) and migrated hardcoded patterns (source=hardcoded_backup). All patterns benefit from feedback loop for confidence updates.';