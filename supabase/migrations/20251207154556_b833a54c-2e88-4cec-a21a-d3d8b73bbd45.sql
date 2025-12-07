-- =============================================
-- AI AGENT FOUNDATION TABLES
-- =============================================

-- Agent Goals: High-level objectives for the AI to achieve
CREATE TABLE public.agent_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Goal definition
  goal_type TEXT NOT NULL, -- 'interview_reminder', 'candidate_onboarding', 'weekly_digest', 'proactive_matching'
  goal_description TEXT NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'planning', 'executing', 'completed', 'failed', 'cancelled'
  priority INTEGER NOT NULL DEFAULT 5, -- 1-10, higher = more urgent
  
  -- Timing
  deadline TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Context & Results
  trigger_event JSONB DEFAULT '{}'::jsonb, -- What triggered this goal
  input_data JSONB DEFAULT '{}'::jsonb, -- Input parameters
  output_data JSONB DEFAULT '{}'::jsonb, -- Results/outcomes
  plan JSONB DEFAULT '[]'::jsonb, -- Generated action plan
  
  -- Learning
  success_score NUMERIC(3,2), -- 0.00-1.00 success rating
  learnings JSONB DEFAULT '{}'::jsonb, -- What was learned
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agent Actions: Individual steps within a goal
CREATE TABLE public.agent_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES public.agent_goals(id) ON DELETE CASCADE,
  
  -- Action definition
  action_type TEXT NOT NULL, -- 'send_whatsapp', 'send_email', 'update_database', 'call_api', 'wait', 'check_condition'
  action_order INTEGER NOT NULL DEFAULT 0,
  action_description TEXT,
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'executing', 'completed', 'failed', 'skipped'
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  
  -- Timing
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- External execution tracking
  external_id TEXT, -- ID from n8n or other external system
  webhook_url TEXT, -- URL called for this action
  callback_received BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agent Task Queue: Scheduled tasks waiting for execution
CREATE TABLE public.agent_task_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID REFERENCES public.agent_goals(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.agent_actions(id) ON DELETE CASCADE,
  
  -- Task definition
  task_type TEXT NOT NULL, -- 'execute_action', 'check_goal_status', 'process_callback', 'retry_failed'
  priority INTEGER NOT NULL DEFAULT 5,
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  execute_after TIMESTAMP WITH TIME ZONE, -- Don't execute before this time
  
  -- Execution control
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'locked', 'processing', 'completed', 'failed'
  locked_by TEXT, -- Worker ID that locked this task
  locked_until TIMESTAMP WITH TIME ZONE,
  
  -- Data
  execution_data JSONB DEFAULT '{}'::jsonb,
  result_data JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  
  -- Retry logic
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Goals indexes
CREATE INDEX idx_agent_goals_org_id ON public.agent_goals(org_id);
CREATE INDEX idx_agent_goals_status ON public.agent_goals(status);
CREATE INDEX idx_agent_goals_goal_type ON public.agent_goals(goal_type);
CREATE INDEX idx_agent_goals_created_at ON public.agent_goals(created_at DESC);

-- Actions indexes
CREATE INDEX idx_agent_actions_goal_id ON public.agent_actions(goal_id);
CREATE INDEX idx_agent_actions_status ON public.agent_actions(status);
CREATE INDEX idx_agent_actions_scheduled_at ON public.agent_actions(scheduled_at);

-- Task queue indexes (critical for polling performance)
CREATE INDEX idx_agent_task_queue_pending ON public.agent_task_queue(scheduled_at) 
  WHERE status = 'pending';
CREATE INDEX idx_agent_task_queue_locked ON public.agent_task_queue(locked_until) 
  WHERE status = 'locked';
CREATE INDEX idx_agent_task_queue_goal_id ON public.agent_task_queue(goal_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.agent_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_queue ENABLE ROW LEVEL SECURITY;

-- Goals policies
CREATE POLICY "Org members can view agent goals"
  ON public.agent_goals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = agent_goals.org_id
    AND user_organizations.user_id = auth.uid()
  ));

CREATE POLICY "Admins and managers can manage agent goals"
  ON public.agent_goals FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
    AND EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = agent_goals.org_id
      AND user_organizations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
    AND EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = agent_goals.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage all goals"
  ON public.agent_goals FOR ALL
  USING (true)
  WITH CHECK (true);

-- Actions policies
CREATE POLICY "Org members can view agent actions"
  ON public.agent_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agent_goals g
    JOIN user_organizations uo ON uo.org_id = g.org_id
    WHERE g.id = agent_actions.goal_id
    AND uo.user_id = auth.uid()
  ));

CREATE POLICY "Service role can manage all actions"
  ON public.agent_actions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Task queue policies
CREATE POLICY "Org members can view task queue"
  ON public.agent_task_queue FOR SELECT
  USING (
    goal_id IS NULL OR EXISTS (
      SELECT 1 FROM agent_goals g
      JOIN user_organizations uo ON uo.org_id = g.org_id
      WHERE g.id = agent_task_queue.goal_id
      AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage task queue"
  ON public.agent_task_queue FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

CREATE TRIGGER update_agent_goals_updated_at
  BEFORE UPDATE ON public.agent_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_timestamp();

CREATE TRIGGER update_agent_actions_updated_at
  BEFORE UPDATE ON public.agent_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_timestamp();

-- =============================================
-- TRIGGER: Auto-create goal on interview scheduled
-- =============================================

CREATE OR REPLACE FUNCTION public.create_interview_reminder_goal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger on new interviews or rescheduled interviews
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at) THEN
    -- Create reminder goal 24 hours before interview
    INSERT INTO public.agent_goals (
      org_id,
      goal_type,
      goal_description,
      priority,
      deadline,
      trigger_event,
      input_data
    ) VALUES (
      NEW.org_id,
      'interview_reminder',
      'Send interview reminders for ' || NEW.id,
      7, -- High priority
      NEW.scheduled_at - INTERVAL '1 hour', -- Must complete 1h before interview
      jsonb_build_object(
        'trigger_type', TG_OP,
        'table', 'interview_appointments',
        'interview_id', NEW.id
      ),
      jsonb_build_object(
        'interview_id', NEW.id,
        'application_id', NEW.application_id,
        'professional_id', NEW.professional_id,
        'scheduled_at', NEW.scheduled_at,
        'location', NEW.location,
        'meeting_link', NEW.meeting_link
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_interview_reminder_goal
  AFTER INSERT OR UPDATE ON public.interview_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_interview_reminder_goal();