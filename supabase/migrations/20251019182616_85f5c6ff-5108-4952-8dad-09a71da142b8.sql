-- CLEANUP: Verwijder laatste orphaned embedding
DELETE FROM knowledge_embeddings
WHERE knowledge_id = '68cd35df-0ea3-4fd1-b658-90140762af7d';

-- PREVENTIE: Auto-cleanup trigger voor embeddings bij soft-delete
CREATE OR REPLACE FUNCTION cleanup_embeddings_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Als knowledge item soft-deleted wordt, verwijder embedding
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    DELETE FROM knowledge_embeddings WHERE knowledge_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger
DROP TRIGGER IF EXISTS trigger_cleanup_embeddings ON ai_knowledge_base;
CREATE TRIGGER trigger_cleanup_embeddings
  AFTER UPDATE ON ai_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_embeddings_on_delete();