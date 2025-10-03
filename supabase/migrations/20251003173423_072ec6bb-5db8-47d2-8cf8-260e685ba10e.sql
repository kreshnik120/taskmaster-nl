-- Update storage bucket to allow Excel MIME types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
  'application/vnd.ms-excel',  -- .xls
  'text/plain',
  'text/markdown'
]
WHERE id = 'training-documents';

-- Update processing_method constraint to allow 'excel'
ALTER TABLE training_documents 
DROP CONSTRAINT IF EXISTS training_documents_processing_method_check;

ALTER TABLE training_documents 
ADD CONSTRAINT training_documents_processing_method_check 
CHECK (processing_method IN ('text', 'vision', 'excel', 'failed'));