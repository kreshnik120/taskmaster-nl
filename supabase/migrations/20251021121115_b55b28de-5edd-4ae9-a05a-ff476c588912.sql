-- Update knowledge_embeddings vector dimension to 1536 for OpenAI text-embedding-3-small
-- This fixes the silent insert failure caused by dimension mismatch

-- Step 1: Remove all existing 768-dim embeddings (they will be regenerated with correct dimensions)
DELETE FROM knowledge_embeddings WHERE vector_dims(embedding) = 768;

-- Step 2: Drop old index to prevent lock issues
DROP INDEX IF EXISTS knowledge_embeddings_embedding_idx;

-- Step 3: Update vector column type to 1536 dimensions
ALTER TABLE knowledge_embeddings 
  ALTER COLUMN embedding TYPE vector(1536);

-- Step 4: Recreate optimized index for cosine similarity search
CREATE INDEX knowledge_embeddings_embedding_idx 
  ON knowledge_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 5: Add helpful comment for future reference
COMMENT ON COLUMN knowledge_embeddings.embedding IS 'OpenAI text-embedding-3-small generates 1536-dimensional vectors (updated 2025-10-21)';