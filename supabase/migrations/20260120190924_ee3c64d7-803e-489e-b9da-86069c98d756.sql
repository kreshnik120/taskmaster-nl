-- Stap 1: Voeg vog_file_path kolom toe (indien niet bestaat)
ALTER TABLE professional_applications 
ADD COLUMN IF NOT EXISTS vog_file_path TEXT;

COMMENT ON COLUMN professional_applications.vog_file_path IS 
'Storage path to VOG document - synced from application_documents for UI visibility';

-- Stap 2: Fix bestaande data - sync VOG paths van application_documents naar professional_applications
UPDATE professional_applications p
SET vog_file_path = d.file_path
FROM application_documents d
WHERE d.application_id = p.id
  AND d.document_type = 'vog'
  AND p.vog_file_path IS NULL;