
-- =====================================================
-- BULK TARIEVEN & WTT REGELS TOEVOEGEN
-- Voegt 3 functieniveaus toe per sublocatie (VIG, HBO-V, Begeleider)
-- met ABCzorg tarieven (+5%) en 7 WTT regels per tarief
-- =====================================================

-- STAP 1: Voeg tarieven toe voor alle actieve sublocaties
-- Basis tarieven (CitoZorg standaard):
-- - VIG: €34.00
-- - HBO-V: €42.00  
-- - Begeleider: €38.00
-- ABCzorg tarieven (+5%):
-- - VIG: €35.70
-- - HBO-V: €44.10
-- - Begeleider: €39.90

INSERT INTO hourly_rates (sublocation_id, uursoort_naam, basis_tarief, btw_percentage, kostensoort, is_active)
SELECT 
  cs.id as sublocation_id,
  'VIG' as uursoort_naam,
  35.70 as basis_tarief,
  21.0 as btw_percentage,
  'Bestede tijd' as kostensoort,
  true as is_active
FROM client_sublocations cs
WHERE cs.is_active = true
  AND cs.id NOT IN (
    SELECT sublocation_id 
    FROM hourly_rates 
    WHERE uursoort_naam = 'VIG'
  );

INSERT INTO hourly_rates (sublocation_id, uursoort_naam, basis_tarief, btw_percentage, kostensoort, is_active)
SELECT 
  cs.id as sublocation_id,
  'HBO-V' as uursoort_naam,
  44.10 as basis_tarief,
  21.0 as btw_percentage,
  'Bestede tijd' as kostensoort,
  true as is_active
FROM client_sublocations cs
WHERE cs.is_active = true
  AND cs.id NOT IN (
    SELECT sublocation_id 
    FROM hourly_rates 
    WHERE uursoort_naam = 'HBO-V'
  );

INSERT INTO hourly_rates (sublocation_id, uursoort_naam, basis_tarief, btw_percentage, kostensoort, is_active)
SELECT 
  cs.id as sublocation_id,
  'Begeleider' as uursoort_naam,
  39.90 as basis_tarief,
  21.0 as btw_percentage,
  'Bestede tijd' as kostensoort,
  true as is_active
FROM client_sublocations cs
WHERE cs.is_active = true
  AND cs.id NOT IN (
    SELECT sublocation_id 
    FROM hourly_rates 
    WHERE uursoort_naam = 'Begeleider'
  );

-- STAP 2: Voeg WTT regels toe voor alle tarieven
-- 7 standaard dagtypes met realistische toeslagen

-- Werkdag dag (06:00-18:00): 0% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Werkdag dag' as dagtype,
  '06:00:00' as tijd_van,
  '18:00:00' as tijd_tot,
  0.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Werkdag dag'
);

-- Werkdag avond (18:00-23:00): 15% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Werkdag avond' as dagtype,
  '18:00:00' as tijd_van,
  '23:00:00' as tijd_tot,
  15.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Werkdag avond'
);

-- Werkdag nacht (23:00-06:00): 20% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Werkdag nacht' as dagtype,
  '23:00:00' as tijd_van,
  '06:00:00' as tijd_tot,
  20.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Werkdag nacht'
);

-- Zaterdag (00:00-24:00): 20% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Zaterdag' as dagtype,
  '00:00:00' as tijd_van,
  '23:59:59' as tijd_tot,
  20.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Zaterdag'
);

-- Zondag (00:00-24:00): 20% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Zondag' as dagtype,
  '00:00:00' as tijd_van,
  '23:59:59' as tijd_tot,
  20.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Zondag'
);

-- Feestdag (00:00-24:00): 20% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Feestdag' as dagtype,
  '00:00:00' as tijd_van,
  '23:59:59' as tijd_tot,
  20.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Feestdag'
);

-- Kerstavond (16:00-24:00): 15% toeslag
INSERT INTO wtt_rules (hourly_rate_id, dagtype, tijd_van, tijd_tot, wtt_percentage)
SELECT 
  hr.id as hourly_rate_id,
  'Kerstavond' as dagtype,
  '16:00:00' as tijd_van,
  '23:59:59' as tijd_tot,
  15.0 as wtt_percentage
FROM hourly_rates hr
WHERE NOT EXISTS (
  SELECT 1 FROM wtt_rules wr 
  WHERE wr.hourly_rate_id = hr.id 
  AND wr.dagtype = 'Kerstavond'
);
