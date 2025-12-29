-- Phase 1: Extend application_documents for centralized document management

-- Add new columns for enhanced document tracking
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'basis';
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual_upload';

-- Create index for expiry queries (critical for daily monitoring)
CREATE INDEX IF NOT EXISTS idx_app_docs_expiry ON application_documents(expiry_date) 
WHERE expiry_date IS NOT NULL;

-- Create index for category queries
CREATE INDEX IF NOT EXISTS idx_app_docs_category ON application_documents(application_id, category);

-- Backfill CV documents from professional_applications
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  COALESCE(cv_file_name, 'CV.pdf') as filename,
  cv_file_path as file_path,
  'cv' as document_type,
  'basis' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE cv_file_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'cv'
  );

-- Backfill VOG documents from extracted_data
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'VOG.pdf' as filename,
  (extracted_data->>'vog_file_path')::text as file_path,
  'vog' as document_type,
  'basis' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE extracted_data->>'vog_file_path' IS NOT NULL
  AND (extracted_data->>'vog_file_path')::text != ''
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'vog'
  );

-- Backfill Diploma documents from diploma_file_path column
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'Diploma.pdf' as filename,
  diploma_file_path as file_path,
  'diploma' as document_type,
  'basis' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE diploma_file_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'diploma'
  );

-- Backfill ZZP documents (kvk_uittreksel)
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'KVK_Uittreksel.pdf' as filename,
  kvk_uittreksel_path as file_path,
  'kvk_uittreksel' as document_type,
  'zzp' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE kvk_uittreksel_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'kvk_uittreksel'
  );

-- Backfill ZZP documents (beroepsaansprakelijkheid)
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'Beroepsaansprakelijkheidsverzekering.pdf' as filename,
  beroepsaansprakelijkheid_path as file_path,
  'beroepsaansprakelijkheid' as document_type,
  'zzp' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE beroepsaansprakelijkheid_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'beroepsaansprakelijkheid'
  );

-- Backfill ZZP documents (bhv_certificaat)
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'BHV_Certificaat.pdf' as filename,
  bhv_certificaat_path as file_path,
  'bhv_certificaat' as document_type,
  'zzp' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE bhv_certificaat_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'bhv_certificaat'
  );

-- Backfill ZZP documents (identiteitsbewijs)
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'Identiteitsbewijs.pdf' as filename,
  identiteitsbewijs_path as file_path,
  'identiteitsbewijs' as document_type,
  'zzp' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE identiteitsbewijs_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'identiteitsbewijs'
  );

-- Backfill ZZP documents (klachtenportaal_wkkgz)
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'Klachtenportaal_WKKGZ.pdf' as filename,
  klachtenportaal_wkkgz_path as file_path,
  'klachtenportaal_wkkgz' as document_type,
  'zzp' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE klachtenportaal_wkkgz_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'klachtenportaal_wkkgz'
  );

-- Backfill ZZP documents (tillift_certificaat)
INSERT INTO application_documents (application_id, filename, file_path, document_type, category, source, created_at)
SELECT 
  id as application_id,
  'Tillift_Certificaat.pdf' as filename,
  tillift_certificaat_path as file_path,
  'tillift_certificaat' as document_type,
  'zzp' as category,
  'manual_upload' as source,
  created_at
FROM professional_applications 
WHERE tillift_certificaat_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM application_documents ad 
    WHERE ad.application_id = professional_applications.id 
    AND ad.document_type = 'tillift_certificaat'
  );