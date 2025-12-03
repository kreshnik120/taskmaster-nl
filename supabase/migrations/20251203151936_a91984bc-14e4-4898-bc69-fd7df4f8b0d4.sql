
-- Fase 26c Batch 3: Dimence, ORO, Leger des Heils, Rosales, s'Heeren Loo

-- DIMENCE sublocaties
WITH dimence_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Dimence%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, kostenplaats, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM dimence_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving, v.kostenplaats,
  ARRAY['GGZ']::text[], ARRAY['Psychiatrie']::text[], true, NOW(), NOW()
FROM (VALUES
  ('HIC Deventer', 'Nico Bolkesteinlaan 65', '7416 SE', 'Deventer', '0570-639242', 'High Intensive Care voor cliënten in crisis. Gesloten afdeling, kortdurende crisis opname. FACT-team verwijst. BHV & ASV vereist.', '51504'),
  ('HIC Westerdok Almelo', 'Haven Noordzijde 45', '7607 ES', 'Almelo', '0546-684010', 'HIC in gesloten omgeving. 24-uurs zorg voor cliënten met psychiatrische stoornis. Geen separeer maar intensive care unit.', '50507'),
  ('HIC Zwolle', 'Eerdelaan 45', '8043 RR', 'Zwolle', '038-4692005', 'High Intensive Care voor max 16 cliënten 18-65 jaar in crisis. Depressie, psychose, schizofrenie, persoonlijkheidsstoornis.', '400'),
  ('Stadskliniek Almelo Brugstraat', 'Brugstraat 33', '7607 XJ', 'Almelo', '0546-548091', 'Voortgezette behandeling voor EPA met complexe hulpvraag. Steunend Relationeel Handelen (SRH).', '50705'),
  ('Stadskliniek Almelo Klokkenbelt', 'Klokkenbelt 89', '7602 AG', 'Almelo', '0546-548091', 'Voortgezette behandeling voor kwetsbare mensen met EPA. WLZ wonen met 12 plaatsen.', '58150'),
  ('Stadskliniek Zwolle', 'Eerdelaan 45', '8043 WG', 'Zwolle', '038-4691400', 'Complexe psychiatrische problematiek. 20 appartementen. Behandelduur max 3 jaar.', '750'),
  ('Open High Care Deventer', 'Nico Bolkesteinlaan 65', '7416 SE', 'Deventer', '0570-639250', 'Open afdeling voor stabilisatie na crisis.', '51505'),
  ('FACT Noord Deventer', 'Nico Bolkesteinlaan 65', '7416 SE', 'Deventer', '0570-639260', 'Ambulant FACT-team voor cliënten met EPA.', '51510')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving, kostenplaats)
ON CONFLICT DO NOTHING;

-- ORO sublocaties
WITH oro_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%ORO%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, kostenplaats, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM oro_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving, v.kostenplaats,
  ARRAY['GHZ']::text[], ARRAY['LVB', 'MVG']::text[], true, NOW(), NOW()
FROM (VALUES
  ('Hoge Hees', 'Schoolstraat 25d', '5741CT', 'Beek en Donk', '0492-530053', 'Woonvoorziening voor 29 cliënten met matige tot ernstige verstandelijke en lichamelijke beperking. Autisme, Down syndroom, epilepsie, dementie.', '7550'),
  ('Steengoed', 'Steengoed 2', '5761 GV', 'Bakel', '0492-530053', 'Woonvoorziening voor jeugd 0-25 jaar met verstandelijke beperking. 2 groepswoningen, studios, appartementen. Hechtingsproblematiek, autisme, ADHD.', '6041'),
  ('Nachtdienst Gemert', 'Keizersbosch 28', '5421 EN', 'Gemert', '0492-530053', 'Nachtdienstlocatie voor cliënten ORO Gemert.', 'Nachtdienst Gemert'),
  ('Nachtdienst Rijtven Deurne', 'Den Dreef 13', '5751NS', 'Deurne', '0492-530053', 'Nachtdienstlocatie Rijtven in Deurne.', '6470 Nachtdienst Rijtven'),
  ('De Lage Hees', 'Schoolstraat 25', '5741CT', 'Beek en Donk', '0492-530053', 'Dagbesteding bij Hoge Hees complex.', '7551')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving, kostenplaats)
ON CONFLICT DO NOTHING;

