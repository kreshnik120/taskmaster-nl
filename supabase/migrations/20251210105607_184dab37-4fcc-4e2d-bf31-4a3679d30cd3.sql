-- ============================================================================
-- ATOMIC LEARNING OPERATIONS - Race condition prevention
-- Fase 2: Unified Learner - Atomische database operaties
-- ============================================================================

-- Atomic confidence update - vermijdt race conditions bij concurrent updates
CREATE OR REPLACE FUNCTION public.atomic_update_confidence(
  p_knowledge_id UUID,
  p_delta NUMERIC,
  p_min_confidence NUMERIC DEFAULT 0.30,
  p_max_confidence NUMERIC DEFAULT 1.00,
  p_prune_threshold NUMERIC DEFAULT 0.25,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  new_confidence NUMERIC,
  was_pruned BOOLEAN,
  old_confidence NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_confidence NUMERIC;
  v_new_confidence NUMERIC;
  v_should_prune BOOLEAN := FALSE;
BEGIN
  -- Lock row and get current confidence atomically
  SELECT confidence_score INTO v_old_confidence
  FROM ai_knowledge_base
  WHERE id = p_knowledge_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge item not found: %', p_knowledge_id;
  END IF;
  
  -- Calculate new confidence with bounds
  v_new_confidence := GREATEST(
    p_min_confidence,
    LEAST(p_max_confidence, COALESCE(v_old_confidence, 0.70) + p_delta)
  );
  
  -- Check if should be pruned
  IF v_new_confidence < p_prune_threshold THEN
    v_should_prune := TRUE;
    
    -- Soft delete
    UPDATE ai_knowledge_base
    SET 
      confidence_score = v_new_confidence,
      deleted_at = NOW(),
      deletion_reason = jsonb_build_object(
        'reason', COALESCE(p_reason, 'Auto-pruned: low confidence'),
        'old_confidence', v_old_confidence,
        'new_confidence', v_new_confidence,
        'timestamp', NOW()
      ),
      updated_at = NOW()
    WHERE id = p_knowledge_id;
  ELSE
    -- Normal update
    UPDATE ai_knowledge_base
    SET 
      confidence_score = v_new_confidence,
      updated_at = NOW()
    WHERE id = p_knowledge_id;
  END IF;
  
  RETURN QUERY SELECT v_new_confidence, v_should_prune, v_old_confidence;
END;
$$;

-- Atomic feedback increment - vermijdt lost updates bij concurrent feedback
CREATE OR REPLACE FUNCTION public.atomic_increment_feedback(
  p_knowledge_id UUID,
  p_feedback_type TEXT, -- 'helpful' or 'harmful'
  p_harmful_prune_min_votes INTEGER DEFAULT 3,
  p_harmful_prune_ratio NUMERIC DEFAULT 0.70
)
RETURNS TABLE(
  new_helpful_count INTEGER,
  new_harmful_count INTEGER,
  should_prune BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_helpful INTEGER;
  v_harmful INTEGER;
  v_should_prune BOOLEAN := FALSE;
  v_total INTEGER;
  v_harmful_ratio NUMERIC;
BEGIN
  -- Lock and update atomically
  IF p_feedback_type = 'helpful' THEN
    UPDATE ai_knowledge_base
    SET 
      helpful_count = COALESCE(helpful_count, 0) + 1,
      updated_at = NOW()
    WHERE id = p_knowledge_id
    RETURNING helpful_count, harmful_count INTO v_helpful, v_harmful;
  ELSIF p_feedback_type = 'harmful' THEN
    UPDATE ai_knowledge_base
    SET 
      harmful_count = COALESCE(harmful_count, 0) + 1,
      updated_at = NOW()
    WHERE id = p_knowledge_id
    RETURNING helpful_count, harmful_count INTO v_helpful, v_harmful;
  ELSE
    RAISE EXCEPTION 'Invalid feedback type: %. Must be helpful or harmful', p_feedback_type;
  END IF;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge item not found: %', p_knowledge_id;
  END IF;
  
  -- Calculate prune decision
  v_helpful := COALESCE(v_helpful, 0);
  v_harmful := COALESCE(v_harmful, 0);
  v_total := v_helpful + v_harmful;
  
  IF v_total >= p_harmful_prune_min_votes THEN
    v_harmful_ratio := v_harmful::NUMERIC / v_total;
    IF v_harmful_ratio >= p_harmful_prune_ratio THEN
      v_should_prune := TRUE;
    END IF;
  END IF;
  
  RETURN QUERY SELECT v_helpful, v_harmful, v_should_prune;
END;
$$;

-- Atomic reinforce - stabilityscore + usage in één operatie
CREATE OR REPLACE FUNCTION public.atomic_reinforce_knowledge(
  p_knowledge_id UUID,
  p_stability_boost NUMERIC DEFAULT 0.05,
  p_increment_usage BOOLEAN DEFAULT TRUE,
  p_max_stability NUMERIC DEFAULT 1.00
)
RETURNS TABLE(
  new_stability NUMERIC,
  new_usage_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stability NUMERIC;
  v_new_usage INTEGER;
BEGIN
  UPDATE ai_knowledge_base
  SET 
    stability_score = LEAST(p_max_stability, COALESCE(stability_score, 0.5) + p_stability_boost),
    usage_count = CASE WHEN p_increment_usage THEN COALESCE(usage_count, 0) + 1 ELSE usage_count END,
    last_used_at = CASE WHEN p_increment_usage THEN NOW() ELSE last_used_at END,
    updated_at = NOW()
  WHERE id = p_knowledge_id
  RETURNING stability_score, usage_count INTO v_new_stability, v_new_usage;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge item not found: %', p_knowledge_id;
  END IF;
  
  RETURN QUERY SELECT v_new_stability, v_new_usage;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.atomic_update_confidence TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_increment_feedback TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_reinforce_knowledge TO authenticated, service_role;

COMMENT ON FUNCTION public.atomic_update_confidence IS 'Atomische confidence update met row locking - voorkomt race conditions';
COMMENT ON FUNCTION public.atomic_increment_feedback IS 'Atomische feedback increment met auto-prune check';
COMMENT ON FUNCTION public.atomic_reinforce_knowledge IS 'Atomische stability/usage update';