-- Fase 1: Confidence Tracking Database Support
-- Add confidence_score column to ai_learning_events
ALTER TABLE ai_learning_events ADD COLUMN IF NOT EXISTS confidence_score NUMERIC DEFAULT 0.5;

-- Create confidence_tracking table for analytics
CREATE TABLE IF NOT EXISTS confidence_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  question TEXT NOT NULL,
  initial_confidence NUMERIC NOT NULL,
  final_confidence NUMERIC NOT NULL,
  iterations_count INTEGER NOT NULL DEFAULT 1,
  used_knowledge_ids UUID[] NOT NULL DEFAULT '{}',
  harvester_triggered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on confidence_tracking
ALTER TABLE confidence_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies for confidence_tracking
CREATE POLICY "Users can view their own confidence tracking"
  ON confidence_tracking FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own confidence tracking"
  ON confidence_tracking FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_confidence_tracking_user_org 
  ON confidence_tracking(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_confidence_tracking_created 
  ON confidence_tracking(created_at DESC);