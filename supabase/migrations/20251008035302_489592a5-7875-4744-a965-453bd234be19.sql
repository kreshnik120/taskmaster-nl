-- Fix security issues from Week 1-2 migration
-- Add missing SET search_path to is_knowledge_valid function

CREATE OR REPLACE FUNCTION public.is_knowledge_valid(
  _valid_from DATE,
  _valid_to DATE
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _valid_from <= CURRENT_DATE 
    AND (_valid_to IS NULL OR _valid_to >= CURRENT_DATE)
  )
$$;