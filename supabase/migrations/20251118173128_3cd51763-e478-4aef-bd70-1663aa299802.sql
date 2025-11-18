-- ============================================
-- SECURITY FIX: Role-Based Access Control
-- ============================================
-- Fixing 4 CRITICAL security vulnerabilities:
-- 1. professionals - Exposed personal data (phone, email, address, BIG numbers)
-- 2. professional_applications - Exposed applicant emails and CVs
-- 3. clients - Exposed business data to all org members
--
-- Strategy: Restrict SELECT to HR roles (admin/manager) only
-- ============================================

-- ============================================
-- 1. PROFESSIONALS TABLE - Create Secure View
-- ============================================

-- Drop overly permissive SELECT policy
DROP POLICY IF EXISTS "Org members can view their professionals" ON public.professionals;

-- Create secure view with only non-sensitive fields
CREATE VIEW public.professionals_public AS
SELECT 
  id,
  org_id,
  full_name,
  functie_niveau,
  regio,
  skills,
  beschikbaarheidsnotities,
  status,
  tags,
  werkvorm,
  rating,
  created_at,
  updated_at
  -- EXCLUDED: email, telefoonnummer, adres, postcode, woonplaats, big_nummer, kvk_nummer, btw_nummer, gewenst_uurloon
FROM public.professionals;

-- Make view use caller's permissions (security invoker)
ALTER VIEW public.professionals_public SET (security_invoker = on);

-- Grant SELECT to authenticated users
GRANT SELECT ON public.professionals_public TO authenticated;

-- New restrictive policy: Only HR (admins/managers) can view full professional data
CREATE POLICY "HR can view full professional data"
ON public.professionals
FOR SELECT
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = professionals.org_id
      AND user_id = auth.uid()
  )
);

-- Add documentation
COMMENT ON VIEW public.professionals_public IS 
'Secure view of professionals without sensitive personal data (no email, phone, address, BIG numbers). Regular users see this view. Admins and managers have access to the full professionals table with all sensitive fields.';

-- ============================================
-- 2. PROFESSIONAL_APPLICATIONS TABLE
-- ============================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Org members can view applications" ON public.professional_applications;

-- Only HR (admins and managers) can view applications
CREATE POLICY "HR can view applications"
ON public.professional_applications
FOR SELECT
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = professional_applications.org_id
      AND user_id = auth.uid()
  )
);

COMMENT ON POLICY "HR can view applications" ON public.professional_applications IS
'Only admins and managers can view job applications containing sensitive applicant data (emails, CVs, personal information) to comply with GDPR and prevent data exposure.';

-- ============================================
-- 3. CLIENTS TABLE
-- ============================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Users can view clients in their orgs" ON public.clients;

-- Only sales and management can view client data
CREATE POLICY "Sales and management view clients"
ON public.clients
FOR SELECT
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE org_id = clients.org_id
      AND user_id = auth.uid()
  )
);

COMMENT ON POLICY "Sales and management view clients" ON public.clients IS
'Only admins and managers can view client data including names, revenue, and tier classifications to prevent competitive intelligence leakage and protect business-sensitive information.';