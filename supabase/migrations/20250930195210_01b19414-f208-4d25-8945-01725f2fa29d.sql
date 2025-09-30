-- Create clients table for ABCzorg and CitoZorg customer management
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL CHECK (company IN ('ABCzorg', 'CitoZorg')),
  tier INTEGER NOT NULL DEFAULT 2 CHECK (tier BETWEEN 1 AND 3),
  weekly_hours INTEGER,
  revenue_per_hour NUMERIC(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Users can view all clients in their organization
CREATE POLICY "Users can view clients in their orgs"
ON public.clients
FOR SELECT
USING (true);

-- Users can manage clients in their organization
CREATE POLICY "Users can manage clients in their orgs"
ON public.clients
FOR ALL
USING (true);

-- Add client-specific columns to tasks table
ALTER TABLE public.tasks ADD COLUMN client_id UUID REFERENCES public.clients(id);
ALTER TABLE public.tasks ADD COLUMN revenue_impact_eur NUMERIC(10,2);
ALTER TABLE public.tasks ADD COLUMN transition_related BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX idx_tasks_transition_related ON public.tasks(transition_related);
CREATE INDEX idx_clients_company ON public.clients(company);

-- Add trigger for clients updated_at
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert CitoZorg clients
INSERT INTO public.clients (name, company, tier, weekly_hours, revenue_per_hour) VALUES
('Prisma', 'CitoZorg', 1, 1000, 7.00),
('SIZA', 'CitoZorg', 1, 1200, 7.00),
('SWZ', 'CitoZorg', 1, 900, 7.00),
('Lunet', 'CitoZorg', 2, 700, 7.00);

-- Insert ABCzorg clients (Tier 1 - Groot)
INSERT INTO public.clients (name, company, tier, weekly_hours, revenue_per_hour) VALUES
('s Heerenloo, Stichting - Hoofdkantoor - Amersfoort', 'ABCzorg', 1, 150, 7.00),
('Leger des Heils Hoofdkantoor - Utrecht', 'ABCzorg', 1, 140, 7.00),
('Stichting Amarant - Tilburg', 'ABCzorg', 1, 130, 7.00),
('Pro Persona Wolfheze Hoofdkantoor - Wolfheze', 'ABCzorg', 1, 120, 7.00);

-- Insert ABCzorg clients (Tier 2 - Medium)
INSERT INTO public.clients (name, company, tier, weekly_hours, revenue_per_hour) VALUES
('Pluryn, Stichting Hoofdkantoor - Nijmegen', 'ABCzorg', 2, 100, 7.00),
('Dimence Hoofdkantoor - Deventer', 'ABCzorg', 2, 95, 7.00),
('IrisZorg, Stichting - Hoofdkantoor - Beekbergen', 'ABCzorg', 2, 90, 7.00),
('Zorgspectrum Hoofdkantoor - Nieuwegein', 'ABCzorg', 2, 85, 7.00),
('Kwintes Hoofdkantoor - Zeist', 'ABCzorg', 2, 80, 7.00),
('Tactus - Deventer', 'ABCzorg', 2, 75, 7.00),
('Sherpa - Baarn', 'ABCzorg', 2, 70, 7.00);

-- Insert ABCzorg clients (Tier 3 - Lokaal)
INSERT INTO public.clients (name, company, tier, weekly_hours, revenue_per_hour) VALUES
('Atlant Zorggroep Hoofdkantoor - Beekbergen', 'ABCzorg', 3, 50, 7.00),
('Bloezem GGZ BV - Hoofdkantoor - Renkum', 'ABCzorg', 3, 45, 7.00),
('Bloezem - Hoofdkantoor - Nederweert', 'ABCzorg', 3, 40, 7.00),
('Cello Zorg Hoofdkantoor - Vught', 'ABCzorg', 3, 40, 7.00),
('Compleet Mensen Werk BV - Hoofdkantoor - Wageningen', 'ABCzorg', 3, 35, 7.00),
('CVS Zorg Hoofdkantoor - Rotterdam', 'ABCzorg', 3, 35, 7.00),
('De Driestroom Hoofdkantoor - Elst GLD', 'ABCzorg', 3, 30, 7.00),
('de Hoeve - Hoofdkantoor - Herveld', 'ABCzorg', 3, 30, 7.00),
('De Rooyse Wissel Hoofdkantoor - Oostrum LB', 'ABCzorg', 3, 28, 7.00),
('De Terp, Stichting - Hoofdkantoor - Andelst', 'ABCzorg', 3, 25, 7.00),
('De Tussenvoorziening Hoofdkantoor - Utrecht', 'ABCzorg', 3, 25, 7.00),
('Directe Zorg Nijmegen Hoofdkantoor - Nijmegen', 'ABCzorg', 3, 25, 7.00),
('Domus Dolcis Domus Hoofdkantoor - Hoenderloo', 'ABCzorg', 3, 22, 7.00),
('Grand Care Hoofdkantoor - Nijmegen', 'ABCzorg', 3, 22, 7.00),
('Herenhuis, Stichting t - Hoofdkantoor - Tiel', 'ABCzorg', 3, 20, 7.00),
('Het Herenhuis Tiel - Hoofdkantoor - Tiel', 'ABCzorg', 3, 20, 7.00),
('Het Koetshuis - Hoofdkantoor - Herveld', 'ABCzorg', 3, 18, 7.00),
('Huize-Mientje Hoofdkantoor - Nijmegen', 'ABCzorg', 3, 18, 7.00),
('Humanitas DMH, Stichting Hoofdkantoor - Nieuwegein', 'ABCzorg', 3, 18, 7.00),
('I-Cruit Zorg - Bussum', 'ABCzorg', 3, 15, 7.00),
('Inforzo - Nijmegen', 'ABCzorg', 3, 15, 7.00),
('Jayda - Hoofdkantoor - Maarn', 'ABCzorg', 3, 15, 7.00),
('Koninklijke Kentalis Hoofdkantoor - Utrecht', 'ABCzorg', 3, 15, 7.00),
('Kroek&partners interimzorg b.v. - Zwolle', 'ABCzorg', 3, 12, 7.00),
('Lister - Hoofdkantoor - Utrecht', 'ABCzorg', 3, 12, 7.00),
('Mare bijzondere Zorg BV - Boxtel', 'ABCzorg', 3, 12, 7.00),
('Mesazorg, Stichting Hoofdkantoor - Herveld', 'ABCzorg', 3, 12, 7.00),
('Mutsaersstichting - Hoofdkantoor - Venlo', 'ABCzorg', 3, 10, 7.00),
('Omnizorg - Hoofdkantoor - Apeldoorn', 'ABCzorg', 3, 10, 7.00),
('ORO, Stichting Hoofdkantoor - Helmond', 'ABCzorg', 3, 10, 7.00),
('Pergamijn Hoofdkantoor - Sittard', 'ABCzorg', 3, 10, 7.00),
('Point O Zorg B.V. Hoofdkantoor - Schaijk', 'ABCzorg', 3, 10, 7.00),
('Probe Zorgt - Hoofdkantoor - Maastricht', 'ABCzorg', 3, 10, 7.00),
('RIBW - Arnhem Veluwe en Vallei Hoofdkantoor - Arnhem', 'ABCzorg', 3, 10, 7.00),
('RijnWaal Zorggroep, Stichting Hoofdkantoor - Bemmel', 'ABCzorg', 3, 10, 7.00),
('Rosales Zorg - Hoofdkantoor - Zwolle', 'ABCzorg', 3, 8, 7.00),
('Rosengaerde - Dalfsen', 'ABCzorg', 3, 8, 7.00),
('SIZA - Hoofdkantoor - Arnhem', 'ABCzorg', 3, 8, 7.00),
('Stichting de Villa - Hoofdkantoor - Zetten', 'ABCzorg', 3, 8, 7.00),
('Team Depp - Hoofdkantoor - Schoorl', 'ABCzorg', 3, 8, 7.00),
('Team Herstelondersteuning - Zeist', 'ABCzorg', 3, 8, 7.00),
('Vita-zorggroep - Arnhem', 'ABCzorg', 3, 8, 7.00),
('VO COACH, Stichting - Hoofdkantoor - Tiel', 'ABCzorg', 3, 8, 7.00),
('Xtrn BV - Almere', 'ABCzorg', 3, 5, 7.00),
('Zorggroep Sint Maarten, Stichting Hoofdkantoor - Zupthen', 'ABCzorg', 3, 5, 7.00),
('COA - Hoofdkantoor - Nijmegen', 'ABCzorg', 3, 20, 6.50),
('Gemeente Venlo - Venlo', 'ABCzorg', 3, 15, 6.50);