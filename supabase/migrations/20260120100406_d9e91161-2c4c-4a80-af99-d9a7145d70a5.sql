-- Fase 1: Feature Flags Corrigeren

-- 1.1: Multi-Agent Rollout naar 100% activeren
UPDATE system_feature_flags 
SET rollout_percentage = 100, 
    updated_at = NOW()
WHERE feature_name = 'multi_agent_architecture';

-- 1.2: React-Agent uitschakelen (rollout naar 0%)
UPDATE react_agent_config 
SET enabled = false,
    rollout_percentage = 0,
    updated_at = NOW()
WHERE config_key = 'default';

-- Voeg een audit log entry toe voor deze wijziging
INSERT INTO function_call_logs (function_name, org_id, execution_time_ms, success, metadata)
SELECT 
  'feature-flag-migration',
  id,
  0,
  true,
  jsonb_build_object(
    'action', 'activate_multi_agent_architecture',
    'changes', jsonb_build_array(
      'multi_agent_architecture.rollout_percentage: 0 → 100',
      'react_agent_config.enabled: true → false'
    ),
    'reason', 'Synchronize architecture with documentation - activate specialist agents'
  )
FROM organizations
LIMIT 1;