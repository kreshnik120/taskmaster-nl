-- Fase 1: Opdracht Annuleren Functionaliteit

-- 1.1 Voeg kolommen toe aan assignments tabel voor annulering tracking
ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS cancelled_reason text,
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.assignments.cancelled_reason IS 'Reden voor annulering (optioneel)';
COMMENT ON COLUMN public.assignments.cancelled_at IS 'Timestamp wanneer opdracht is geannuleerd';
COMMENT ON COLUMN public.assignments.cancelled_by IS 'User ID die de opdracht heeft geannuleerd';

-- 1.2 Maak assignment_action_history tabel voor audit trail
CREATE TABLE IF NOT EXISTS public.assignment_action_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  action_text text NOT NULL,
  action_type text NOT NULL DEFAULT 'status_change',
  completed_at timestamp with time zone DEFAULT now(),
  completed_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assignment_action_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies voor assignment_action_history
CREATE POLICY "Allow authenticated users to view assignment history"
  ON public.assignment_action_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert assignment history"
  ON public.assignment_action_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index voor performance op assignment_id lookups
CREATE INDEX IF NOT EXISTS idx_assignment_action_history_assignment_id 
  ON public.assignment_action_history(assignment_id);