-- LEGER DES HEILS sublocaties
WITH ldh_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Leger des Heils%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, kostenplaats, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM ldh_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving, v.kostenplaats,
  ARRAY['GGZ', 'Maatschappelijke opvang']::text[], ARRAY['Psychiatrie', 'Verslaving']::text[], true, NOW(), NOW()
FROM (VALUES
  ('1 op 1 begeleiding Utrecht', 'Heijcopperkade 2B', '3545 NL', 'Utrecht', '0618710360', '1 op 1 begeleiding 14:00-22:00 uur.', '013701'),
  ('Opvang Amsterdam', 'Oudezijds Voorburgwal 101', '1012 EL', 'Amsterdam', '020-6240600', '24-uurs opvang voor daklozen en verslaafden.', 'Amsterdam'),
  ('Opvang Rotterdam', 'Schiedamsedijk 100', '3011 EN', 'Rotterdam', '010-4130600', 'Maatschappelijke opvang Rotterdam.', 'Rotterdam'),
  ('Opvang Eindhoven', 'Willemstraat 50', '5611 HE', 'Eindhoven', '040-2440600', 'Opvang en begeleiding voor kwetsbare volwassenen.', 'Eindhoven')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving, kostenplaats)
ON CONFLICT DO NOTHING;

-- ROSALES sublocaties
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, sector, doelgroep, is_active, created_at, updated_at)
SELECT 'b1000000-0000-0000-0000-000000000036', v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving,
  ARRAY['Jeugdzorg']::text[], ARRAY['LVB', 'Jeugd']::text[], true, NOW(), NOW()
FROM (VALUES
  ('Casus D. Drachten', 'De Hoven 4', '9204 WG', 'Drachten', '0618710360', 'Begeleidersprofiel voor Danillo (09:00-21:00). Kennis LVB, ODD, ADHD, PTSS, WZD, gedragsregulerende medicatie.'),
  ('Casus R. Drachten', 'De Hoven 4', '9204 WG', 'Drachten', '0618710360', 'Begeleidersprofiel voor Riemer (7:00-22:30). Kennis LVB, ODD, middelengebruik.'),
  ('Begeleiding Dalen', 'Reindersdijk', '7751 SH', 'Dalen', NULL, '1 op 1 begeleiding voor jongen 17 jaar in Center Parcs de Huttenheugte. Zachte aanpak.'),
  ('Client A Ijhorst', 'Veldhuisweg', '7955 PP', 'Ijhorst', NULL, '16 jarige jongen met gedragsproblematiek. Kan fysieke agressie laten zien. Duidelijke grenzen stellen.'),
  ('Gezinsondersteuning Rheden', 'Groenestraat', '6882 KR', 'Rheden', NULL, '2 op 5 gezinsondersteuning. Vader met 5 kinderen (2-11 jaar). Opvoedondersteuning.'),
  ('Casus N Wanneperveen', 'Veneweg', 'nnb', 'Wanneperveen', NULL, '1 op 1 begeleiding casus Naoufal.')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving)
ON CONFLICT DO NOTHING;

-- s'HEEREN LOO sublocaties
WITH shl_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Heeren%Loo%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM shl_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving,
  ARRAY['GHZ']::text[], ARRAY['LVB', 'MVG', 'EVG']::text[], true, NOW(), NOW()
FROM (VALUES
  ('Hoofdkantoor Amersfoort', 'Berkenweg 11', '3818 LA', 'Amersfoort', '0800-3555555', 'Hoofdkantoor s Heeren Loo. Landelijke organisatie voor gehandicaptenzorg.'),
  ('Regio Ermelo', 'Bovenweg 10', '3852 PG', 'Ermelo', '0341-565000', 'Woon- en dagbestedingslocaties in regio Ermelo.'),
  ('Regio Apeldoorn', 'Deventerstraat 50', '7311 LZ', 'Apeldoorn', '055-5268000', 'Woon- en dagbestedingslocaties in regio Apeldoorn.'),
  ('Regio Zwolle', 'Burg. Roelenweg 7', '8021 EW', 'Zwolle', '038-4217000', 'Woon- en dagbestedingslocaties in regio Zwolle.'),
  ('Regio Arnhem', 'Velperweg 100', '6824 HK', 'Arnhem', '026-3845000', 'Woon- en dagbestedingslocaties in regio Arnhem.')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving)
ON CONFLICT DO NOTHING;
