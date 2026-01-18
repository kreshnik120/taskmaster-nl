-- Fase 0: Database Voorbereidingen voor Multi-Agent Architectuur
-- ================================================================

-- A. Feature Flag Tabel voor veilige rollout
CREATE TABLE public.system_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name TEXT UNIQUE NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_feature_flags ENABLE ROW LEVEL SECURITY;

-- Admins can read/write, everyone can read for feature checking
CREATE POLICY "Anyone can read feature flags" ON public.system_feature_flags
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage feature flags" ON public.system_feature_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Insert migration feature flag (OFF by default for safe rollout)
INSERT INTO public.system_feature_flags (feature_name, is_enabled, rollout_percentage, metadata) 
VALUES (
  'multi_agent_architecture', 
  false, 
  0, 
  '{"version": "1.0.0", "description": "Enable specialist agents per pipeline stage", "created_by": "migration"}'::jsonb
);

-- B. Specialist Agents Registratie Tabel
CREATE TABLE public.agent_specialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT UNIQUE NOT NULL,
  handles_stage TEXT NOT NULL,
  target_stage TEXT NOT NULL,
  system_prompt TEXT,
  available_tools TEXT[] NOT NULL DEFAULT '{}',
  email_types TEXT[] NOT NULL DEFAULT '{}',
  transition_requirements JSONB DEFAULT '{}',
  requires_human_approval BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_specialists ENABLE ROW LEVEL SECURITY;

-- Anyone can read agent configs (needed by edge functions)
CREATE POLICY "Anyone can read agent specialists" ON public.agent_specialists
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage agent specialists" ON public.agent_specialists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Insert 5 specialist agent configurations
INSERT INTO public.agent_specialists (agent_name, handles_stage, target_stage, available_tools, email_types, transition_requirements, requires_human_approval) VALUES
  ('welkom', 'nieuw', 'intake_verstuurd', 
   ARRAY['send_email', 'query_application'], 
   ARRAY['welcome', 'welcome_intake'],
   '{"requires": ["welcome_email_sent_at"]}'::jsonb,
   false),
  ('document', 'intake_verstuurd', 'docs_compleet', 
   ARRAY['send_email', 'trigger_document_verification', 'register_document', 'query_documents'], 
   ARRAY['followup_question', 'document_request', 'documents_received_confirmation'],
   '{"requires": ["cv_in_documents", "diploma_in_documents", "diploma_verified", "completeness_70"]}'::jsonb,
   false),
  ('planning', 'docs_compleet', 'gesprek_gepland', 
   ARRAY['check_recruiter_availability', 'send_email', 'create_notification'], 
   ARRAY['interview_slot_proposal'],
   '{"requires": ["gesprek_datum_set"]}'::jsonb,
   false),
  ('screening', 'gesprek_gepland', 'screening', 
   ARRAY['send_email', 'request_vog', 'record_interview_feedback'], 
   ARRAY['vog_request', 'status_update'],
   '{"requires": ["gesprek_feedback_positive"]}'::jsonb,
   true),
  ('placement', 'screening', 'goedgekeurd', 
   ARRAY['send_email', 'verify_vog'], 
   ARRAY['approval_notification'],
   '{"requires": ["vog_verified"]}'::jsonb,
   true);

-- C. Migratie Audit Log voor vergelijking legacy vs new
CREATE TABLE public.migration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.professional_applications(id) ON DELETE SET NULL,
  trigger_source TEXT,
  old_system_action JSONB,
  new_system_action JSONB,
  matched BOOLEAN,
  discrepancy_notes TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.migration_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs
CREATE POLICY "Admins can read migration audit logs" ON public.migration_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can insert (edge functions)
CREATE POLICY "Service can insert audit logs" ON public.migration_audit_log
  FOR INSERT WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_migration_audit_application ON public.migration_audit_log(application_id);
CREATE INDEX idx_migration_audit_created ON public.migration_audit_log(created_at DESC);

-- D. Update triggers for updated_at
CREATE TRIGGER update_system_feature_flags_updated_at
  BEFORE UPDATE ON public.system_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_specialists_updated_at
  BEFORE UPDATE ON public.agent_specialists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();