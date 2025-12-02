-- Fix bestaande applications zonder org_id
-- Zet alle NULL org_id naar ABCzorg (default bemiddelingsbureau)
UPDATE professional_applications 
SET org_id = '550e8400-e29b-41d4-a716-446655440000'
WHERE org_id IS NULL;