-- Update the check_user_id_or_system constraint to include all system-generated event types
ALTER TABLE public.ai_learning_events DROP CONSTRAINT IF EXISTS check_user_id_or_system;

ALTER TABLE public.ai_learning_events ADD CONSTRAINT check_user_id_or_system CHECK (
  (user_id IS NOT NULL) OR 
  (event_type = ANY (ARRAY[
    -- Original system event types
    'auto_validation'::text, 
    'system_health'::text, 
    'auto_resolve'::text, 
    'auto_pruning'::text,
    -- Diploma verification events (system-triggered, no user context)
    'diploma_verification'::text,
    'diploma_verification_retry'::text,
    'diploma_fraud_alert'::text,
    'diploma_level_mismatch'::text,
    -- EMREX events (webhook-triggered, no user context)
    'emrex_invitation_sent'::text,
    'emrex_verification_completed'::text,
    -- Agent/automation events (system-triggered)
    'agent_action_completed'::text,
    -- Learning engine events that may run as system
    'chat_learning'::text,
    'feedback_learning'::text,
    'pipeline_learning'::text,
    'self_training'::text,
    -- Other system-triggered events
    'professional_client_relation'::text,
    'org_profile_mismatch'::text
  ]))
);