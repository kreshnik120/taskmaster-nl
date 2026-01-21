-- Voeg file_size kolom toe aan attachments tabel voor bestandsgrootte opslag
ALTER TABLE attachments 
ADD COLUMN IF NOT EXISTS file_size BIGINT;

COMMENT ON COLUMN attachments.file_size IS 'Bestandsgrootte in bytes';