-- Drop bestaande RLS policies op professional_applications
DROP POLICY IF EXISTS "Admins and managers can manage applications" ON professional_applications;
DROP POLICY IF EXISTS "HR can view applications" ON professional_applications;

-- Nieuwe INSERT policy: admins/managers kunnen sollicitaties aanmaken zonder org_id
CREATE POLICY "Admins and managers can insert applications"
ON professional_applications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Nieuwe SELECT policy: admins/managers kunnen sollicitaties zien (ook zonder org_id)
CREATE POLICY "Admins and managers can view applications"
ON professional_applications
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND (
    org_id IS NULL  -- Nog niet toegewezen aan organisatie
    OR EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = professional_applications.org_id
      AND user_organizations.user_id = auth.uid()
    )
  )
);

-- Nieuwe UPDATE policy: admins/managers kunnen sollicitaties bewerken
CREATE POLICY "Admins and managers can update applications"
ON professional_applications
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND (
    org_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = professional_applications.org_id
      AND user_organizations.user_id = auth.uid()
    )
  )
);

-- Nieuwe DELETE policy: admins/managers kunnen sollicitaties verwijderen
CREATE POLICY "Admins and managers can delete applications"
ON professional_applications
FOR DELETE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND (
    org_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = professional_applications.org_id
      AND user_organizations.user_id = auth.uid()
    )
  )
);