-- =====================================================
-- Phase 2 Final Hardening: Org-Scoped Atomic RPC's
-- =====================================================
-- Security fix: Add mandatory org_id parameter to all atomic RPCs

-- Drop ALL existing overloads with CASCADE
DROP FUNCTION IF EXISTS public.atomic_update_confidence CASCADE;
DROP FUNCTION IF EXISTS public.atomic_increment_feedback CASCADE;
DROP FUNCTION IF EXISTS public.atomic_reinforce_knowledge CASCADE;

-- =====================================================
-- 1. atomic_update_confidence with org-scope
-- =====================================================
CREATE FUNCTION public.atomic_update_confidence(
  p_knowledge_id UUID,
  p_org_id UUID,
  p_delta NUMERIC,
  p_min_confidence NUMERIC DEFAULT 0.0,
  p_max_confidence NUMERIC DEFAULT 1.0,
  p_auto_prune BOOLEAN DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_confidence NUMERIC;
  v_new_confidence NUMERIC;
  v_was_pruned BOOLEAN := false;
BEGIN
  SELECT confidence_score INTO v_old_confidence
  FROM ai_knowledge_base
  WHERE id = p_knowledge_id 
    AND org_id = p_org_id
    AND deleted_at IS NULL
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Knowledge item not found or access denied'
    );
  END IF;
  
  v_new_confidence := GREATEST(
    p_min_confidence,
    LEAST(p_max_confidence, COALESCE(v_old_confidence, 0.5) + p_delta)
  );
  
  IF p_auto_prune AND v_new_confidence < 0.15 THEN
    UPDATE ai_knowledge_base
    SET 
      deleted_at = NOW(),
      deleted_by = NULL,
      deletion_reason = jsonb_build_object(
        'reason', 'auto_pruned_low_confidence',
        'final_confidence', v_new_confidence,
        'pruned_at', NOW()
      ),
      updated_at = NOW()
    WHERE id = p_knowledge_id AND org_id = p_org_id;
    v_was_pruned := true;
  ELSE
    UPDATE ai_knowledge_base
    SET 
      confidence_score = v_new_confidence,
      updated_at = NOW()
    WHERE id = p_knowledge_id AND org_id = p_org_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'old_confidence', v_old_confidence,
    'new_confidence', v_new_confidence,
    'was_pruned', v_was_pruned
  );
END;
$$;

-- =====================================================
-- 2. atomic_increment_feedback with org-scope
-- =====================================================
CREATE FUNCTION public.atomic_increment_feedback(
  p_knowledge_id UUID,
  p_org_id UUID,
  p_feedback_type TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_helpful_count INTEGER;
  v_harmful_count INTEGER;
  v_should_prune BOOLEAN := false;
BEGIN
  IF p_feedback_type NOT IN ('helpful', 'harmful') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid feedback type'
    );
  END IF;
  
  IF p_feedback_type = 'helpful' THEN
    UPDATE ai_knowledge_base
    SET 
      helpful_count = COALESCE(helpful_count, 0) + 1,
      updated_at = NOW()
    WHERE id = p_knowledge_id 
      AND org_id = p_org_id
      AND deleted_at IS NULL
    RETURNING helpful_count, harmful_count INTO v_helpful_count, v_harmful_count;
  ELSE
    UPDATE ai_knowledge_base
    SET 
      harmful_count = COALESCE(harmful_count, 0) + 1,
      updated_at = NOW()
    WHERE id = p_knowledge_id 
      AND org_id = p_org_id
      AND deleted_at IS NULL
    RETURNING helpful_count, harmful_count INTO v_helpful_count, v_harmful_count;
  END IF;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Knowledge item not found or access denied'
    );
  END IF;
  
  v_should_prune := COALESCE(v_harmful_count, 0) > COALESCE(v_helpful_count, 0) + 5;
  
  RETURN jsonb_build_object(
    'success', true,
    'helpful_count', COALESCE(v_helpful_count, 0),
    'harmful_count', COALESCE(v_harmful_count, 0),
    'should_prune', v_should_prune
  );
END;
$$;

-- =====================================================
-- 3. atomic_reinforce_knowledge with org-scope
-- =====================================================
CREATE FUNCTION public.atomic_reinforce_knowledge(
  p_knowledge_id UUID,
  p_org_id UUID,
  p_stability_boost NUMERIC DEFAULT 0.05,
  p_usage_increment INTEGER DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stability NUMERIC;
  v_new_usage_count INTEGER;
BEGIN
  UPDATE ai_knowledge_base
  SET 
    stability_score = LEAST(1.0, COALESCE(stability_score, 0.5) + p_stability_boost),
    usage_count = COALESCE(usage_count, 0) + p_usage_increment,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_knowledge_id 
    AND org_id = p_org_id
    AND deleted_at IS NULL
  RETURNING stability_score, usage_count INTO v_new_stability, v_new_usage_count;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Knowledge item not found or access denied'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_stability', v_new_stability,
    'new_usage_count', v_new_usage_count
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.atomic_update_confidence(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_increment_feedback(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_reinforce_knowledge(UUID, UUID, NUMERIC, INTEGER) TO authenticated, service_role;