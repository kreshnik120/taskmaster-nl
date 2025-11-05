-- Stap 1: Cache invalidatie functie
CREATE OR REPLACE FUNCTION invalidate_knowledge_cache()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Detecteer het type wijziging
  IF TG_OP = 'UPDATE' THEN
    -- Bij update: invalideer alleen als belangrijke velden zijn gewijzigd
    IF (
      OLD.value IS DISTINCT FROM NEW.value OR
      OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
      OLD.validation_status IS DISTINCT FROM NEW.validation_status
    ) THEN
      -- Update expires_at naar NOW() voor alle cache entries die dit knowledge item gebruiken
      UPDATE ai_response_cache
      SET expires_at = NOW()
      WHERE knowledge_ids @> ARRAY[NEW.id]::uuid[]
        AND expires_at > NOW();
    END IF;
  
  ELSIF TG_OP = 'DELETE' THEN
    -- Bij delete: invalideer alle gerelateerde cache entries
    UPDATE ai_response_cache
    SET expires_at = NOW()
    WHERE knowledge_ids @> ARRAY[OLD.id]::uuid[]
      AND expires_at > NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Stap 2: Trigger registratie
CREATE TRIGGER trigger_invalidate_cache
AFTER UPDATE OR DELETE ON ai_knowledge_base
FOR EACH ROW
EXECUTE FUNCTION invalidate_knowledge_cache();

-- Stap 3: GIN index voor performance
CREATE INDEX IF NOT EXISTS idx_response_cache_knowledge_ids 
ON ai_response_cache 
USING GIN (knowledge_ids);