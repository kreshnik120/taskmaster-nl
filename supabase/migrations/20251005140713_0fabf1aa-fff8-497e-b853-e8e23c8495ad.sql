-- Delete test professionals and their related data
-- First delete related records due to foreign key constraints

DELETE FROM professional_availability 
WHERE professional_id IN (
  SELECT id FROM professionals 
  WHERE full_name IN ('Ali Budak', 'Jan de Vries')
);

DELETE FROM professional_clients 
WHERE professional_id IN (
  SELECT id FROM professionals 
  WHERE full_name IN ('Ali Budak', 'Jan de Vries')
);

-- Now delete the test professionals
DELETE FROM professionals 
WHERE full_name IN ('Ali Budak', 'Jan de Vries');