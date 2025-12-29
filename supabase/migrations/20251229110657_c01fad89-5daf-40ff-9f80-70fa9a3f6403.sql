-- ═══════════════════════════════════════════════════════════════════
-- SELF-LEARNING FAST PATH PATTERNS TABLE
-- Stores dynamically learned and managed Fast Path query patterns
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fast_path_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Pattern definition
  pattern_type TEXT NOT NULL DEFAULT 'count', -- 'count', 'list', 'filter'
  table_name TEXT NOT NULL,
  count_column TEXT DEFAULT 'id',
  
  -- Pattern matching
  keywords TEXT[] NOT NULL, -- ['hoeveel', 'werklocaties', 'amsterdam']
  regex_pattern TEXT, -- Auto-generated or manual regex
  filters JSONB DEFAULT '[]'::jsonb, -- [{"column": "plaats", "operator": "ilike", "value_index": 2}]
  active_filter BOOLEAN DEFAULT true, -- Whether to filter on is_active column
  
  -- Response template
  response_template TEXT NOT NULL,
  emoji TEXT DEFAULT '📊',
  
  -- Learning metrics
  confidence_score NUMERIC DEFAULT 0.60 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  harmful_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT false, -- Only active when confidence > 0.85
  source TEXT DEFAULT 'auto_learned' CHECK (source IN ('manual', 'auto_learned', 'imported', 'hardcoded_backup')),
  learned_from_query TEXT, -- Original query that created this pattern
  last_error TEXT, -- Most recent error for debugging
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_fast_path_patterns_active 
  ON fast_path_patterns(org_id, is_active) 
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_fast_path_patterns_keywords 
  ON fast_path_patterns USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_fast_path_patterns_table 
  ON fast_path_patterns(table_name) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fast_path_patterns_confidence 
  ON fast_path_patterns(confidence_score DESC) 
  WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE fast_path_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view patterns"
  ON fast_path_patterns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = fast_path_patterns.org_id
    AND user_organizations.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage patterns"
  ON fast_path_patterns FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage all patterns"
  ON fast_path_patterns FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_fast_path_patterns_updated_at
  BEFORE UPDATE ON fast_path_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- FAST PATH USAGE LOG TABLE
-- Tracks every Fast Path query for learning analysis
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fast_path_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Query details
  user_query TEXT NOT NULL,
  normalized_query TEXT, -- Lowercase, trimmed, no punctuation
  query_hash TEXT, -- For deduplication
  
  -- Matching
  pattern_id UUID REFERENCES fast_path_patterns(id) ON DELETE SET NULL,
  matched_hardcoded BOOLEAN DEFAULT false,
  hardcoded_pattern_name TEXT,
  
  -- Execution
  table_name TEXT,
  filters_applied JSONB,
  result_count INTEGER,
  response_time_ms INTEGER,
  
  -- Outcome
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Feedback (updated later)
  feedback_type TEXT CHECK (feedback_type IN ('helpful', 'harmful', NULL)),
  feedback_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fast_path_usage_log_org 
  ON fast_path_usage_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fast_path_usage_log_query_hash 
  ON fast_path_usage_log(query_hash);

CREATE INDEX IF NOT EXISTS idx_fast_path_usage_log_pattern 
  ON fast_path_usage_log(pattern_id) 
  WHERE pattern_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fast_path_usage_log_learning
  ON fast_path_usage_log(org_id, success, pattern_id)
  WHERE pattern_id IS NULL AND success = true;

-- Enable RLS
ALTER TABLE fast_path_usage_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view usage logs"
  ON fast_path_usage_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = fast_path_usage_log.org_id
    AND user_organizations.user_id = auth.uid()
  ));

CREATE POLICY "Service role can manage usage logs"
  ON fast_path_usage_log FOR ALL
  USING (true)
  WITH CHECK (true);