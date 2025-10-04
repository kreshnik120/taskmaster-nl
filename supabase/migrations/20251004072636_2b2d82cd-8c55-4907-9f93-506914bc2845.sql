-- ============================================
-- STEP 3: Role-Aware RLS Policies
-- ============================================

-- ========================================
-- TIER 1: Critical Data - Admin + Manager
-- ========================================

-- 1. ai_knowledge_base: Knowledge management
DROP POLICY IF EXISTS "Users can manage their own knowledge" ON public.ai_knowledge_base;

CREATE POLICY "Admins and managers can manage knowledge"
ON public.ai_knowledge_base
FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'manager')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'manager')
);

CREATE POLICY "Users can view knowledge in their org"
ON public.ai_knowledge_base
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = ai_knowledge_base.org_id
      AND user_id = auth.uid()
  )
);

-- 2. ai_learning_events: AI feedback
DROP POLICY IF EXISTS "Users can manage their learning events" ON public.ai_learning_events;

CREATE POLICY "Admins and managers can manage learning events"
ON public.ai_learning_events
FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'manager')
);

CREATE POLICY "Users can insert their own feedback"
ON public.ai_learning_events
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = ai_learning_events.org_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can view learning events in their org"
ON public.ai_learning_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = ai_learning_events.org_id
      AND user_id = auth.uid()
  )
);

-- 3. clients: Client management
DROP POLICY IF EXISTS "Users can insert clients in their orgs" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients in their orgs" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients in their orgs" ON public.clients;

CREATE POLICY "Admins and managers can manage clients"
ON public.clients
FOR ALL
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = clients.org_id
      AND user_id = auth.uid()
  )
);

-- 4. professionals: Professional management
DROP POLICY IF EXISTS "Org members can insert professionals" ON public.professionals;
DROP POLICY IF EXISTS "Org members can update their professionals" ON public.professionals;
DROP POLICY IF EXISTS "Org members can delete their professionals" ON public.professionals;

CREATE POLICY "Admins can manage all professionals"
ON public.professionals
FOR ALL
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = professionals.org_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "Managers can manage professionals"
ON public.professionals
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'manager')
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = professionals.org_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "Managers can update professionals"
ON public.professionals
FOR UPDATE
USING (
  has_role(auth.uid(), 'manager')
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = professionals.org_id
      AND user_id = auth.uid()
  )
);

-- 5. professional_applications: Applications
DROP POLICY IF EXISTS "Org members can insert applications" ON public.professional_applications;
DROP POLICY IF EXISTS "Org members can update applications" ON public.professional_applications;
DROP POLICY IF EXISTS "Org members can delete applications" ON public.professional_applications;

CREATE POLICY "Admins and managers can manage applications"
ON public.professional_applications
FOR ALL
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = professional_applications.org_id
      AND user_id = auth.uid()
  )
);

-- 6. interview_appointments: Interview scheduling
DROP POLICY IF EXISTS "Org members can insert appointments" ON public.interview_appointments;
DROP POLICY IF EXISTS "Org members can update appointments" ON public.interview_appointments;
DROP POLICY IF EXISTS "Org members can delete appointments" ON public.interview_appointments;

CREATE POLICY "Admins and managers can manage appointments"
ON public.interview_appointments
FOR ALL
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = interview_appointments.org_id
      AND user_id = auth.uid()
  )
);

-- ========================================
-- TIER 2: System Tables - Admin Only
-- ========================================

-- 7. function_call_logs: System monitoring
DROP POLICY IF EXISTS "Org members can view their function logs" ON public.function_call_logs;

CREATE POLICY "Only admins can view function logs"
ON public.function_call_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = function_call_logs.org_id
      AND user_id = auth.uid()
  )
);

-- 8. ai_performance_metrics: Performance tracking
DROP POLICY IF EXISTS "Org members can view their metrics" ON public.ai_performance_metrics;

CREATE POLICY "Only admins can view performance metrics"
ON public.ai_performance_metrics
FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = ai_performance_metrics.org_id
      AND user_id = auth.uid()
  )
);

-- 9. scheduler_runs: Scheduler logs
DROP POLICY IF EXISTS "Org members can view scheduler runs" ON public.scheduler_runs;

CREATE POLICY "Only admins can view scheduler runs"
ON public.scheduler_runs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = scheduler_runs.org_id
      AND user_id = auth.uid()
  )
);