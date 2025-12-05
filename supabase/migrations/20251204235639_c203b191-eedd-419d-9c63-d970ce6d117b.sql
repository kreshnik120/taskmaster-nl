-- ============================================
-- FASE 1: Perfect Match Architecture - Database
-- ============================================

-- 1.1: Make vacancy_applications.professional_id nullable for direct application linking
ALTER TABLE vacancy_applications 
  ALTER COLUMN professional_id DROP NOT NULL;

-- 1.2: Add application_id column for direct sollicitant → vacancy koppeling
ALTER TABLE vacancy_applications 
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES professional_applications(id) ON DELETE SET NULL;

-- 1.3: Constraint ensuring at least one source is present
ALTER TABLE vacancy_applications
  ADD CONSTRAINT chk_vacancy_app_source 
  CHECK (professional_id IS NOT NULL OR application_id IS NOT NULL);

-- 1.4: Index for application_id queries
CREATE INDEX IF NOT EXISTS idx_vacancy_applications_application_id 
ON vacancy_applications(application_id) WHERE application_id IS NOT NULL;

-- ============================================
-- 1.5: Create application_sublocation_matches table
-- Direct sollicitant → sublocation matching
-- ============================================
CREATE TABLE IF NOT EXISTS application_sublocation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
  sublocation_id uuid NOT NULL REFERENCES client_sublocations(id) ON DELETE CASCADE,
  vacancy_id uuid REFERENCES vacancies(id) ON DELETE SET NULL,
  match_score numeric NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  match_reasoning jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'voorgesteld', 'geaccepteerd', 'afgewezen', 'geplaatst')),
  voorgesteld_aan_klant_at timestamptz,
  klant_reactie text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(application_id, sublocation_id)
);

-- 1.6: Enable RLS
ALTER TABLE application_sublocation_matches ENABLE ROW LEVEL SECURITY;

-- 1.7: RLS Policies for internal recruiters
CREATE POLICY "Org members can view application matches"
ON application_sublocation_matches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM professional_applications pa
    JOIN user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.id = application_sublocation_matches.application_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Admins and managers can manage application matches"
ON application_sublocation_matches FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
);

-- 1.8: Updated_at trigger
CREATE TRIGGER update_application_sublocation_matches_updated_at
BEFORE UPDATE ON application_sublocation_matches
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_timestamp();

-- 1.9: System events trigger for AI learning
CREATE OR REPLACE FUNCTION log_application_match_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_events (
      event_type, entity_type, entity_id, event_data, org_id, user_id, metadata
    ) VALUES (
      'application_match_suggested',
      'application_sublocation_match',
      NEW.id,
      jsonb_build_object(
        'application_id', NEW.application_id,
        'sublocation_id', NEW.sublocation_id,
        'vacancy_id', NEW.vacancy_id,
        'match_score', NEW.match_score,
        'status', NEW.status
      ),
      NULL,
      NEW.created_by,
      NEW.match_reasoning
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_events (
        event_type, entity_type, entity_id, event_data, org_id, user_id, metadata
      ) VALUES (
        CASE NEW.status
          WHEN 'voorgesteld' THEN 'match_proposed_to_client'
          WHEN 'geaccepteerd' THEN 'match_accepted'
          WHEN 'afgewezen' THEN 'match_rejected'
          WHEN 'geplaatst' THEN 'match_placement_confirmed'
          ELSE 'match_status_changed'
        END,
        'application_sublocation_match',
        NEW.id,
        jsonb_build_object(
          'application_id', NEW.application_id,
          'sublocation_id', NEW.sublocation_id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'match_score', NEW.match_score,
          'klant_reactie', NEW.klant_reactie
        ),
        NULL,
        auth.uid(),
        '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER log_application_match_events_trigger
AFTER INSERT OR UPDATE ON application_sublocation_matches
FOR EACH ROW EXECUTE FUNCTION log_application_match_events();