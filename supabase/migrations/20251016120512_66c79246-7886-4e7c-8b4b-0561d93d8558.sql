-- Fase 1: Reset stuck orchestrator run (CORRECTE VERSIE - heartbeat in metadata)
UPDATE orchestrator_state
SET status = 'error',
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{error}',
      '"Manual recovery - implementing autonomous AI system"'::jsonb
    )
WHERE status = 'running'
  AND (metadata->>'last_heartbeat')::timestamptz < NOW() - INTERVAL '5 minutes';

-- Fase 4: Tabel voor system health logging
CREATE TABLE IF NOT EXISTS system_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS voor system_health_log
ALTER TABLE system_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view health logs"
ON system_health_log FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = system_health_log.org_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "System can insert health logs"
ON system_health_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- Index voor snellere queries
CREATE INDEX idx_health_log_org_created ON system_health_log(org_id, created_at DESC);
CREATE INDEX idx_health_log_check_type ON system_health_log(check_type, created_at DESC);