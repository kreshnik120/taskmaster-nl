-- Fix existing AI-created tasks without reporter_id
-- Set reporter_id to the first user in the organization for tasks that don't have one

UPDATE public.tasks
SET reporter_id = (
  SELECT uo.user_id
  FROM public.user_organizations uo
  WHERE uo.org_id = tasks.org_id
  LIMIT 1
)
WHERE reporter_id IS NULL
  AND deleted_at IS NULL;