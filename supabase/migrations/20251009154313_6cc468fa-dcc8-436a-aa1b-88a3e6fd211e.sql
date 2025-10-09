-- FASE 1A: Cleanup bestaande duplicaten vóór constraint toevoegen

-- Stap 1: Voeg tijdelijk content_hash toe (zonder constraint)
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS content_hash text 
GENERATED ALWAYS AS (md5(trim(content))) STORED;

-- Stap 2: Verwijder duplicaten (behoud oudste per conversation + role + content_hash)
-- Dit gebruikt een CTE om duplicaten te identificeren en alleen de nieuwste te verwijderen
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id, role, content_hash 
      ORDER BY created_at ASC -- Oudste eerst (laagste rijnummer)
    ) as rn
  FROM chat_messages
  WHERE conversation_id IS NOT NULL
    AND content_hash IS NOT NULL
)
DELETE FROM chat_messages
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1 -- Verwijder alleen rn=2,3,4... (nieuwste)
);

-- Stap 3: Nu kunnen we de unique constraint toevoegen
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_msg_conversation 
ON chat_messages(conversation_id, role, content_hash)
WHERE conversation_id IS NOT NULL;

-- Stap 4: Index voor snelle conversation history queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created 
ON chat_messages(conversation_id, created_at DESC)
WHERE conversation_id IS NOT NULL;