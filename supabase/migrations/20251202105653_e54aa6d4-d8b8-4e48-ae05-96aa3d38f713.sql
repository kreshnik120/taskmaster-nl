
-- Fix RLS policy for professional_clients to allow INSERT operations
-- Current policy has no WITH CHECK clause, blocking all inserts

-- Drop existing policy
DROP POLICY IF EXISTS "Admins and managers can manage professional-client relationship" ON professional_clients;

-- Recreate with proper WITH CHECK clause for INSERT/UPDATE
CREATE POLICY "Admins and managers can manage professional-client relationship"
ON professional_clients
FOR ALL
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1
    FROM professionals p
    JOIN user_organizations uo ON uo.org_id = p.org_id
    WHERE p.id = professional_clients.professional_id
    AND uo.user_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1
    FROM professionals p
    JOIN user_organizations uo ON uo.org_id = p.org_id
    WHERE p.id = professional_clients.professional_id
    AND uo.user_id = auth.uid()
  )
);
