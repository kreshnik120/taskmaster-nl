-- Add missing columns to message_feedback for feedback loop repair
ALTER TABLE message_feedback 
ADD COLUMN IF NOT EXISTS knowledge_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS processed_by TEXT;

-- Index for unprocessed feedback (batch processing)
CREATE INDEX IF NOT EXISTS idx_message_feedback_unprocessed 
ON message_feedback(created_at) 
WHERE processed_at IS NULL;