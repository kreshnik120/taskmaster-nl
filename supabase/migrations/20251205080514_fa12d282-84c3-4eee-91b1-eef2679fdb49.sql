
-- Fix Prisma website en clear logo voor refetch
UPDATE client_organizations 
SET 
  website = 'https://www.prismanet.nl',
  logo_url = NULL
WHERE name ILIKE '%prisma%' AND name NOT ILIKE '%prisma.nl%';

-- Create specialisme_expert_knowledge table
CREATE TABLE public.specialisme_expert_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  specialisme TEXT NOT NULL UNIQUE,
  expert_naam TEXT NOT NULL,
  vereiste_certificaten TEXT[] DEFAULT '{}',
  vereiste_ervaring TEXT[] DEFAULT '{}',
  methodieken TEXT[] DEFAULT '{}',
  match_criteria JSONB NOT NULL DEFAULT '{"certificaat_gewicht": 15, "ervaring_gewicht": 20, "methodiek_gewicht": 10}',
  uitleg_template TEXT,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.specialisme_expert_knowledge ENABLE ROW LEVEL SECURITY;

-- RLS policies - viewable by all authenticated users
CREATE POLICY "Anyone can view expert knowledge"
ON public.specialisme_expert_knowledge
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage expert knowledge"
ON public.specialisme_expert_knowledge
FOR ALL
USING (true)
WITH CHECK (true);

-- Seed 6 expert specialismen
INSERT INTO public.specialisme_expert_knowledge (specialisme, expert_naam, vereiste_certificaten, vereiste_ervaring, methodieken, keywords, match_criteria, uitleg_template) VALUES
(
  'ASS',
  'Senior ASS Expert',
  ARRAY['Autisme specialist', 'Triple-C certificaat', 'Prikkelarm werken'],
  ARRAY['ASS begeleiding', 'Autisme spectrum', 'Prikkelverwerking'],
  ARRAY['Triple-C', 'TEACCH', 'Presentiebenadering', 'Prikkelarme benadering'],
  ARRAY['ass', 'autisme', 'autistisch', 'prikkel', 'spectrum'],
  '{"certificaat_gewicht": 15, "ervaring_gewicht": 25, "methodiek_gewicht": 10}',
  'Voor ASS-cliënten is ervaring met prikkelverwerking en voorspelbaarheid essentieel. {match_status}'
),
(
  'NAH',
  'Senior NAH Expert',
  ARRAY['NAH zorg certificaat', 'Cognitieve rehabilitatie'],
  ARRAY['Niet-aangeboren hersenletsel', 'Hersenbeschadiging', 'CVA nazorg'],
  ARRAY['Errorless learning', 'Externe geheugensteun', 'Cognitieve training'],
  ARRAY['nah', 'hersenletsel', 'cva', 'hersenbeschadiging', 'cognitief'],
  '{"certificaat_gewicht": 20, "ervaring_gewicht": 25, "methodiek_gewicht": 15}',
  'NAH-cliënten vereisen specifieke kennis van cognitieve beperkingen. {match_status}'
),
(
  'Epilepsie',
  'Senior Epilepsie Expert',
  ARRAY['Epilepsie zorg', 'Noodmedicatie toediening', 'BHV'],
  ARRAY['Epilepsie begeleiding', 'Aanvalherkenning', 'Noodprotocollen'],
  ARRAY['Aanvalregistratie', 'Rescue medicatie protocol'],
  ARRAY['epilepsie', 'aanval', 'insult', 'toeval'],
  '{"certificaat_gewicht": 25, "ervaring_gewicht": 20, "methodiek_gewicht": 15}',
  'Epilepsiezorg vereist alertheid en kennis van noodprotocollen. {match_status}'
),
(
  'Gedrag',
  'Senior Gedragsexpert',
  ARRAY['Agressiehantering', 'De-escalatie training', 'Weerbaarheid'],
  ARRAY['Gedragsproblematiek', 'Agressieregulatie', 'Grensoverschrijdend gedrag'],
  ARRAY['Geweldloos verzet', 'BOPZ kennis', 'Positieve gedragsondersteuning'],
  ARRAY['agressie', 'gedrag', 'grensoverschrijdend', 'acting out', 'weerbaar'],
  '{"certificaat_gewicht": 20, "ervaring_gewicht": 25, "methodiek_gewicht": 15}',
  'Bij gedragsproblematiek is de-escalatie en weerbaarheid cruciaal. {match_status}'
),
(
  'Medisch',
  'Senior Medisch Expert',
  ARRAY['Verpleegtechnische handelingen', 'Medicatie bekwaam', 'Voorbehouden handelingen'],
  ARRAY['Sondevoeding', 'Katheterisatie', 'Diabetes zorg', 'Wondverzorging'],
  ARRAY['Zorgplan opstellen', 'Medische monitoring'],
  ARRAY['verpleegtechnisch', 'katheter', 'sonde', 'medicatie', 'diabetes', 'medisch'],
  '{"certificaat_gewicht": 30, "ervaring_gewicht": 20, "methodiek_gewicht": 10}',
  'Medische zorg vereist gecertificeerde bekwaamheid. {match_status}'
),
(
  'Verslaving',
  'Senior Verslavingsexpert',
  ARRAY['Verslavingszorg', 'Dubbele diagnose', 'Motiverende gespreksvoering'],
  ARRAY['Verslavingsproblematiek', 'Middelengebruik', 'Terugvalpreventie'],
  ARRAY['Motiverende gespreksvoering', 'Terugvalpreventie', 'Harm reduction'],
  ARRAY['verslaving', 'middelen', 'alcohol', 'drugs', 'terugval'],
  '{"certificaat_gewicht": 15, "ervaring_gewicht": 25, "methodiek_gewicht": 20}',
  'Verslavingszorg vereist kennis van terugvalpreventie en motivatietechnieken. {match_status}'
);
