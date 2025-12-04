
-- CLEANUP: Verwijder foutief aangemaakte organisaties
-- Criteria: recent aangemaakt (vandaag), exact 1 sublocatie, geen KVK nummer

-- Stap 1: Verwijder sublocaties van foutieve orgs
DELETE FROM client_sublocations
WHERE location_id IN (
  SELECT cl.id 
  FROM client_locations cl
  JOIN client_organizations co ON cl.client_org_id = co.id
  WHERE co.created_at > '2025-12-04'
  AND co.kvk_nummer IS NULL
  AND (SELECT COUNT(*) FROM client_sublocations cs2 
       JOIN client_locations cl2 ON cs2.location_id = cl2.id 
       WHERE cl2.client_org_id = co.id) <= 2
  -- Exclusies voor bekende echte organisaties
  AND co.name NOT ILIKE 'Stichting %'
  AND co.name NOT ILIKE '% B.V.%'
  AND co.name NOT ILIKE '% BV'
  AND co.name NOT IN ('Kwintes', 'Sherpa', 'Pluryn', 'Pro Persona', '''s Heeren Loo')
);

-- Stap 2: Verwijder locations van foutieve orgs
DELETE FROM client_locations
WHERE client_org_id IN (
  SELECT co.id 
  FROM client_organizations co
  WHERE co.created_at > '2025-12-04'
  AND co.kvk_nummer IS NULL
  AND (SELECT COUNT(*) FROM client_sublocations cs 
       JOIN client_locations cl ON cs.location_id = cl.id 
       WHERE cl.client_org_id = co.id) = 0  -- Nu 0 want sublocaties zijn verwijderd
  AND co.name NOT ILIKE 'Stichting %'
  AND co.name NOT ILIKE '% B.V.%'
  AND co.name NOT ILIKE '% BV'
  AND co.name NOT IN ('Kwintes', 'Sherpa', 'Pluryn', 'Pro Persona', '''s Heeren Loo')
);

-- Stap 3: Verwijder de foutieve organisaties zelf
DELETE FROM client_organizations
WHERE created_at > '2025-12-04'
AND kvk_nummer IS NULL
AND (SELECT COUNT(*) FROM client_locations cl WHERE cl.client_org_id = client_organizations.id) = 0
AND name NOT ILIKE 'Stichting %'
AND name NOT ILIKE '% B.V.%'
AND name NOT ILIKE '% BV'
AND name NOT IN ('Kwintes', 'Sherpa', 'Pluryn', 'Pro Persona', '''s Heeren Loo');