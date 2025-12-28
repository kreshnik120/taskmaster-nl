-- ============================================
-- FASE 1.1: Pruning ai_knowledge_versions
-- Doel: Reduceer 489K rows naar ~40K (90% reductie)
-- ============================================

-- STAP 1: Verwijder oude versies (bewaar laatste 10 per knowledge_id)
DELETE FROM public.ai_knowledge_versions
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY knowledge_id 
        ORDER BY version_number DESC
      ) as rn
    FROM public.ai_knowledge_versions
  ) ranked
  WHERE rn > 10
);

-- STAP 2: Maak een functie voor automatische pruning
CREATE OR REPLACE FUNCTION public.prune_old_knowledge_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verwijder versies ouder dan de laatste 10 voor dit knowledge_id
  DELETE FROM public.ai_knowledge_versions
  WHERE knowledge_id = NEW.knowledge_id
    AND id NOT IN (
      SELECT id FROM (
        SELECT id
        FROM public.ai_knowledge_versions
        WHERE knowledge_id = NEW.knowledge_id
        ORDER BY version_number DESC
        LIMIT 10
      ) recent_versions
    );
  
  RETURN NEW;
END;
$$;

-- STAP 3: Maak trigger die na elke INSERT automatisch pruned
DROP TRIGGER IF EXISTS trigger_prune_knowledge_versions ON public.ai_knowledge_versions;

CREATE TRIGGER trigger_prune_knowledge_versions
AFTER INSERT ON public.ai_knowledge_versions
FOR EACH ROW
EXECUTE FUNCTION public.prune_old_knowledge_versions();

-- STAP 4: Voeg een index toe voor betere performance bij pruning
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_knowledge_id_version 
ON public.ai_knowledge_versions (knowledge_id, version_number DESC);