-- Add client_id column to ai_knowledge_base for client-specific knowledge tracking
ALTER TABLE ai_knowledge_base 
ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_ai_knowledge_base_client_id ON ai_knowledge_base(client_id);

-- Tag existing items with client context based on keywords
UPDATE ai_knowledge_base
SET client_id = (
  SELECT id FROM clients WHERE 
    LOWER(name) = CASE 
      WHEN key ILIKE '%lunet%' OR value::text ILIKE '%lunet%' THEN 'lunet'
      WHEN key ILIKE '%prisma%' OR value::text ILIKE '%prisma%' THEN 'prisma'
      WHEN key ILIKE '%swz%' OR value::text ILIKE '%stichting swz%' THEN 'swz'
      WHEN key ILIKE '%citozorg%' OR value::text ILIKE '%citozorg%' THEN 'citozorg'
      WHEN key ILIKE '%abczorg%' OR value::text ILIKE '%abczorg%' THEN 'abczorg'
      WHEN key ILIKE '%evb%' OR value::text ILIKE '%evb%' THEN 'evb'
    END
  LIMIT 1
)
WHERE (
  key ILIKE '%lunet%' OR 
  key ILIKE '%prisma%' OR 
  key ILIKE '%swz%' OR
  key ILIKE '%citozorg%' OR 
  key ILIKE '%abczorg%' OR
  key ILIKE '%evb%' OR
  value::text ILIKE '%lunet%' OR
  value::text ILIKE '%prisma%' OR
  value::text ILIKE '%swz%' OR
  value::text ILIKE '%citozorg%' OR
  value::text ILIKE '%abczorg%' OR
  value::text ILIKE '%evb%'
)
AND client_id IS NULL;