-- Data Cleanup: Reset document metadata voor herverwerking (zonder status change)

-- Stap 1: Reset vastgelopen documenten (behoud status="processing")
UPDATE training_documents 
SET processing_method = NULL,
    processing_progress = 0,
    processed_at = NULL,
    extracted_knowledge_count = 0
WHERE status = 'processing' 
  AND processed_at IS NULL;

-- Stap 2: Reset documenten met slechte knowledge items
WITH bad_docs AS (
  SELECT DISTINCT value->>'source_file' as file_name
  FROM ai_knowledge_base
  WHERE value->>'content' ILIKE '%onleesbaar%' 
     OR value->>'content' ILIKE '%kan de inhoud%niet%'
     OR value->>'content' ILIKE '%ruwe%gecodeerde%'
     OR value->>'content' ILIKE '%binair formaat%'
     OR value->>'content' ILIKE '%versleuteld%'
     OR value->>'content' ILIKE '%gecodeerd als binaire%'
     OR value->>'content' ILIKE '%onsamenhangende tekens%'
)
UPDATE training_documents
SET processing_method = NULL,
    processed_at = NULL,
    extracted_knowledge_count = 0,
    processing_progress = 0
WHERE file_name IN (SELECT file_name FROM bad_docs);

-- Stap 3: Verwijder slechte knowledge items uit kennisbank
DELETE FROM ai_knowledge_base
WHERE value->>'content' ILIKE '%onleesbaar%' 
   OR value->>'content' ILIKE '%kan de inhoud%niet%'
   OR value->>'content' ILIKE '%ruwe%gecodeerde%'
   OR value->>'content' ILIKE '%binair formaat%'
   OR value->>'content' ILIKE '%versleuteld%'
   OR value->>'content' ILIKE '%gecodeerd als binaire%'
   OR value->>'content' ILIKE '%onsamenhangende tekens%';