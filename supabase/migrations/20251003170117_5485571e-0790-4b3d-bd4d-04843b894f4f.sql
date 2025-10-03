-- Add columns for folder structure metadata
ALTER TABLE training_documents 
ADD COLUMN IF NOT EXISTS relative_path TEXT,
ADD COLUMN IF NOT EXISTS original_folder TEXT;

COMMENT ON COLUMN training_documents.relative_path IS 'Relative path within the uploaded folder (e.g., subfolder/document.pdf)';
COMMENT ON COLUMN training_documents.original_folder IS 'Name of the root folder that was uploaded';