-- Fix the infinite recursion in user_organizations RLS policy
-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can view their org memberships" ON public.user_organizations;

-- Create a security definer function to check org membership
CREATE OR REPLACE FUNCTION public.user_is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = _user_id
      AND org_id = _org_id
  )
$$;

-- Create new policy using the security definer function
CREATE POLICY "Users can view their org memberships" 
ON public.user_organizations 
FOR SELECT 
USING (
  user_id = auth.uid() 
  OR public.user_is_org_member(auth.uid(), org_id)
);