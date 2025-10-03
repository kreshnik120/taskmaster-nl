-- Add processing progress tracking column
ALTER TABLE training_documents 
ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0;

COMMENT ON COLUMN training_documents.processing_progress IS 'Processing progress percentage (0-100) for large document processing';