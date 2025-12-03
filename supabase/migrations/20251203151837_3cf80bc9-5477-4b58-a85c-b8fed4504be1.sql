
-- Fase 26c Batch 2: Siza, Kentalis, Amarant sublocaties

-- SIZA sublocaties
WITH siza_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Siza%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM siza_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving,
  ARRAY['GHZ']::text[], ARRAY['NAH', 'LVB']::text[], true, NOW(), NOW()
FROM (VALUES
  ('AC De Heuvel (Het Dorp)', 'Dorpsbrink 4', '6813 CD', 'Arnhem', '088-377 95 55', 'Activiteitencentrum op Het Dorp met afdelingen: Schilderen en tekenen, Atelier, Hulpdienst In Klussen (HIK) en Oriëntatie. Goed toegankelijk voor rolstoelgebruikers.'),
  ('Afasiecentrum Arnhem', 'Jachthoornlaan 1', '6813 CD', 'Arnhem', '088-378 14 33', 'Centrum voor mensen met afasie (taalstoornis door hersenletsel). Hulp bij communicatieproblemen.'),
  ('De Mastweg', 'Mastweg 4', '6813 AH', 'Arnhem', '088-377 95 75', 'Woonlocatie voor 14 cliënten met niet-aangeboren hersenletsel met complexe gevolgen, soms gecombineerd met psychiatrische of verslavingsproblemen.'),
  ('Mecanoo', 'Jan Menshof 20-24', '6836 SZ', 'Arnhem', '088-378 01 06', 'Woonlocatie voor 20 jong volwassenen met LVB, autisme en/of psychische problematiek. Eerste stap naar zelfstandigheid.'),
  ('Het Hoge Huis', 'Schorpioenstraat 71', '7323 AZ', 'Apeldoorn', '088-378 01 87', 'Woonlocatie voor 10 cliënten met lichamelijke beperking of NAH. Elk appartement heeft hal, woonkamer, slaapkamer, douche.'),
  ('Vinkenbroek', 'Vinkenbroekseweg 7', '6824 LN', 'Arnhem', '088-377 95 65', 'Woonlocatie voor volwassenen met verstandelijke beperking in groene omgeving.'),
  ('De Waterstraat', 'Waterstraat 2', '6811 KE', 'Arnhem', '088-377 96 50', 'Woonlocatie in het centrum van Arnhem voor zelfstandig wonende cliënten met ondersteuning.')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving)
ON CONFLICT DO NOTHING;

-- KENTALIS sublocaties
WITH kentalis_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Kentalis%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, kostenplaats, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM kentalis_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving, v.kostenplaats,
  ARRAY['GHZ']::text[], ARRAY['Doof', 'CMB']::text[], true, NOW(), NOW()
FROM (VALUES
  ('Active Wacht', 'Theerestraat 42', '5271GD', 'Sint-Michielsgestel', '073-5589160', 'Nachtzorg (actief) voor 130 cliënten met verschillende hulpvragen. Ondersteunen en begeleiden. BHV vereist.', '1661'),
  ('Atelier Berlicum', 'Hoogstraat 121f', '5258 BC', 'Berlicum', '06-53240428', 'Dagbestedingslocatie voor deelnemers met auditieve, communicatieve en verstandelijke beperking. Creatieve activiteiten, producten verkocht in winkel.', '1666'),
  ('Nieuw Beekvliet A', 'Valklaan 2', '5272 RZ', 'Sint-Michielsgestel', '06-13323393', 'Woongroep voor 8 volwassenen 36-63 jaar met communicatieve meervoudige beperking (CMB) en/of Doofblindheid. Diverse communicatiemiddelen.', '1641'),
  ('Nieuw Beekvliet B', 'Valklaan 2', '5272 RZ', 'Sint-Michielsgestel', '06-13323343', 'Woongroep voor 8 volwassenen 30-58 jaar met CMB en/of Doofblindheid. Helft heeft DB vastgesteld.', '1642'),
  ('Ronde Toren', 'Theerestraat 42', '5271GD', 'Sint-Michielsgestel', '06-13323343', 'Woonlocatie voor volwassenen met auditieve en verstandelijke beperking.', '1650'),
  ('Vierkante Toren', 'Theerestraat 42', '5271GD', 'Sint-Michielsgestel', '06-13323343', 'Woonlocatie voor volwassenen met auditieve en verstandelijke beperking.', '1651'),
  ('De Wende', 'Hoogstraat 21', '5271AR', 'Sint-Michielsgestel', '073-5589160', 'Dagbesteding en activiteiten voor cliënten met auditieve beperking.', '1660')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving, kostenplaats)
ON CONFLICT DO NOTHING;

-- AMARANT sublocaties
WITH amarant_loc AS (
  SELECT cl.id as location_id FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Amarant%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, kostenplaats, sector, doelgroep, is_active, created_at, updated_at)
SELECT (SELECT location_id FROM amarant_loc), v.naam, v.adres, v.postcode, v.plaats, NULLIF(v.telefoon, ''), v.beschrijving, v.kostenplaats,
  ARRAY['GHZ']::text[], ARRAY['LVB', 'MVG']::text[], true, NOW(), NOW()
FROM (VALUES
  ('Pastoor Pottersplein Breda', 'pastoor Pottersplein 14', '4815 BC', 'Breda', '0886111080', 'Woongroep voor 14 cliënten LVB+ (SGLVB) 40-82 jaar met complexe zorgvragen, traumatisch verleden, psychische problemen. 24-uurs begeleiding.', '61700'),
  ('Spiegelstraat Breda', 'Spiegelstraat 7', '4812 LE', 'Breda', '088-6110330', 'Woongroep voor volwassenen 20-60 jaar met LVB-P. Begeleiding achter de deur met gezamenlijke koffiemomenten.', '61760'),
  ('Annemarie van Schurmanstraat Rijen', 'Annemarie van Schurmanstraat 6', '5122 CR', 'Rijen', '088-6110590', 'Woongroep voor 6 cliënten 26-57 jaar met LVG-MVG en NAH. Tillift, medicatie, epilepsie, diabetes zorg.', '29500'),
  ('Hofke 3 Rijsbergen', 'Hofke 3', '4891 NT', 'Rijsbergen', '0886117621', 'Woongroep voor cliënten 18-57 jaar met SGEVG, autisme spectrum. Verbale en fysieke agressie mogelijk. Nooit alleen werken.', '50220'),
  ('Hofke 4 Rijsbergen', 'Hofke 4', '4891 NT', 'Rijsbergen', '0886117622', 'Woongroep aansluitend bij Hofke 3 complex.', '50220'),
  ('Nachtzorg Hooge Veer', 'Conservatoriumlaan 70', '5037 DT', 'Tilburg', '088-6112352', 'Nachtzorg voor alle leeftijden en doelgroepen. Samen met vaste collega begeleiding en lichamelijke verzorging.', '24110'),
  ('Stek Breda', 'Twikkelstraat 85', '4834 LL', 'Breda', '088-6110950', 'Behandelgroep voor 9 jeugdigen 5-18 jaar. Samenwerking met thuissituatie. Traumatherapie, stabilisatie, emotieregulatie.', '74220'),
  ('De Elf', 'Kerkstraat 11', '5126 GC', 'Gilze', '088-6110750', 'Woongroep voor volwassenen met LVB problematiek.', '50230'),
  ('Lindenburg', 'Lindenburgstraat 10', '5051 ST', 'Goirle', '088-6110850', 'Woongroep voor volwassenen met LVB en gedragsproblematiek.', '50240')
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving, kostenplaats)
ON CONFLICT DO NOTHING;
