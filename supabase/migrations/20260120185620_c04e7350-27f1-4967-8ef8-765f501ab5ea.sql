-- Fix: ai_knowledge_base ON CONFLICT mismatch
-- Code verwacht: (org_id, category, key) - 3 kolommen
-- Database had: (user_id, org_id, category, key) - 4 kolommen

-- Stap 1: Drop de oude 4-kolommen constraint
ALTER TABLE ai_knowledge_base 
DROP CONSTRAINT IF EXISTS ai_knowledge_base_user_id_org_id_category_key_key;

-- Stap 2: Voeg nieuwe 3-kolommen constraint toe
ALTER TABLE ai_knowledge_base 
ADD CONSTRAINT ai_knowledge_base_org_category_key_unique 
UNIQUE (org_id, category, key);