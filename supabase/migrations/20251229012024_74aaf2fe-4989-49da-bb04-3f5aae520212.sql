-- ===================================================================
-- Fix RLS Policies met WITH CHECK clauses + DROP clients VIEW
-- ===================================================================

-- Fase 1: Fix client_organizations RLS policy
DROP POLICY IF EXISTS "Admins and managers can manage client organizations" ON client_organizations;
CREATE POLICY "Admins and managers can manage client organizations" ON client_organizations
FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = client_organizations.org_id
    AND user_organizations.user_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = client_organizations.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Fase 2: Fix client_locations RLS policy
DROP POLICY IF EXISTS "Admins and managers can manage client locations" ON client_locations;
CREATE POLICY "Admins and managers can manage client locations" ON client_locations
FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM client_organizations co
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE co.id = client_locations.client_org_id
    AND uo.user_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM client_organizations co
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE co.id = client_locations.client_org_id
    AND uo.user_id = auth.uid()
  )
);

-- Fase 3: Fix client_sublocations RLS policy
DROP POLICY IF EXISTS "Admins and managers can manage client sublocations" ON client_sublocations;
CREATE POLICY "Admins and managers can manage client sublocations" ON client_sublocations
FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM client_locations cl
    JOIN client_organizations co ON co.id = cl.client_org_id
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE cl.id = client_sublocations.location_id
    AND uo.user_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM client_locations cl
    JOIN client_organizations co ON co.id = cl.client_org_id
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE cl.id = client_sublocations.location_id
    AND uo.user_id = auth.uid()
  )
);

-- Fase 4: DROP de deprecated clients VIEW (niet meer in gebruik)
DROP VIEW IF EXISTS public.clients;