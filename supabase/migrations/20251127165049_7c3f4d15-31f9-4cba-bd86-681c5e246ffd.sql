-- Maak system_events.org_id nullable
ALTER TABLE system_events 
ALTER COLUMN org_id DROP NOT NULL;

-- Drop oude RLS policy
DROP POLICY IF EXISTS "Users can view events in their org" ON system_events;

-- Nieuwe policy: admins/managers kunnen events zonder org_id zien
CREATE POLICY "Users can view events in their org or unassigned"
ON system_events
FOR SELECT
TO authenticated
USING (
  org_id IS NULL  -- Unassigned events zichtbaar voor authenticated users
  OR EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = system_events.org_id
    AND user_organizations.user_id = auth.uid()
  )
);