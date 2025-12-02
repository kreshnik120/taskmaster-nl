-- Fase 13: Test Data Cleanup & AI Learning Protection (Final)

-- 1. Add is_test_data column to relevant tables
ALTER TABLE public.professional_applications 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE public.system_events 
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

-- 2. Tag all current applications as test data
UPDATE public.professional_applications
SET is_test_data = true
WHERE deleted_at IS NULL;

-- 3. Tag all current professionals as test data
UPDATE public.professionals
SET is_test_data = true
WHERE deleted_at IS NULL;

-- 4. Tag all assignments as test data
UPDATE public.assignments
SET is_test_data = true;

-- 5. Tag system_events from test data
UPDATE public.system_events
SET is_test_data = true
WHERE entity_type IN ('professional_applications', 'professionals', 'assignments', 'professional_client_matches')
   OR event_type IN ('application_created', 'application_stage_changed', 'application_status_changed', 
                     'professional_created', 'professional_created_from_application',
                     'placement_created', 'placement_status_changed', 'assignment_created');

-- 6. Soft-delete all test applications (no deletion_reason column)
UPDATE public.professional_applications
SET deleted_at = NOW()
WHERE is_test_data = true AND deleted_at IS NULL;

-- 7. Soft-delete all test professionals
UPDATE public.professionals
SET deleted_at = NOW()
WHERE is_test_data = true AND deleted_at IS NULL;

-- 8. Mark all test assignments as cancelled
UPDATE public.assignments
SET status = 'cancelled'
WHERE is_test_data = true;

-- 9. Soft-delete knowledge items that reference test data patterns
UPDATE public.ai_knowledge_base
SET deleted_at = NOW(),
    deleted_by = 'test_data_cleanup',
    deletion_reason = '{"reason": "test_data_cleanup", "description": "Knowledge derived from test recruitment data"}'::jsonb
WHERE deleted_at IS NULL
  AND (
    key ILIKE '%sophie%' OR key ILIKE '%kreshnik%' OR key ILIKE '%jimmy%' 
    OR key ILIKE '%edon%' OR key ILIKE '%reda%' OR key ILIKE '%test%'
    OR value::text ILIKE '%sophie%' OR value::text ILIKE '%kreshnik%'
    OR value::text ILIKE '%jimmy%' OR value::text ILIKE '%edon%'
    OR (category = 'recruitment_pipeline' AND usage_count = 0)
    OR (category = 'success_patterns' AND usage_count = 0)
  );

-- 10. Mark all system_events as test data
UPDATE public.system_events
SET is_test_data = true
WHERE is_test_data = false;

-- 11. Create indices for efficient test data filtering
CREATE INDEX IF NOT EXISTS idx_system_events_is_test_data 
ON public.system_events(is_test_data) WHERE is_test_data = false;

CREATE INDEX IF NOT EXISTS idx_applications_is_test_data 
ON public.professional_applications(is_test_data) WHERE is_test_data = false;

CREATE INDEX IF NOT EXISTS idx_professionals_is_test_data 
ON public.professionals(is_test_data) WHERE is_test_data = false;