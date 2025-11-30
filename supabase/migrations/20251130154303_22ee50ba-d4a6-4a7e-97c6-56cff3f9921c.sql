-- FASE 2: Data Cleanup - Fix 3 sollicitaties zonder org_id
-- jimmy → ABCzorg
UPDATE professional_applications 
SET org_id = '550e8400-e29b-41d4-a716-446655440000'
WHERE id = '6f8910ac-0026-4738-8eca-498b218b7d39';

-- edon → CitoZorg
UPDATE professional_applications
SET org_id = (SELECT id FROM organizations WHERE name = 'CitoZorg')
WHERE id = 'ece31349-3edd-4a24-a4a8-eb6aae8496c1';

-- mejrem → ABCzorg (default)
UPDATE professional_applications
SET org_id = '550e8400-e29b-41d4-a716-446655440000'
WHERE id = '00aa5ebd-2c83-4f5e-a301-3ad9c06fb28a';