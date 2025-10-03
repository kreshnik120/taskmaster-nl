-- Add processing_method column to track how documents were processed
ALTER TABLE training_documents 
ADD COLUMN IF NOT EXISTS processing_method TEXT 
CHECK (processing_method IN ('text', 'vision', 'failed'));