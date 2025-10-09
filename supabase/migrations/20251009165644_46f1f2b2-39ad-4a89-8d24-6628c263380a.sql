-- Disable auto_learn_from_chat trigger to fix assistant message persistence
-- Issue: Trigger causes PostgreSQL Error 42704 (unrecognized configuration parameter "app.supabase_url")
-- This blocks ALL assistant messages from being saved to chat_messages table
-- Trade-off: Meta-orchestrator auto-learning temporarily suspended until trigger is fixed

ALTER TABLE chat_messages DISABLE TRIGGER auto_learn_from_chat;

COMMENT ON TRIGGER auto_learn_from_chat ON chat_messages IS 
'DISABLED (2025-01-09): Trigger caused PostgreSQL error 42704 with app.supabase_url setting. Meta-orchestrator functionality temporarily suspended to allow assistant message persistence. Will be re-enabled after fixing trigger function dependency on configuration parameters.';