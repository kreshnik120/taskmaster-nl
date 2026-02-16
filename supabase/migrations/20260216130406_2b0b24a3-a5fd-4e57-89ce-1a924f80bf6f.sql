
-- BENDY-FIX-1: org_id fix + bendy_id op sublocations + entity_type update

-- 1. Fix bendy_sync_config org_id: was ABCzorg, moet CitoZorg
UPDATE public.bendy_sync_config
SET org_id = '650e8400-e29b-41d4-a716-446655440001'
WHERE tenant = 'citozorg';

-- 2. Voeg bendy_id kolom toe aan client_sublocations
ALTER TABLE public.client_sublocations ADD COLUMN IF NOT EXISTS bendy_id TEXT;

-- 3. Index voor bendy_id lookups
CREATE INDEX IF NOT EXISTS idx_client_sublocations_bendy_id
ON public.client_sublocations(bendy_id) WHERE bendy_id IS NOT NULL;

-- 4. Update entity_type CHECK constraint op bendy_id_mapping
ALTER TABLE public.bendy_id_mapping
DROP CONSTRAINT IF EXISTS bendy_id_mapping_entity_type_check;

ALTER TABLE public.bendy_id_mapping
ADD CONSTRAINT bendy_id_mapping_entity_type_check
CHECK (entity_type IN ('client', 'professional', 'dienst', 'group', 'document_type', 'selection_list', 'organization', 'sublocation'));

-- 5. Verwijder incorrecte mapping records
DELETE FROM public.bendy_id_mapping WHERE tenant = 'citozorg';

-- 6. Verwijder oude cache
DELETE FROM public.bendy_raw_cache WHERE tenant = 'citozorg';
