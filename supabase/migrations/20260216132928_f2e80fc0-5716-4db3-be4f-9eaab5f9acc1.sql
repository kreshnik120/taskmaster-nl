-- BENDY-SYNC-2B: Cleanup voor sync engine herschrijving

-- 1. Verwijder oude mapping records (entity_type 'client' is vervangen door 'sublocation')
DELETE FROM public.bendy_id_mapping
WHERE tenant = 'citozorg' AND entity_type = 'client';

-- 2. Reset bendy_id op client_organizations (werd overschreven door meerdere sublocatie-records)
UPDATE public.client_organizations
SET bendy_id = NULL
WHERE org_id = '650e8400-e29b-41d4-a716-446655440001'
  AND bendy_id IS NOT NULL;