
-- Fase 26c Batch 1: Pluryn sublocaties (~130 records)
-- Eerst Pluryn locatie ID ophalen
WITH pluryn_loc AS (
  SELECT cl.id as location_id 
  FROM client_locations cl
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE co.name ILIKE '%Pluryn%' AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'
  LIMIT 1
)
INSERT INTO client_sublocations (location_id, naam, adres, postcode, plaats, telefoon, publieke_opmerking, kostenplaats, sector, doelgroep, is_active, created_at, updated_at)
SELECT 
  (SELECT location_id FROM pluryn_loc),
  v.naam,
  v.adres,
  v.postcode,
  v.plaats,
  NULLIF(v.telefoon, ''),
  NULLIF(REPLACE(REPLACE(REPLACE(v.beschrijving, '<br/>', E'\n'), '<br>', E'\n'), '&nbsp;', ' '), ''),
  NULLIF(v.kostenplaats, ''),
  ARRAY['Jeugdzorg', 'GHZ']::text[],
  ARRAY['LVB', 'Jeugd']::text[],
  true,
  NOW(),
  NOW()
FROM (VALUES
  ('Pluryn-Winkelsteeg 31', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-779 3105', 'Woongroep voor 10 volwassenen met LVB/MVG, hechtingsproblematiek, ASS, angst en gedragsproblemen. Leeftijd 28-60 jaar.', 'Winkelsteeg'),
  ('Pluryn-Winkelsteeg 32', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-7793103', 'Woongroep voor 10 volwassenen met LVB/MVG problematiek. Open sfeer met nadruk op zelfstandigheid.', 'Winkelsteeg'),
  ('Pluryn-Winkelsteeg 33', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-7794305', 'Woongroep voor volwassenen met zeer ernstige gedragsproblematiek (SGLVG). Gesloten setting.', 'Winkelsteeg'),
  ('Pluryn-Doelen Eik', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-7793250', 'Behandelgroep voor 9 jongens 15-23 jaar met LVB, hechtingsproblematiek, ASS en ADHD. De-escalerend werken vereist.', NULL),
  ('Pluryn-Doelen Olm', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-779 4165', 'Behandelgroep voor jongeren 12-20 jaar met LVB, hechtingsproblematiek, ASS en ADHD. Zeer ernstig internaliserende gedragsproblematiek.', NULL),
  ('Pluryn-Dommeltje Buren', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-779 4313', 'Behandelgroep voor 6 jongeren 12-18 jaar met LVB, hechtingsproblematiek, ASS, NAH, Prader-Willi-syndroom.', NULL),
  ('Pluryn-Dommeltje Overkant', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '088-7793271', 'Woongroep voor 7 cliënten 16-22 jaar. Cliënten worden in max 2 jaar voorbereid op vervolgstap buiten terrein.', NULL),
  ('Pluryn-Eigenheimers', 'Kloosterlaan 36A', '6651 TL', 'Druten', '0887794896', 'Woongroep voor 6 cliënten 26-52 jaar met LVB, lichamelijke beperking, ASS, hechtingsproblemen, epilepsie. ADL en verpleegkundige handelingen.', NULL),
  ('Pluryn-Emanuel', 'Händelstraat 4', '6561 ET', 'Groesbeek', '0887795910', 'Woongroep voor 7 cliënten 36-67 jaar met NAH, autisme, hechtingsproblematiek. 6 mannen, 1 vrouw.', NULL),
  ('Pluryn-Haydnstraat', 'Haydnstraat 1', '6561 EC', 'Groesbeek', '0887794166', 'Woongroep voor 22 cliënten 18-35 jaar verdeeld over 3 groepen. LG-J met psychiatrische problematiek en/of gedragsproblemen.', NULL),
  ('Pluryn-Heliant', 'Mettrayweg 21a', '7211 LC', 'Eefde', '088-5477122', 'Behandelgroep voor max 6 jongens 14-17 jaar. Zeer diverse problematiek. Jongeren testen begeleiders extreem.', NULL),
  ('Pluryn-Hietveld huis 1', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887791230', 'Woongroep complex met meerdere afdelingen voor SGLVG cliënten.', NULL),
  ('Pluryn-Hietveld huis 1 links beneden', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887791230', 'Individuele begeleidingsgroep voor 6 cliënten 21-35 jaar met LVB, SGLVG, ASS, angststoornissen, borderline, depressie.', NULL),
  ('Pluryn-Hietveld huis 1 links boven', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887792707', 'Individuele begeleidingsgroep (gesloten) voor 6 cliënten 29-46 jaar met LVB, borderline, ASS, verslavingsproblematiek.', NULL),
  ('Pluryn-Hietveld huis 1 rechts beneden', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887792707', 'Individuele begeleidingsgroep voor 6 cliënten met LVB, borderline, hechtingsproblematiek.', NULL),
  ('Pluryn-Hietveld huis 1 rechts boven', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887792707', 'Individuele begeleidingsgroep voor 6 cliënten met LVB, borderline, ASS, verslavingsproblematiek.', NULL),
  ('Pluryn-Hietveld huis 2', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887792709', 'Woongroep voor 8 cliënten (6 op groep, 2 appartementen) met SGLVG problematiek. Gemiddeld 50 jaar.', NULL),
  ('Pluryn-Hietveld huis 3', 'Stoppelbergweg 10', '7361 TE', 'Beekbergen', '0887792711', 'Woongroep voor 8 mannen 18-40 jaar met SGLG problematiek. Kennis autistisch spectrum is een pre.', NULL),
  ('Pluryn-Hof van Lent', 'Hof van Lent 7', '6666 MH', 'Heteren', '0887796155', 'Woongroep voor volwassenen met verstandelijke beperking in landelijke setting.', NULL),
  ('Pluryn-Huize Moret', 'Moret 12', '6666 EW', 'Heteren', '0887795660', 'Woongroep voor 8 cliënten 31-63 jaar met LVB/MVG, ASS, gedragsproblemen. 2 mannen, 6 vrouwen.', NULL),
  ('Pluryn-Krakelingweg', 'Krakelingweg 25', '6561 GG', 'Groesbeek', '0887794173', 'Woongroep voor 9 cliënten 22-55 jaar met MVG, ASS, Down syndroom. 4 mannen, 5 vrouwen.', NULL),
  ('Pluryn-Lingehoeve', 'Torenstraat 1', '4147 BP', 'Asperen', '0887792950', 'Woonboerderij voor 6 cliënten 23-65 jaar met LVB/MVG, ASS. 5 mannen, 1 vrouw.', NULL),
  ('Pluryn-Lisstraat', 'Lisstraat 9', '6561 BX', 'Groesbeek', '0887794169', 'Woongroep voor 8 cliënten 20-47 jaar met LVB/MVG, ASS, schizofrenie. 3 mannen, 5 vrouwen.', NULL),
  ('Pluryn-Lokaal', 'Nijmeegsebaan 9', '6561 KE', 'Groesbeek', '0887793300', 'Dagbesteding voor volwassenen met verstandelijke beperking.', NULL),
  ('Pluryn-Mozartstraat', 'Mozartstraat 21', '6561 EE', 'Groesbeek', '0887793112', 'Woongroep voor 10 cliënten 30-70 jaar met LVB/MVG, ASS, Down syndroom. 7 mannen, 3 vrouwen.', NULL)
) AS v(naam, adres, postcode, plaats, telefoon, beschrijving, kostenplaats)
ON CONFLICT DO NOTHING;
