-- Create AI Health Summary RPC function
-- Provides comprehensive AI knowledge base metrics without 1000-row limit

CREATE OR REPLACE FUNCTION public.get_ai_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'counts', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'active', COUNT(*) FILTER (WHERE deleted_at IS NULL),
        'soft_deleted', COUNT(*) FILTER (WHERE deleted_at IS NOT NULL),
        'validated', COUNT(*) FILTER (WHERE deleted_at IS NULL AND validation_status = 'verified'),
        'pending', COUNT(*) FILTER (WHERE deleted_at IS NULL AND validation_status = 'pending'),
        'needs_review', COUNT(*) FILTER (WHERE deleted_at IS NULL AND needs_review = true),
        'high_confidence', COUNT(*) FILTER (WHERE deleted_at IS NULL AND confidence_score >= 0.8),
        'low_confidence', COUNT(*) FILTER (WHERE deleted_at IS NULL AND confidence_score < 0.5)
      )
      FROM ai_knowledge_base
    ),
    'quality', (
      SELECT jsonb_build_object(
        'avg_confidence', ROUND(AVG(confidence_score)::numeric, 3),
        'avg_usage', ROUND(AVG(usage_count)::numeric, 1),
        'helpful_total', COALESCE(SUM(helpful_count), 0),
        'harmful_total', COALESCE(SUM(harmful_count), 0)
      )
      FROM ai_knowledge_base
      WHERE deleted_at IS NULL
    ),
    'sources', (
      SELECT jsonb_object_agg(COALESCE(source_type, 'unknown'), cnt)
      FROM (
        SELECT source_type, COUNT(*) as cnt
        FROM ai_knowledge_base
        WHERE deleted_at IS NULL
        GROUP BY source_type
      ) s
    ),
    'top_categories', (
      SELECT jsonb_agg(jsonb_build_object('category', category, 'count', cnt))
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM ai_knowledge_base
        WHERE deleted_at IS NULL AND category IS NOT NULL
        GROUP BY category
        ORDER BY cnt DESC
        LIMIT 10
      ) c
    ),
    'learning_events_24h', (
      SELECT COUNT(*)
      FROM system_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND event_type LIKE 'learning_%'
    ),
    'generated_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_ai_health_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_health_summary() TO service_role;