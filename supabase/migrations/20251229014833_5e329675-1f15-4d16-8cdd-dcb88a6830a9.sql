-- Create table for AI chat test results
CREATE TABLE public.ai_chat_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL,
  deployment_id TEXT,
  deployment_source TEXT,
  scenario_id TEXT NOT NULL,
  question TEXT NOT NULL,
  response TEXT,
  expected_tool TEXT,
  actual_tool_used TEXT,
  passed BOOLEAN NOT NULL DEFAULT false,
  validation_details JSONB DEFAULT '[]'::jsonb,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create table for test run summaries
CREATE TABLE public.ai_chat_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id TEXT,
  deployment_source TEXT,
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed_tests INTEGER NOT NULL DEFAULT 0,
  failed_tests INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  alert_sent BOOLEAN DEFAULT false,
  org_id UUID REFERENCES public.organizations(id)
);

-- Indexes for performance
CREATE INDEX idx_test_results_run_id ON public.ai_chat_test_results(test_run_id);
CREATE INDEX idx_test_results_passed ON public.ai_chat_test_results(passed);
CREATE INDEX idx_test_results_created ON public.ai_chat_test_results(created_at DESC);
CREATE INDEX idx_test_runs_status ON public.ai_chat_test_runs(status);
CREATE INDEX idx_test_runs_created ON public.ai_chat_test_runs(started_at DESC);

-- Enable RLS
ALTER TABLE public.ai_chat_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_test_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow all authenticated users to view (admin-level feature)
CREATE POLICY "Authenticated users can view test results"
  ON public.ai_chat_test_results FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage test results"
  ON public.ai_chat_test_results FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view test runs"
  ON public.ai_chat_test_runs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage test runs"
  ON public.ai_chat_test_runs FOR ALL
  USING (auth.role() = 'service_role');