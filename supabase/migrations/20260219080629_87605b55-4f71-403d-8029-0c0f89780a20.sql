DROP POLICY IF EXISTS "HR can view full professional data" ON public.professionals;

CREATE POLICY "Org members can view professionals"
ON public.professionals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = professionals.org_id
    AND user_organizations.user_id = auth.uid()
  )
);