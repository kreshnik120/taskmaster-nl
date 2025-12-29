-- ============================================
-- Pattern Optimization: Add tracking columns + RPC function
-- ============================================

-- 1. Add new columns for advanced pattern tracking
ALTER TABLE fast_path_patterns 
ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_reactivation_eligible BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER DEFAULT 0;

-- 2. Create atomic increment function for pattern counters
CREATE OR REPLACE FUNCTION increment_pattern_counter(
  pattern_id UUID,
  counter_name TEXT,
  delta INTEGER DEFAULT 1
) RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE fast_path_patterns SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE id = $2',
    counter_name, counter_name
  ) USING delta, pattern_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Create function to update pattern metrics atomically
CREATE OR REPLACE FUNCTION update_pattern_metrics(
  p_pattern_id UUID,
  p_response_time_ms INTEGER,
  p_was_successful BOOLEAN,
  p_reset_errors BOOLEAN DEFAULT false
) RETURNS void AS $$
DECLARE
  current_avg INTEGER;
  current_usage INTEGER;
BEGIN
  -- Get current values
  SELECT avg_response_time_ms, usage_count INTO current_avg, current_usage
  FROM fast_path_patterns WHERE id = p_pattern_id;
  
  -- Update with exponential moving average for response time
  UPDATE fast_path_patterns SET
    usage_count = COALESCE(usage_count, 0) + 1,
    success_count = CASE WHEN p_was_successful THEN COALESCE(success_count, 0) + 1 ELSE success_count END,
    error_count = CASE WHEN NOT p_was_successful THEN COALESCE(error_count, 0) + 1 ELSE error_count END,
    consecutive_errors = CASE 
      WHEN p_reset_errors THEN 0
      WHEN NOT p_was_successful THEN COALESCE(consecutive_errors, 0) + 1 
      ELSE 0 
    END,
    last_used_at = NOW(),
    last_success_at = CASE WHEN p_was_successful THEN NOW() ELSE last_success_at END,
    avg_response_time_ms = CASE
      WHEN current_usage = 0 OR current_avg = 0 THEN p_response_time_ms
      ELSE ROUND((current_avg * 0.8) + (p_response_time_ms * 0.2))::INTEGER
    END,
    updated_at = NOW()
  WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Add index for health monitoring queries
CREATE INDEX IF NOT EXISTS idx_fast_path_patterns_health_check 
ON fast_path_patterns (org_id, is_active, deleted_at) 
WHERE deleted_at IS NULL;

COMMENT ON FUNCTION increment_pattern_counter IS 'Atomically increment a counter column on fast_path_patterns';
COMMENT ON FUNCTION update_pattern_metrics IS 'Update pattern metrics with response time EMA and error tracking';