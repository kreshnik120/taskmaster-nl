-- FASE 1: CLEANUP ORPHANED EMBEDDINGS (34 items)
-- Verwijder embeddings voor soft-deleted knowledge items
DELETE FROM knowledge_embeddings
WHERE knowledge_id IN (
  SELECT id 
  FROM ai_knowledge_base 
  WHERE deleted_at IS NOT NULL
);

-- FASE 2: MERGE SEMANTIC DUPLICATES - ZZP PROFESSIONALS (177 items)
-- Soft-delete zzp_vereisten items die duplicaat zijn van bedrijfsgegevens:flexpool_*
UPDATE ai_knowledge_base
SET 
  deleted_at = NOW(),
  deleted_by = 'duplicate-cleanup-semantic',
  deletion_reason = jsonb_build_object(
    'reason', 'duplicate_of_flexpool_item',
    'better_version_category', 'bedrijfsgegevens',
    'cleanup_type', 'semantic_duplicate',
    'automated', true
  )
WHERE category = 'zzp_vereisten'
  AND deleted_at IS NULL
  AND value IN (
    SELECT value 
    FROM ai_knowledge_base 
    WHERE category = 'bedrijfsgegevens' 
      AND key LIKE 'flexpool_%'
      AND deleted_at IS NULL
  );

-- FASE 3: MERGE SEMANTIC DUPLICATES - CONTACT INFO (1 item)
-- Soft-delete business_rule:contact, keep bedrijfsgegevens version
UPDATE ai_knowledge_base
SET 
  deleted_at = NOW(),
  deleted_by = 'duplicate-cleanup-semantic',
  deletion_reason = jsonb_build_object(
    'reason', 'duplicate_contact_info',
    'better_version_id', '8b64f275-125d-440c-ad56-0c02c0d611d3',
    'better_version_category', 'bedrijfsgegevens',
    'cleanup_type', 'semantic_duplicate',
    'automated', true
  )
WHERE id = '68cd35df-0ea3-4fd1-b658-90140762af7d'
  AND deleted_at IS NULL;

-- FASE 4: CLEANUP REJECTED DUPLICATE ERROR ITEMS (14 items)
-- Verwijder rejected items die duplicate PDF errors zijn
DELETE FROM ai_knowledge_base
WHERE validation_status = 'rejected'
  AND category = 'documenten'
  AND key LIKE 'document_%'
  AND (
    last_validation_error LIKE '%Mogelijke variant van item%'
    OR last_validation_error LIKE '%Vision processing failed%'
    OR value::text LIKE '%binair gecodeerde%'
  );