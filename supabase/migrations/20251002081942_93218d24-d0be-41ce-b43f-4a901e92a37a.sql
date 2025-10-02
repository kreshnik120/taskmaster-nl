-- Fix security issue: Restrict profile visibility to own profile and org members
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create new restricted policy: users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Create policy: users can view profiles of members in their organizations
CREATE POLICY "Users can view org members profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_organizations uo1
    INNER JOIN public.user_organizations uo2 ON uo1.org_id = uo2.org_id
    WHERE uo1.user_id = auth.uid()
      AND uo2.user_id = profiles.id
  )
);