-- Fix security: Restrict INSERT to service_role only
-- Previous policy allowed any authenticated user to insert

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can insert notifications" ON recruiter_notifications;

-- Create restrictive policy that only allows service_role (edge functions)
CREATE POLICY "Only service role can insert notifications"
ON recruiter_notifications FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
);