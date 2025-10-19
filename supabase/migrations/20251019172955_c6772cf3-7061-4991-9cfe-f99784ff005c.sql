-- Create system_config table for global automation settings
CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  automation_paused boolean NOT NULL DEFAULT false,
  daily_ai_budget_eur numeric DEFAULT 10.00,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Policy: admins can manage system config
CREATE POLICY "Admins can manage system config"
ON system_config
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND EXISTS (
    SELECT 1 FROM user_organizations 
    WHERE user_organizations.org_id = system_config.org_id 
    AND user_organizations.user_id = auth.uid()
  )
);

-- Policy: org members can view system config
CREATE POLICY "Org members can view system config"
ON system_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_organizations 
    WHERE user_organizations.org_id = system_config.org_id 
    AND user_organizations.user_id = auth.uid()
  )
);

-- Insert default config for existing orgs
INSERT INTO system_config (org_id, automation_paused, daily_ai_budget_eur)
SELECT id, false, 10.00 
FROM organizations
ON CONFLICT DO NOTHING;