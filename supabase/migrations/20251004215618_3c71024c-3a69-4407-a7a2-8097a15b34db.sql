-- Cleanup oude test data
DELETE FROM professional_clients 
WHERE notes LIKE '%Toegewezen via AI systeem%'
AND client_id = '40d8bfa2-1bad-4eae-a71c-0b7cf6548dd9';

-- Verwijder foute knowledge entries
DELETE FROM ai_knowledge_base 
WHERE key IN ('client_swz_professionals', 'how_to_search_professionals_by_client');