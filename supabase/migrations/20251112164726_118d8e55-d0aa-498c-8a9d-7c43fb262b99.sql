-- Add missing created_by column to share_links
ALTER TABLE public.share_links 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON public.share_links(created_by);

-- Backfill created_by for existing records
UPDATE public.share_links 
SET created_by = (
  SELECT user_id FROM user_organizations 
  WHERE org_id = (
    SELECT org_id FROM tasks WHERE id = share_links.task_id
  )
  LIMIT 1
)
WHERE created_by IS NULL AND task_id IS NOT NULL;