-- FASE 1: Verwijder 100% ongebruikte objecten

-- Drop broken trigger op storage.objects
DROP TRIGGER IF EXISTS after_document_upload_auto_process ON storage.objects;

-- Drop function die niet-bestaande edge function aanroept
DROP FUNCTION IF EXISTS public.trigger_document_processing();

-- Drop unused view
DROP VIEW IF EXISTS public.ai_learning_events_summary CASCADE;

-- Drop unused preflight_checks table + policies
DROP POLICY IF EXISTS "Users can view preflight checks in their org" ON public.preflight_checks;
DROP TABLE IF EXISTS public.preflight_checks CASCADE;

-- FASE 2: Verwijder entity_relationships (graceful degradation in code)

-- Drop function first (depends on table)
DROP FUNCTION IF EXISTS public.get_entity_relationships(text, uuid, integer);

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view entity relationships in their org" ON public.entity_relationships;
DROP POLICY IF EXISTS "Users can insert entity relationships in their org" ON public.entity_relationships;
DROP POLICY IF EXISTS "Users can update entity relationships in their org" ON public.entity_relationships;

-- Drop table
DROP TABLE IF EXISTS public.entity_relationships CASCADE;