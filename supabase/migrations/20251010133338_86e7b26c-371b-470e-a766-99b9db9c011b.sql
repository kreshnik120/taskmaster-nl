-- Create database trigger om automatisch embeddings te genereren
CREATE OR REPLACE FUNCTION public.queue_embedding_generation()
RETURNS TRIGGER AS $$
BEGIN
  -- Roep generate-embedding function aan via pg_net
  PERFORM net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/generate-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := jsonb_build_object('knowledge_id', NEW.id)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger voor INSERT
DROP TRIGGER IF EXISTS generate_embedding_on_insert ON public.ai_knowledge_base;
CREATE TRIGGER generate_embedding_on_insert
  AFTER INSERT ON public.ai_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_embedding_generation();

-- Trigger voor UPDATE (alleen als key, value of category wijzigt)
DROP TRIGGER IF EXISTS generate_embedding_on_update ON public.ai_knowledge_base;
CREATE TRIGGER generate_embedding_on_update
  AFTER UPDATE OF category, key, value ON public.ai_knowledge_base
  FOR EACH ROW
  WHEN (
    OLD.category IS DISTINCT FROM NEW.category OR
    OLD.key IS DISTINCT FROM NEW.key OR
    OLD.value IS DISTINCT FROM NEW.value
  )
  EXECUTE FUNCTION public.queue_embedding_generation();

-- Voeg index toe voor snellere embedding lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_knowledge_id 
  ON public.knowledge_embeddings(knowledge_id);

-- Voeg HNSW index toe voor vector similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_vector 
  ON public.knowledge_embeddings 
  USING hnsw (embedding vector_cosine_ops);