-- Vacatures tabel voor openstaande posities bij sublocaties
CREATE TABLE public.vacancies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sublocation_id UUID NOT NULL REFERENCES public.client_sublocations(id) ON DELETE CASCADE,
  titel TEXT NOT NULL,
  functie_niveau TEXT NOT NULL,
  aantal_fte NUMERIC(3,2) DEFAULT 1.0,
  uren_per_week INTEGER DEFAULT 32,
  uurtarief_indicatie NUMERIC(10,2),
  start_datum DATE,
  eind_datum DATE,
  deadline DATE,
  vereiste_certificaten TEXT[] DEFAULT '{}',
  gewenste_sector_ervaring TEXT[] DEFAULT '{}',
  gewenste_doelgroep_ervaring TEXT[] DEFAULT '{}',
  beschrijving TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'vervuld', 'gesloten')),
  urgentie TEXT NOT NULL DEFAULT 'normaal' CHECK (urgentie IN ('laag', 'normaal', 'hoog', 'kritiek')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vacancy applications tracking
CREATE TABLE public.vacancy_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vacancy_id UUID NOT NULL REFERENCES public.vacancies(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'voorgesteld' CHECK (status IN ('voorgesteld', 'in_gesprek', 'aangeboden', 'geaccepteerd', 'afgewezen')),
  match_score NUMERIC(5,2),
  match_reasoning JSONB DEFAULT '{}',
  notes TEXT,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vacancy_id, professional_id)
);

-- Enable RLS
ALTER TABLE public.vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacancy_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vacancies
CREATE POLICY "Org members can view vacancies" ON public.vacancies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_sublocations cs
      JOIN client_locations cl ON cl.id = cs.location_id
      JOIN client_organizations co ON co.id = cl.client_org_id
      JOIN user_organizations uo ON uo.org_id = co.org_id
      WHERE cs.id = vacancies.sublocation_id AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage vacancies" ON public.vacancies
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  );

-- RLS Policies for vacancy_applications
CREATE POLICY "Org members can view vacancy applications" ON public.vacancy_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vacancies v
      JOIN client_sublocations cs ON cs.id = v.sublocation_id
      JOIN client_locations cl ON cl.id = cs.location_id
      JOIN client_organizations co ON co.id = cl.client_org_id
      JOIN user_organizations uo ON uo.org_id = co.org_id
      WHERE v.id = vacancy_applications.vacancy_id AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage vacancy applications" ON public.vacancy_applications
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  );

-- Indexes for performance
CREATE INDEX idx_vacancies_sublocation ON public.vacancies(sublocation_id);
CREATE INDEX idx_vacancies_status ON public.vacancies(status);
CREATE INDEX idx_vacancies_urgentie ON public.vacancies(urgentie);
CREATE INDEX idx_vacancy_applications_vacancy ON public.vacancy_applications(vacancy_id);
CREATE INDEX idx_vacancy_applications_professional ON public.vacancy_applications(professional_id);

-- Trigger for updated_at
CREATE TRIGGER update_vacancies_updated_at
  BEFORE UPDATE ON public.vacancies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_timestamp();

CREATE TRIGGER update_vacancy_applications_updated_at
  BEFORE UPDATE ON public.vacancy_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_timestamp();