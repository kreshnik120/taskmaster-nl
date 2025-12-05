-- FIX 2: Update existing experts with expanded certificate synonyms
-- FIX 4: Update existing experts with expanded keywords
-- FIX 6: Add 4 new experts (LVB, Dementie, Palliatief, Jeugd)

-- Update ASS Expert with expanded synonyms
UPDATE specialisme_expert_knowledge 
SET 
  vereiste_certificaten = ARRAY[
    'Autisme specialist', 'Triple-C certificaat', 'Prikkelarm werken',
    'ASS begeleiding', 'Autisme training', 'TEACCH certificaat'
  ],
  vereiste_ervaring = ARRAY[
    'ASS begeleiding', 'Autisme spectrum', 'Prikkelverwerking',
    'Autisme', 'Prikkelgevoeligheid', 'Voorspelbaarheid bieden'
  ],
  keywords = ARRAY[
    'ass', 'autisme', 'autistisch', 'prikkel', 'spectrum',
    'asd', 'overprikkeling', 'sensorisch', 'structuur', 'voorspelbaarheid',
    'pdd-nos', 'asperger'
  ]
WHERE specialisme = 'ASS';

-- Update NAH Expert with expanded synonyms
UPDATE specialisme_expert_knowledge 
SET 
  vereiste_certificaten = ARRAY[
    'NAH zorg certificaat', 'Cognitieve rehabilitatie',
    'Hersenletsel begeleiding', 'Neurorevalidatie'
  ],
  vereiste_ervaring = ARRAY[
    'Niet-aangeboren hersenletsel', 'Hersenbeschadiging', 'CVA nazorg',
    'Hersenletsel', 'CVA', 'Cognitieve beperkingen', 'Revalidatie'
  ],
  keywords = ARRAY[
    'nah', 'hersenletsel', 'cva', 'hersenbeschadiging', 'cognitief',
    'beroerte', 'trauma capitis', 'tbi', 'contusio', 'revalidatie'
  ]
WHERE specialisme = 'NAH';

-- Update Epilepsie Expert with expanded synonyms  
UPDATE specialisme_expert_knowledge 
SET 
  vereiste_certificaten = ARRAY[
    'Epilepsie zorg', 'Noodmedicatie toediening', 'BHV',
    'Rescue medicatie', 'Epilepsie protocol'
  ],
  vereiste_ervaring = ARRAY[
    'Epilepsie begeleiding', 'Aanvalherkenning', 'Noodprotocollen',
    'Epilepsie', 'Aanvallen', 'Insult herkenning'
  ],
  keywords = ARRAY[
    'epilepsie', 'aanval', 'insult', 'toeval',
    'convulsie', 'epileptisch', 'anti-epileptica', 'rescue'
  ]
WHERE specialisme = 'Epilepsie';

-- Update Gedrag Expert with expanded synonyms (FIX 2)
UPDATE specialisme_expert_knowledge 
SET 
  vereiste_certificaten = ARRAY[
    'Agressiehantering', 'De-escalatie training', 'Weerbaarheid',
    'Fysieke weerbaarheid', 'PMTO', 'Grensoverschrijdend gedrag',
    'Geweldloos verzet', 'Crisisinterventie', 'CCE scholing',
    'BOPZ', 'Wet Zorg en Dwang'
  ],
  vereiste_ervaring = ARRAY[
    'Gedragsproblematiek', 'Agressieregulatie', 'Grensoverschrijdend gedrag',
    'Agressie', 'Escalerende situaties', 'Acting out', 'Forensisch'
  ],
  keywords = ARRAY[
    'agressie', 'gedrag', 'grensoverschrijdend', 'acting out', 'weerbaar',
    'escalatie', 'dwang', 'verzet', 'forensisch', 'seksueel overschrijdend',
    'boosheid', 'woede', 'fysiek', 'verbale agressie'
  ]
WHERE specialisme = 'Gedrag';

-- Update Medisch Expert with expanded synonyms
UPDATE specialisme_expert_knowledge 
SET 
  vereiste_certificaten = ARRAY[
    'Verpleegtechnische handelingen', 'Medicatie bekwaam', 'Voorbehouden handelingen',
    'BIG registratie', 'Bekwaamheidsverklaring', 'Diabetes zorg'
  ],
  vereiste_ervaring = ARRAY[
    'Sondevoeding', 'Katheterisatie', 'Diabetes zorg', 'Wondverzorging',
    'Medicatie', 'Verpleegtechnisch', 'Medische zorg'
  ],
  keywords = ARRAY[
    'verpleegtechnisch', 'katheter', 'sonde', 'medicatie', 'diabetes', 'medisch',
    'peg', 'infuus', 'injectie', 'bloedsuiker', 'wondzorg', 'stoma',
    'tracheostoma', 'zuurstofsaturatie', 'sondevoeding'
  ]
WHERE specialisme = 'Medisch';

-- Update Verslaving Expert with expanded synonyms
UPDATE specialisme_expert_knowledge 
SET 
  vereiste_certificaten = ARRAY[
    'Verslavingszorg', 'Dubbele diagnose', 'Motiverende gespreksvoering',
    'MDFT', 'CGT verslaving', 'Terugvalpreventie'
  ],
  vereiste_ervaring = ARRAY[
    'Verslavingsproblematiek', 'Middelengebruik', 'Terugvalpreventie',
    'Verslaving', 'Alcohol problematiek', 'Drugs', 'Gokverslaving'
  ],
  keywords = ARRAY[
    'verslaving', 'middelen', 'alcohol', 'drugs', 'terugval',
    'detox', 'afkicken', 'clean', 'gokken', 'afhankelijkheid',
    'dubbele diagnose', 'intoxicatie', 'ontwenning'
  ]
