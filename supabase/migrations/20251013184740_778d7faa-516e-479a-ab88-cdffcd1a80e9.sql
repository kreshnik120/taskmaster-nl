-- Add source tracking columns to ai_knowledge_base
ALTER TABLE ai_knowledge_base
ADD COLUMN source_url TEXT,
ADD COLUMN source_title TEXT,
ADD COLUMN retrieved_at TIMESTAMPTZ;

-- Add index for source URL lookups
CREATE INDEX idx_knowledge_source_url 
ON ai_knowledge_base(source_url) 
WHERE source_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN ai_knowledge_base.source_url IS 'Web URL where this knowledge was validated/retrieved from';
COMMENT ON COLUMN ai_knowledge_base.source_title IS 'Title of the source webpage';
COMMENT ON COLUMN ai_knowledge_base.retrieved_at IS 'Timestamp when the source was last retrieved/validated';