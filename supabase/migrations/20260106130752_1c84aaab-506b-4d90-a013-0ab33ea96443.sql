-- ============================================================================
-- ENTERPRISE REACT AI AGENT: Database Schema Migration
-- ============================================================================

-- 1. Agent Execution Traces - Complete audit trail of ReAct sessions
CREATE TABLE IF NOT EXISTS public.agent_execution_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  goal_type TEXT,
  goal_description TEXT NOT NULL,
  natural_language_goal TEXT,
  input_data JSONB DEFAULT '{}',
  steps JSONB NOT NULL DEFAULT '[]',
  final_answer TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'partial', 'timeout', 'human_approval_required')),
  total_tokens_used INTEGER DEFAULT 0,
  total_duration_ms INTEGER,
  tool_usage_stats JSONB DEFAULT '{}',
  tools_executed TEXT[] DEFAULT '{}',
  learning_applied BOOLEAN DEFAULT false,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_org_id ON public.agent_execution_traces(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_session_id ON public.agent_execution_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_outcome ON public.agent_execution_traces(outcome);
CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_created_at ON public.agent_execution_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_goal_type ON public.agent_execution_traces(goal_type);

-- Enable RLS
ALTER TABLE public.agent_execution_traces ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using user_organizations for org membership)
CREATE POLICY "Users can view their org execution traces"
ON public.agent_execution_traces FOR SELECT
USING (org_id IN (
  SELECT uo.org_id FROM user_organizations uo WHERE uo.user_id = auth.uid()
));

