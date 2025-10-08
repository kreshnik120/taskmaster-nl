-- Delete stuck documents completely so they can be re-uploaded
-- This allows fresh processing with the new error tracking system
DELETE FROM training_documents
WHERE status IN ('processing', 'failed')
  AND processing_progress = 0
  AND (error_message IS NULL OR error_message = '');