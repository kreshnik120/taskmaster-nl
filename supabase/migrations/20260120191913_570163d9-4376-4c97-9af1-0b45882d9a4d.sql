-- Add priority column to agent_specialists for multi-agent orchestration
ALTER TABLE agent_specialists 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- Set priorities for intake_verstuurd stage: document first, planning second
UPDATE agent_specialists SET priority = 1 
WHERE agent_name = 'document' AND handles_stage = 'intake_verstuurd';

UPDATE agent_specialists SET priority = 2 
WHERE agent_name = 'planning' AND handles_stage = 'intake_verstuurd';

-- Add index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_agent_specialists_stage_priority 
ON agent_specialists(handles_stage, priority, is_active);

COMMENT ON COLUMN agent_specialists.priority IS 'Execution order within a stage. Lower = earlier. Used for multi-agent orchestration in stages with multiple specialists.';