CREATE POLICY "Service role can manage all execution traces"
ON public.agent_execution_traces FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Tool Stability Scores - Track tool performance over time
CREATE TABLE IF NOT EXISTS public.tool_stability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  total_executions INTEGER DEFAULT 0,
  avg_execution_ms NUMERIC DEFAULT 0,
  stability_score NUMERIC DEFAULT 0.8 CHECK (stability_score >= 0 AND stability_score <= 1),
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  error_categories JSONB DEFAULT '{}',
  context_performance JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tool_name, org_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tool_stability_scores_tool_name ON public.tool_stability_scores(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_stability_scores_org_id ON public.tool_stability_scores(org_id);
CREATE INDEX IF NOT EXISTS idx_tool_stability_scores_stability ON public.tool_stability_scores(stability_score DESC);

-- Enable RLS
ALTER TABLE public.tool_stability_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view tool stability scores"
ON public.tool_stability_scores FOR SELECT
USING (org_id IS NULL OR org_id IN (
  SELECT uo.org_id FROM user_organizations uo WHERE uo.user_id = auth.uid()
));

CREATE POLICY "Service role can manage tool stability scores"
ON public.tool_stability_scores FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Pending Approvals - Human-in-the-loop for critical actions
CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  trace_id UUID REFERENCES agent_execution_traces(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_data JSONB NOT NULL,
  reason TEXT,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'expired')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_approvals_org_id ON public.pending_approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON public.pending_approvals(status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires_at ON public.pending_approvals(expires_at);

-- Enable RLS
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org pending approvals"
ON public.pending_approvals FOR SELECT
USING (org_id IN (
  SELECT uo.org_id FROM user_organizations uo WHERE uo.user_id = auth.uid()
));

CREATE POLICY "Users can update their org pending approvals"
ON public.pending_approvals FOR UPDATE
USING (org_id IN (
  SELECT uo.org_id FROM user_organizations uo WHERE uo.user_id = auth.uid()
));

CREATE POLICY "Service role can manage all pending approvals"
ON public.pending_approvals FOR ALL
USING (true)
WITH CHECK (true);

-- 4. ReAct Agent Configuration - Feature flags and settings
CREATE TABLE IF NOT EXISTS public.react_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  rollout_percentage INTEGER DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  excluded_goal_types TEXT[] DEFAULT '{}',
  max_steps INTEGER DEFAULT 15,
  max_emails_per_session INTEGER DEFAULT 5,
  max_database_mutations INTEGER DEFAULT 10,
  timeout_seconds INTEGER DEFAULT 120,
  fallback_on_error BOOLEAN DEFAULT true,
  monitoring_mode BOOLEAN DEFAULT true,
  critical_actions TEXT[] DEFAULT ARRAY['delete_professional', 'reject_application', 'send_contract', 'bulk_email'],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);

-- Enable RLS
ALTER TABLE public.react_agent_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org config"
ON public.react_agent_config FOR SELECT
USING (org_id IS NULL OR org_id IN (
  SELECT uo.org_id FROM user_organizations uo WHERE uo.user_id = auth.uid()
));

CREATE POLICY "Service role can manage config"
ON public.react_agent_config FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Insert default global config
INSERT INTO public.react_agent_config (org_id, enabled, rollout_percentage)
VALUES (NULL, true, 10)
ON CONFLICT DO NOTHING;

-- 6. RPC Function: Update Tool Stability Score (Atomic)
CREATE OR REPLACE FUNCTION public.update_tool_stability(
  p_tool_name TEXT,
  p_org_id UUID,
  p_success BOOLEAN,
  p_execution_ms INTEGER DEFAULT NULL
)
RETURNS public.tool_stability_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.tool_stability_scores;
  v_delta NUMERIC;
BEGIN
  v_delta := CASE WHEN p_success THEN 0.02 ELSE -0.03 END;
  
  INSERT INTO public.tool_stability_scores (
    tool_name, org_id, success_count, failure_count, total_executions,
    avg_execution_ms, stability_score, last_success_at, last_failure_at,
    last_used_at, updated_at
  )
  VALUES (
    p_tool_name, p_org_id,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    1, COALESCE(p_execution_ms, 0),
    GREATEST(0.1, LEAST(1.0, 0.8 + v_delta)),
    CASE WHEN p_success THEN now() ELSE NULL END,
    CASE WHEN NOT p_success THEN now() ELSE NULL END,
    now(), now()
  )
  ON CONFLICT (tool_name, org_id) DO UPDATE SET
    success_count = tool_stability_scores.success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
    failure_count = tool_stability_scores.failure_count + CASE WHEN p_success THEN 0 ELSE 1 END,
    total_executions = tool_stability_scores.total_executions + 1,
    avg_execution_ms = CASE 
      WHEN p_execution_ms IS NOT NULL THEN
        (tool_stability_scores.avg_execution_ms * tool_stability_scores.total_executions + p_execution_ms) 
        / (tool_stability_scores.total_executions + 1)
      ELSE tool_stability_scores.avg_execution_ms
    END,
    stability_score = GREATEST(0.1, LEAST(1.0, tool_stability_scores.stability_score + v_delta)),
    last_success_at = CASE WHEN p_success THEN now() ELSE tool_stability_scores.last_success_at END,
    last_failure_at = CASE WHEN NOT p_success THEN now() ELSE tool_stability_scores.last_failure_at END,
    last_used_at = now(),
    updated_at = now()
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 7. RPC Function: Get Tool Stability Scores
CREATE OR REPLACE FUNCTION public.get_tool_stability_scores(
  p_tool_names TEXT[],
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  tool_name TEXT,
  stability_score NUMERIC,
  success_rate NUMERIC,
  total_executions INTEGER,
  avg_execution_ms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tool_name,
    t.stability_score,
    CASE 
      WHEN t.total_executions > 0 THEN 
        t.success_count::NUMERIC / t.total_executions 
      ELSE 0.8 
    END as success_rate,
    t.total_executions,
    t.avg_execution_ms
  FROM public.tool_stability_scores t
  WHERE t.tool_name = ANY(p_tool_names)
    AND (t.org_id = p_org_id OR t.org_id IS NULL)
  ORDER BY t.org_id NULLS LAST;
END;
$$;

-- 8. Enable realtime for monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_execution_traces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_approvals;