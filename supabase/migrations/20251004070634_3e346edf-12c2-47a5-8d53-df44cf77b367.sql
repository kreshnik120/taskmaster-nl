-- ============================================
-- STEP 1: Create Role Infrastructure
-- ============================================

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Create Security Definer Function
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================
-- STEP 3: RLS Policies on user_roles
-- ============================================

-- Users can view their own roles
CREATE POLICY "Users can view their own roles" 
ON public.user_roles
FOR SELECT 
USING (user_id = auth.uid());

-- Admins can manage all roles
CREATE POLICY "Admins can manage all roles" 
ON public.user_roles
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- STEP 4: Assign Initial Roles
-- ============================================

-- Assign admin role to first user in ABCzorg org (Kreshnik)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::public.app_role
FROM user_organizations
WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
LIMIT 1;

-- ============================================
-- STEP 5: Apply Role Restrictions to Tables
-- ============================================

-- Professionals: Only admins can delete
CREATE POLICY "Only admins can delete professionals" 
ON public.professionals
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Business Intelligence: Only admins can insert/update/delete
CREATE POLICY "Only admins can insert business intelligence" 
ON public.business_intelligence
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update business intelligence" 
ON public.business_intelligence
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete business intelligence" 
ON public.business_intelligence
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Prioritizer State: Only admins can update/delete
CREATE POLICY "Only admins can update prioritizer state" 
ON public.prioritizer_state
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete prioritizer state" 
ON public.prioritizer_state
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));