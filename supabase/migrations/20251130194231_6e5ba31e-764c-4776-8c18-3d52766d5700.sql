-- ============================================
-- FASE 1: OPDRACHTEN SYSTEEM MET SUBLOCATIES (FIX)
-- ============================================

-- 1. Maak assignments tabel met hiërarchische koppeling
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Koppelingen (hiërarchisch naar sublocatie)
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  sublocation_id UUID NOT NULL REFERENCES public.client_sublocations(id) ON DELETE CASCADE,
  hourly_rate_id UUID REFERENCES public.hourly_rates(id) ON DELETE SET NULL,
  
  -- Periode informatie
  start_date DATE NOT NULL,
  end_date DATE,
  weekly_hours INTEGER NOT NULL DEFAULT 0,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'accepted', 'active', 'paused', 'completed', 'cancelled')),
  
  -- AI matching data
  ai_match_score NUMERIC(5,2),
  ai_match_reasoning JSONB DEFAULT '{}',
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_weekly_hours CHECK (weekly_hours >= 0 AND weekly_hours <= 168)
);

-- 2. Indices voor performance
CREATE INDEX idx_assignments_professional ON public.assignments(professional_id);
CREATE INDEX idx_assignments_sublocation ON public.assignments(sublocation_id);
CREATE INDEX idx_assignments_status ON public.assignments(status);
CREATE INDEX idx_assignments_dates ON public.assignments(start_date, end_date);
CREATE INDEX idx_assignments_ai_score ON public.assignments(ai_match_score DESC) WHERE ai_match_score IS NOT NULL;

-- 3. Trigger voor updated_at
CREATE OR REPLACE FUNCTION update_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_assignments_updated_at();

-- 4. RLS Policies
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view assignments"
  ON public.assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      JOIN public.user_organizations uo ON uo.org_id = p.org_id
      WHERE p.id = assignments.professional_id
      AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage assignments"
  ON public.assignments FOR ALL
  USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  );

-- 5. Event logging trigger voor AI learning
CREATE OR REPLACE FUNCTION log_assignment_events()
RETURNS TRIGGER AS $$
DECLARE
  event_data JSONB;
  event_name TEXT;
BEGIN
  -- Bepaal event type
  IF TG_OP = 'INSERT' THEN
    event_name := 'assignment_created';
    event_data := jsonb_build_object(
      'assignment_id', NEW.id,
      'professional_id', NEW.professional_id,
      'sublocation_id', NEW.sublocation_id,
      'hourly_rate_id', NEW.hourly_rate_id,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'weekly_hours', NEW.weekly_hours,
      'status', NEW.status,
      'ai_match_score', NEW.ai_match_score
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    event_name := 'assignment_status_changed';
    event_data := jsonb_build_object(
      'assignment_id', NEW.id,
      'professional_id', NEW.professional_id,
      'sublocation_id', NEW.sublocation_id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'weekly_hours', NEW.weekly_hours
    );
  ELSE
    RETURN NEW;
  END IF;

  -- Log event voor AI learning
  INSERT INTO public.system_events (
    event_type,
    metadata,
    user_id,
    org_id
  )
  SELECT
    event_name,
    event_data,
    COALESCE(auth.uid(), NEW.created_by),
    p.org_id
  FROM public.professionals p
  WHERE p.id = NEW.professional_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER assignments_event_logger
  AFTER INSERT OR UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION log_assignment_events();

-- 6. Helper view voor assignment details met client info (FIX: gebruik full_name i.p.v. naam)
CREATE OR REPLACE VIEW assignment_details AS
SELECT 
  a.id,
  a.professional_id,
  a.sublocation_id,
  a.hourly_rate_id,
  a.start_date,
  a.end_date,
  a.weekly_hours,
  a.status,
  a.ai_match_score,
  a.ai_match_reasoning,
  a.notes,
  a.created_at,
  a.updated_at,
  -- Professional info (FIX: full_name i.p.v. naam)
  p.full_name as professional_name,
  p.functie_niveau,
  p.werkvorm,
  -- Sublocation info
  cs.naam as sublocation_name,
  cs.plaats as sublocation_plaats,
  cs.doelgroep,
  cs.sector,
  -- Location info
  cl.naam as location_name,
  cl.plaats as location_plaats,
  -- Organization info
  co.name as organization_name,
  co.kvk_nummer,
  -- Hourly rate info
  hr.uursoort_naam,
  hr.basis_tarief,
  hr.btw_percentage,
  -- Bureau info
  CASE 
    WHEN cs.gekoppelde_bv_org_id = '550e8400-e29b-41d4-a716-446655440000' THEN 'ABCzorg'
    WHEN cs.gekoppelde_bv_org_id = '7c9e6679-7425-40de-944b-e07fc1f90ae7' THEN 'CitoZorg'
    ELSE 'Onbekend'
  END as bemiddelingsbureau
FROM public.assignments a
JOIN public.professionals p ON p.id = a.professional_id
JOIN public.client_sublocations cs ON cs.id = a.sublocation_id
JOIN public.client_locations cl ON cl.id = cs.location_id
JOIN public.client_organizations co ON co.id = cl.client_org_id
LEFT JOIN public.hourly_rates hr ON hr.id = a.hourly_rate_id;

COMMENT ON TABLE public.assignments IS 'Opdrachten koppelen professionals aan specifieke werklocaties (sublocaties) met tarieven en periode';
COMMENT ON VIEW assignment_details IS 'Complete assignment view met alle gerelateerde client, locatie en tarief informatie';