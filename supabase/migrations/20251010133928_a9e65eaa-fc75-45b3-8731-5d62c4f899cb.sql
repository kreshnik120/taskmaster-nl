-- Stap 1: Drop bestaande triggers
DROP TRIGGER IF EXISTS generate_embedding_on_insert ON ai_knowledge_base;
DROP TRIGGER IF EXISTS generate_embedding_on_update ON ai_knowledge_base;

-- Stap 2: Verifieer pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Stap 3: Fix queue_embedding_generation functie
CREATE OR REPLACE FUNCTION queue_embedding_generation()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Haal URL en key op uit settings
  supabase_url := current_setting('app.supabase_url', true);
  service_key := current_setting('app.supabase_service_role_key', true);
  
  -- Roep edge function aan via pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/generate-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('knowledge_id', NEW.id)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stap 4: Creëer nieuwe triggers
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

-- Stap 5: Enable triggers expliciet
ALTER TABLE ai_knowledge_base ENABLE TRIGGER generate_embedding_on_insert;
ALTER TABLE ai_knowledge_base ENABLE TRIGGER generate_embedding_on_update;