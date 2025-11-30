-- ===================================================================
-- FASE 1: KRITIEKE SECURITY FIX (Revised)
-- ===================================================================
-- 
-- Fix 5 tabellen met gevaarlijke 'qual: true' + 'roles: {public}' policies
-- Deze policies geven IEDEREEN (ook niet-ingelogde users) volledige toegang
-- 
-- Datum: 2025-11-30
-- Context: Production Security Audit - Critical Issues
-- ===================================================================

-- 1. FIX: data_conflicts
-- Drop gevaarlijke public policy
DROP POLICY IF EXISTS "System can manage all conflicts" ON public.data_conflicts;

-- Create service_role policy only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'data_conflicts' 
    AND policyname = 'Service role can manage all conflicts'
  ) THEN
    CREATE POLICY "Service role can manage all conflicts"
      ON public.data_conflicts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- 2. FIX: system_events  
-- Drop gevaarlijke public policy
DROP POLICY IF EXISTS "System can manage all events" ON public.system_events;

-- Create service_role policy only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'system_events' 
    AND policyname = 'Service role can manage all events'
  ) THEN
    CREATE POLICY "Service role can manage all events"
      ON public.system_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- 3. FIX: kvk_validation_cache
-- Drop gevaarlijke public policy
DROP POLICY IF EXISTS "System can manage kvk cache" ON public.kvk_validation_cache;

-- Create service_role policy only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'kvk_validation_cache' 
    AND policyname = 'Service role can manage kvk cache'
  ) THEN
    CREATE POLICY "Service role can manage kvk cache"
      ON public.kvk_validation_cache
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- 4. FIX: cache_analytics
-- Drop gevaarlijke public policy
DROP POLICY IF EXISTS "System can manage analytics" ON public.cache_analytics;

-- Create service_role policy only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'cache_analytics' 
    AND policyname = 'Service role can manage analytics'
  ) THEN
    CREATE POLICY "Service role can manage analytics"
      ON public.cache_analytics
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- 5. FIX: category_suggestions
-- Drop gevaarlijke public policy
DROP POLICY IF EXISTS "System can manage category suggestions" ON public.category_suggestions;

-- Create service_role policy only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'category_suggestions' 
    AND policyname = 'Service role can manage category suggestions'
  ) THEN
    CREATE POLICY "Service role can manage category suggestions"
      ON public.category_suggestions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- ===================================================================
-- VERIFICATIE (run na migration):
-- ===================================================================
-- 
-- Check dat geen public policies meer bestaan met qual=true:
-- 
-- SELECT tablename, policyname, roles::text, qual 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- AND qual = 'true' 
-- AND 'public' = ANY(roles);
--
-- Verwacht: 0 rijen (alle gevaarlijke policies verwijderd)
--
-- ===================================================================