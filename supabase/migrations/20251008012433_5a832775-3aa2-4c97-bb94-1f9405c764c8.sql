-- Add last_validation_error column to training_documents if it doesn't exist
ALTER TABLE training_documents 
ADD COLUMN IF NOT EXISTS last_validation_error TEXT;