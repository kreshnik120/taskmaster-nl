-- Create professionals table
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  functie_niveau TEXT NOT NULL CHECK (functie_niveau IN ('Helpende 2', 'VIG', 'VP3', 'VP4', 'HBO-V')),
  regio TEXT,
  skills TEXT[] DEFAULT '{}',
  beschikbaarheidsnotities TEXT,
  status TEXT NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'inactief', 'pauze')),
  rating NUMERIC CHECK (rating >= 0 AND rating <= 5),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create professional_availability table
CREATE TABLE public.professional_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('dag', 'avond', 'nacht', 'hele_dag')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(professional_id, date, shift)
);

-- Enable RLS
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_availability ENABLE ROW LEVEL SECURITY;

-- RLS Policies for professionals
CREATE POLICY "Org members can view their professionals"
ON public.professionals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professionals.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert professionals"
ON public.professionals FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professionals.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update their professionals"
ON public.professionals FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professionals.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete their professionals"
ON public.professionals FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professionals.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- RLS Policies for professional_availability
CREATE POLICY "Org members can view availability"
ON public.professional_availability FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.professionals
    JOIN public.user_organizations ON user_organizations.org_id = professionals.org_id
    WHERE professionals.id = professional_availability.professional_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert availability"
ON public.professional_availability FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.professionals
    JOIN public.user_organizations ON user_organizations.org_id = professionals.org_id
    WHERE professionals.id = professional_availability.professional_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update availability"
ON public.professional_availability FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.professionals
    JOIN public.user_organizations ON user_organizations.org_id = professionals.org_id
    WHERE professionals.id = professional_availability.professional_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete availability"
ON public.professional_availability FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.professionals
    JOIN public.user_organizations ON user_organizations.org_id = professionals.org_id
    WHERE professionals.id = professional_availability.professional_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_professionals_org_id ON public.professionals(org_id);
CREATE INDEX idx_professionals_status ON public.professionals(status);
CREATE INDEX idx_professionals_functie_niveau ON public.professionals(functie_niveau);
CREATE INDEX idx_professionals_regio ON public.professionals(regio);
CREATE INDEX idx_professional_availability_professional_id ON public.professional_availability(professional_id);
CREATE INDEX idx_professional_availability_date ON public.professional_availability(date);

-- Trigger to update updated_at
CREATE TRIGGER update_professionals_updated_at
BEFORE UPDATE ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();