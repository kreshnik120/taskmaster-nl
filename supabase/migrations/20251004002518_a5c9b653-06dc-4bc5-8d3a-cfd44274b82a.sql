-- Create scheduler_runs table for logging scheduler executions
CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamp with time zone NOT NULL DEFAULT now(),
  triggered_functions jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb DEFAULT NULL,
  error text DEFAULT NULL,
  duration_ms integer DEFAULT NULL,
  org_id uuid NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000'::uuid
);

-- Enable RLS
ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;

-- Policy: Org members can view scheduler runs
CREATE POLICY "Org members can view scheduler runs"
ON public.scheduler_runs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = scheduler_runs.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Policy: System can insert scheduler runs
CREATE POLICY "System can insert scheduler runs"
ON public.scheduler_runs
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_run_at ON public.scheduler_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_org_id ON public.scheduler_runs(org_id);