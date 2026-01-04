-- Extend professionals_status_check to include pending_documents status
-- This enables the AI Agent document collection workflow

ALTER TABLE professionals DROP CONSTRAINT IF EXISTS professionals_status_check;

ALTER TABLE professionals ADD CONSTRAINT professionals_status_check 
  CHECK (status = ANY (ARRAY[
    'actief'::text, 
    'inactief'::text, 
    'pauze'::text, 
    'beschikbaar'::text,
    'beschikbaar_pending_documents'::text
  ]));

COMMENT ON CONSTRAINT professionals_status_check ON professionals IS 
'Status values: actief (on assignment), inactief (not accepting work), pauze (temporary break), 
beschikbaar (fully available), beschikbaar_pending_documents (available but missing VOG/diplomas - 
cannot be matched until documents collected).';