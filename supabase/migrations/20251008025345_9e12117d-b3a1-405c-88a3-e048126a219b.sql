-- Add missing columns to training_documents table for better error tracking
ALTER TABLE training_documents 
ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE training_documents 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_training_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger that fires before updates
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON training_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_training_documents_updated_at();