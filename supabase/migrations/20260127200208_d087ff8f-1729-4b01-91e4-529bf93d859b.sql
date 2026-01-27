-- Fase 7D: Add ai_context JSONB column to tasks table for intelligent task creation
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS ai_context JSONB DEFAULT '{}'::jsonb;

-- Add documentation comment
COMMENT ON COLUMN tasks.ai_context IS 'AI-gegenereerde context: actieplan, suggestie, betrokkenen, bron info (Fase 7D)';

-- Create index for efficient querying of ai_context
CREATE INDEX IF NOT EXISTS idx_tasks_ai_context ON tasks USING gin(ai_context);