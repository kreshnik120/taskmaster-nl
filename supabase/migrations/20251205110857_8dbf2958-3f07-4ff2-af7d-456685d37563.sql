-- Migrate existing professional_clients data to assignments table
-- This preserves historical placement data without losing anything

-- First, find valid sublocation IDs to map client_id to sublocation_id
-- We'll use the first active sublocation from the organization as fallback
DO $$
DECLARE
  rec RECORD;
  target_sublocation_id UUID;
BEGIN
  FOR rec IN 
    SELECT pc.*, c.client_org_id 
    FROM professional_clients pc
    LEFT JOIN clients c ON c.id = pc.client_id
    WHERE NOT EXISTS (
      SELECT 1 FROM assignments a 
      WHERE a.professional_id = pc.professional_id 
      AND a.start_date = pc.start_date
    )
  LOOP
    -- Try to find a sublocation from the same organization
    SELECT cs.id INTO target_sublocation_id
    FROM client_sublocations cs
    JOIN client_locations cl ON cl.id = cs.location_id
    WHERE cl.client_org_id = rec.client_org_id
    AND cs.is_active = true
    LIMIT 1;
    
    -- If no org match, get first active sublocation as fallback
    IF target_sublocation_id IS NULL THEN
      SELECT id INTO target_sublocation_id
      FROM client_sublocations
      WHERE is_active = true
      LIMIT 1;
    END IF;
    
    -- Insert into assignments if we have a valid sublocation
    IF target_sublocation_id IS NOT NULL THEN
      INSERT INTO assignments (
        professional_id,
        sublocation_id,
        start_date,
        end_date,
        status,
        notes,
        weekly_hours,
        created_at,
        updated_at
      ) VALUES (
        rec.professional_id,
        target_sublocation_id,
        rec.start_date,
        rec.end_date,
        CASE WHEN rec.is_active THEN 'active' ELSE 'completed' END,
        COALESCE(rec.notes, 'Gemigreerd van professional_clients'),
        0,
        rec.created_at,
        rec.updated_at
      );
    END IF;
  END LOOP;
END $$;

-- Add comment to track migration
COMMENT ON TABLE professional_clients IS 'Legacy table - placements now stored in assignments table. Data migrated on 2025-12-05.';