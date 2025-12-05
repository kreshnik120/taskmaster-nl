
-- Fase 1: Cleanup & Fix Plan

-- 1. Cancel assignments with deleted professionals (preserve for audit)
UPDATE public.assignments 
SET status = 'cancelled'
WHERE professional_id IN (
  SELECT id FROM public.professionals WHERE deleted_at IS NOT NULL
);

-- 2. Mark test data correctly
UPDATE public.assignments 
SET is_test_data = true
WHERE professional_id IN (
  SELECT id FROM public.professionals WHERE is_test_data = true
);

-- 3. Create missing assignment for Murad Kasac
INSERT INTO public.assignments (
  professional_id,
  sublocation_id,
  status,
  start_date,
  werkvorm,
  weekly_hours,
  is_test_data
)
SELECT 
  '2eb54638-17c9-4b61-8052-10eaa63cfa46'::uuid,
  cs.id,
  'active',
  CURRENT_DATE,
  pa.extracted_data->>'werkvorm',
  32,
  false
FROM professional_applications pa
CROSS JOIN (
  SELECT id FROM client_sublocations WHERE is_active = true LIMIT 1
) cs
WHERE pa.professional_id = '2eb54638-17c9-4b61-8052-10eaa63cfa46'
  AND pa.pipeline_stage = 'geplaatst'
  AND NOT EXISTS (
    SELECT 1 FROM assignments WHERE professional_id = '2eb54638-17c9-4b61-8052-10eaa63cfa46'
  )
LIMIT 1;
