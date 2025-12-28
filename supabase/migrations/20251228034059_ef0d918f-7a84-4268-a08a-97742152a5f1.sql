-- Create increment_usage_count RPC for atomic usage tracking
CREATE OR REPLACE FUNCTION public.increment_usage_count(knowledge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE ai_knowledge_base
  SET 
    usage_count = COALESCE(usage_count, 0) + 1,
    last_used_at = NOW()
  WHERE id = knowledge_id;
END;
$$;