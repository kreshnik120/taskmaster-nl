-- FASE 1: Synaptische Versterking
-- Voeg usage tracking toe aan relationships
ALTER TABLE knowledge_relationships 
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Index voor performance bij graph traversal
CREATE INDEX IF NOT EXISTS idx_relationships_usage 
ON knowledge_relationships(source_knowledge_id, usage_count DESC);

-- FASE 4: Self-Supervised Pattern Discovery
-- Nieuwe tabel voor ontdekte meta-patterns
CREATE TABLE IF NOT EXISTS ai_meta_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  pattern_description TEXT NOT NULL,
  confidence NUMERIC,
  occurrences INTEGER,
  suggested_category TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,
  pattern_data JSONB DEFAULT '{}'::jsonb
);

-- RLS policies voor ai_meta_patterns
ALTER TABLE ai_meta_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meta patterns"
ON ai_meta_patterns FOR SELECT
USING (
  has_role(auth.uid(), 'admin') 
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = ai_meta_patterns.org_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "System can manage meta patterns"
ON ai_meta_patterns FOR ALL
USING (true)
WITH CHECK (true);