WHERE specialisme = 'Verslaving';

-- FIX 6: Insert 4 new experts

-- LVB Expert (for Gehandicaptenzorg - lots of Prisma locations)
INSERT INTO specialisme_expert_knowledge (
  specialisme, expert_naam, vereiste_certificaten, vereiste_ervaring, 
  methodieken, keywords, match_criteria, uitleg_template
) VALUES (
  'LVB',
  'Senior LVB Expert',
  ARRAY[
    'LVB methodiek', 'Triple-C', 'Gentle Teaching',
    'Competentiegericht werken', 'LVB scholing', 'VG-7'
  ],
  ARRAY[
    'Verstandelijke beperking', 'Gehandicaptenzorg', 'LVB begeleiding',
    'LVB', 'MVB', 'EVB', 'Zwakbegaafdheid'
  ],
  ARRAY['Triple-C', 'Gentle Teaching', 'Presentiebenadering', 'Competentiegericht werken'],
  ARRAY[
    'lvb', 'mvb', 'evb', 'verstandelijk', 'beperking', 'zwakbegaafd',
    'gehandicaptenzorg', 'woongroep', 'dagbesteding', 'ghz',
    'iq', 'cognitief beperkt', 'begeleiding'
  ],
  '{"certificaat_gewicht": 15, "ervaring_gewicht": 30, "methodiek_gewicht": 15}'::jsonb,
  'Bij LVB-cliënten is aanpassing van communicatie en tempo essentieel. {match_status}'
)
ON CONFLICT DO NOTHING;

-- Dementie Expert (for VVT/Ouderenzorg)
INSERT INTO specialisme_expert_knowledge (
  specialisme, expert_naam, vereiste_certificaten, vereiste_ervaring, 
  methodieken, keywords, match_criteria, uitleg_template
) VALUES (
  'Dementie',
  'Senior Dementie Expert',
  ARRAY[
    'Dementiezorg', 'Psychogeriatrie', 'Omgaan met dementie',
    'Validation', 'DOC-training', 'Warme zorg'
  ],
  ARRAY[
    'Dementie begeleiding', 'Psychogeriatrie', 'Ouderenzorg',
    'Alzheimer', 'Cognitieve achteruitgang', 'Verpleeghuiszorg'
  ],
  ARRAY['Validation', 'DOC', 'Belevingsgerichte zorg', 'Warme zorg'],
  ARRAY[
    'dementie', 'alzheimer', 'psychogeriatr', 'vergeetachtig',
    'pg', 'geheugenproblemen', 'cognitieve achteruitgang',
    'verpleeghuis', 'verwarring', 'dwalen'
  ],
  '{"certificaat_gewicht": 20, "ervaring_gewicht": 25, "methodiek_gewicht": 15}'::jsonb,
  'Dementiezorg vereist geduld en kennis van belevingsgerichte benaderingen. {match_status}'
)
ON CONFLICT DO NOTHING;

-- Palliatief Expert (for terminal care)
INSERT INTO specialisme_expert_knowledge (
  specialisme, expert_naam, vereiste_certificaten, vereiste_ervaring, 
  methodieken, keywords, match_criteria, uitleg_template
) VALUES (
  'Palliatief',
  'Senior Palliatief Expert',
  ARRAY[
    'Palliatieve zorg', 'Hospice zorg', 'Terminale zorg',
    'Pijnbestrijding', 'PZNL scholing'
  ],
  ARRAY[
    'Terminale zorg', 'Palliatief', 'Hospice',
    'Levenseindezorg', 'Rouw begeleiding', 'Comfort care'
  ],
  ARRAY['Comfort care', 'Pijnmanagement', 'Rouwbegeleiding', 'Spirituele zorg'],
  ARRAY[
    'palliatief', 'terminaal', 'hospice', 'levenseinde',
    'stervensbegeleiding', 'pijn', 'comfort', 'rouw',
    'laatste levensfase', 'uitbehandeld'
  ],
  '{"certificaat_gewicht": 25, "ervaring_gewicht": 25, "methodiek_gewicht": 10}'::jsonb,
  'Palliatieve zorg vraagt om empathie en expertise in comfort bieden. {match_status}'
)
ON CONFLICT DO NOTHING;

-- Jeugd Expert (for Jeugdzorg/Orthopedagogiek)
INSERT INTO specialisme_expert_knowledge (
  specialisme, expert_naam, vereiste_certificaten, vereiste_ervaring, 
  methodieken, keywords, match_criteria, uitleg_template
) VALUES (
  'Jeugd',
  'Senior Jeugd Expert',
  ARRAY[
    'Jeugdzorg', 'Orthopedagogiek', 'SKJ registratie',
    'MDFT', 'Gezinstherapie', 'Traumasensitief werken'
  ],
  ARRAY[
    'Jeugdzorg', 'Kinderen', 'Orthopedagogiek',
    'Gezinshulp', 'Pleegzorg', 'Residentiële jeugdzorg'
  ],
  ARRAY['MDFT', 'FFT', 'Triple P', 'Traumasensitief werken', 'Signs of Safety'],
  ARRAY[
    'jeugd', 'kind', 'orthopeda', 'pleegzorg',
    'residentieel', 'gezin', 'adolescent', 'puber',
    'opvoeding', 'hechting', 'trauma', 'uithuisplaatsing'
  ],
  '{"certificaat_gewicht": 20, "ervaring_gewicht": 25, "methodiek_gewicht": 15}'::jsonb,
  'Jeugdzorg vereist kennis van ontwikkelingspsychologie en hechting. {match_status}'
)
ON CONFLICT DO NOTHING;