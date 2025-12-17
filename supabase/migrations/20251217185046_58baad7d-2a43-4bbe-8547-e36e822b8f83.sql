-- VOG Screeningsprofiel Requirements Table
-- Maps functie_niveau + doelgroep to required VOG screening profiles

CREATE TABLE public.vog_screening_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  functie_niveau text NOT NULL,
  doelgroep text[] DEFAULT '{}',
  required_profile_code text NOT NULL,
  required_functieaspecten text[] DEFAULT '{}',
  profile_description text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vog_screening_requirements ENABLE ROW LEVEL SECURITY;

-- Everyone can read requirements
CREATE POLICY "Anyone can view screening requirements"
ON public.vog_screening_requirements
FOR SELECT
USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage screening requirements"
ON public.vog_screening_requirements
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert healthcare-specific screening requirements
INSERT INTO public.vog_screening_requirements (functie_niveau, doelgroep, required_profile_code, required_functieaspecten, profile_description) VALUES
-- Standard healthcare (VVT, GGZ, GHZ)
('VIG', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),
('HBO-V', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),
('Verpleegkundige MBO', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),
('Helpende', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),
('Begeleider', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),
('Persoonlijk begeleider', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),
('GGZ-agoog', '{}', '45', '{85}', 'Gezondheidszorg en welzijn van personen - Zorg voor hulpbehoevende personen'),

-- Jeugdzorg specific (extra functieaspect 84)
('VIG', '{Kinderen/Jeugd}', '45', '{84,85}', 'Gezondheidszorg en welzijn van personen - Zorg voor minderjarigen + hulpbehoevenden'),
('HBO-V', '{Kinderen/Jeugd}', '45', '{84,85}', 'Gezondheidszorg en welzijn van personen - Zorg voor minderjarigen + hulpbehoevenden'),
('Begeleider', '{Kinderen/Jeugd}', '45', '{84,85}', 'Gezondheidszorg en welzijn van personen - Zorg voor minderjarigen + hulpbehoevenden'),
('Persoonlijk begeleider', '{Kinderen/Jeugd}', '45', '{84,85}', 'Gezondheidszorg en welzijn van personen - Zorg voor minderjarigen + hulpbehoevenden'),
('GGZ-agoog', '{Kinderen/Jeugd}', '45', '{84,85}', 'Gezondheidszorg en welzijn van personen - Zorg voor minderjarigen + hulpbehoevenden');

-- Add index for fast lookups
CREATE INDEX idx_vog_screening_functie ON public.vog_screening_requirements(functie_niveau);

-- Add comment
COMMENT ON TABLE public.vog_screening_requirements IS 'VOG screening profile requirements per functie_niveau and doelgroep combination for healthcare recruitment';