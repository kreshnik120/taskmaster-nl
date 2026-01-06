-- Add config_key column to react_agent_config for feature flag lookup
ALTER TABLE react_agent_config 
ADD COLUMN IF NOT EXISTS config_key TEXT UNIQUE DEFAULT 'default';

-- Update existing rows to have config_key and enable testing
UPDATE react_agent_config 
SET config_key = COALESCE(config_key, 'default'),
    rollout_percentage = 100,
    monitoring_mode = true;

-- Ensure at least one default config exists
INSERT INTO react_agent_config (config_key, rollout_percentage, monitoring_mode)
SELECT 'default', 100, true
WHERE NOT EXISTS (SELECT 1 FROM react_agent_config WHERE config_key = 'default');