-- ====================================================
-- FASE 2 & 3: Fix vigi's data + Cleanup duplicate organizations (v2)
-- ====================================================

-- Fix vigi's extracted_data.assigned_organization to match org_id
UPDATE professional_applications
SET extracted_data = jsonb_set(
  extracted_data, 
  '{assigned_organization}', 
  '"ABCzorg"'
)
WHERE id = '0746138c-a855-460d-8efb-fcc1c2ee99dc'
  AND org_id = '550e8400-e29b-41d4-a716-446655440000';

-- First migrate all foreign key references to the correct org IDs
UPDATE system_health_log
SET org_id = '550e8400-e29b-41d4-a716-446655440000'
WHERE org_id = '4e49024d-7068-4f73-b4fc-5fb5d3e58189';

UPDATE system_health_log
SET org_id = '650e8400-e29b-41d4-a716-446655440001'
WHERE org_id = '96e7779d-5931-46ec-a93e-99af8eb61ec0';

-- Now we can safely delete the duplicate organizations
DELETE FROM organizations 
WHERE id IN (
  '4e49024d-7068-4f73-b4fc-5fb5d3e58189', -- Duplicate ABCzorg
  '96e7779d-5931-46ec-a93e-99af8eb61ec0'  -- Duplicate CitoZorg
);