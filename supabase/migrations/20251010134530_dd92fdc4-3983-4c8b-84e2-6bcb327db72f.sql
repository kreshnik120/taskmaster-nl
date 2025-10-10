-- Fix 1: Update queue_embedding_generation met hardcoded URL en logging
CREATE OR REPLACE FUNCTION queue_embedding_generation()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Direct gebruik van hardcoded Supabase URL en service role key
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/generate-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := jsonb_build_object('knowledge_id', NEW.id)::text
  ) INTO request_id;
  
  RAISE LOG 'Queued embedding generation for knowledge_id: %, request_id: %', NEW.id, request_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 2: Drop en recreate triggers met ENABLE ALWAYS
DROP TRIGGER IF EXISTS generate_embedding_on_insert ON ai_knowledge_base;
DROP TRIGGER IF EXISTS generate_embedding_on_update ON ai_knowledge_base;

-- Recreate triggers
CREATE TRIGGER generate_embedding_on_insert
  AFTER INSERT ON ai_knowledge_base
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION queue_embedding_generation();

CREATE TRIGGER generate_embedding_on_update
  AFTER UPDATE OF value, key, category ON ai_knowledge_base
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL AND OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION queue_embedding_generation();

-- Force enable met ALWAYS (blijft enabled na restore)
ALTER TABLE ai_knowledge_base ENABLE ALWAYS TRIGGER generate_embedding_on_insert;
ALTER TABLE ai_knowledge_base ENABLE ALWAYS TRIGGER generate_embedding_on_update;