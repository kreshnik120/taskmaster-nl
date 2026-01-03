-- ===================================================================
-- SECURITY FIX: Convert Security Definer Views to Security Invoker
-- ===================================================================

-- Fix 1: application_evidence_summary - convert to SECURITY INVOKER
ALTER VIEW public.application_evidence_summary SET (security_invoker = true);

-- Fix 2: pending_reviews_with_details - convert to SECURITY INVOKER
ALTER VIEW public.pending_reviews_with_details SET (security_invoker = true);