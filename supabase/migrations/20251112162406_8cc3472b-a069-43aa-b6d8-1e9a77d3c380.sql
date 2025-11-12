-- ===================================================================
-- WEEK 1 SECURITY HARDENING - RE-EXECUTION WITH VERIFICATION
-- ===================================================================

-- ===================================================================
-- STAP 1: SHARE LINKS SECURITY FIX
-- ===================================================================

-- 1.1: Drop oude onveilige policy
DROP POLICY IF EXISTS "Anyone can view share links" ON public.share_links;

-- 1.2: Add missing columns voor edge function
ALTER TABLE public.share_links 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- 1.3: Token-based access policy (voor public share access via edge function)
CREATE POLICY "Access via valid token only"
ON public.share_links 
FOR SELECT 
TO public
USING (
  token = current_setting('app.share_token', true)
  AND (expires_at IS NULL OR expires_at > NOW())
);

-- 1.4: Org-scoped policy (org members kunnen hun eigen links zien)
CREATE POLICY "Org members view their links"
ON public.share_links 
FOR SELECT 
TO authenticated
USING (
  (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tasks t
    JOIN user_organizations uo ON uo.org_id = t.org_id
    WHERE t.id = share_links.task_id AND uo.user_id = auth.uid()
  ))
  OR
  (project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects p
    JOIN user_organizations uo ON uo.org_id = p.org_id
    WHERE p.id = share_links.project_id AND uo.user_id = auth.uid()
  ))
);

-- ===================================================================
-- STAP 2: STORAGE QUOTA SYSTEM
-- ===================================================================

-- 2.1: Create quota table
CREATE TABLE IF NOT EXISTS public.user_upload_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  uploads_today INT DEFAULT 0 NOT NULL,
  daily_limit INT DEFAULT 10 NOT NULL,
  last_reset DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2.2: Enable RLS op quota table
ALTER TABLE public.user_upload_quotas ENABLE ROW LEVEL SECURITY;

-- 2.3: Users kunnen eigen quota zien
CREATE POLICY "Users view own quota"
ON public.user_upload_quotas 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- 2.4: Service role kan quotas beheren
CREATE POLICY "Service role manages quotas"
ON public.user_upload_quotas 
FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- 2.5: Quota check function
CREATE OR REPLACE FUNCTION public.check_upload_quota()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uploads INT;
  v_limit INT;
BEGIN
  -- Reset counter als nieuwe dag
  UPDATE public.user_upload_quotas
  SET uploads_today = 0, last_reset = CURRENT_DATE
  WHERE user_id = auth.uid() AND last_reset < CURRENT_DATE;
  
  -- Haal huidige quota op
  SELECT uploads_today, daily_limit INTO v_uploads, v_limit
  FROM public.user_upload_quotas
  WHERE user_id = auth.uid();
  
  -- Check of limit bereikt
  IF v_uploads >= v_limit THEN
    RAISE EXCEPTION 'Upload limit bereikt: % van % bestanden vandaag', v_uploads, v_limit;
  END IF;
  
  -- Increment counter
  INSERT INTO public.user_upload_quotas (user_id, uploads_today)
  VALUES (auth.uid(), 1)
  ON CONFLICT (user_id) 
  DO UPDATE SET uploads_today = user_upload_quotas.uploads_today + 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.6: Drop oude onveilige storage policies
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload training documents" ON storage.objects;

-- 2.7: Nieuwe veilige training-documents policy (10MB limit + user-scoped)
CREATE POLICY "Users upload training docs with limits"
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'training-documents'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND COALESCE(
    (metadata->>'size')::bigint,
    octet_length(COALESCE(metadata::text, '{}'))
  ) < 10485760
);

-- 2.8: Apply quota trigger
DROP TRIGGER IF EXISTS enforce_upload_quota ON storage.objects;
CREATE TRIGGER enforce_upload_quota
BEFORE INSERT ON storage.objects
FOR EACH ROW
WHEN (NEW.bucket_id = 'training-documents')
EXECUTE FUNCTION public.check_upload_quota();

-- ===================================================================
-- STAP 3: BACKUP TABLE RLS
-- ===================================================================

-- 3.1: Enable RLS op backup table
ALTER TABLE public.ai_learning_events_backup_pre_nullable 
ENABLE ROW LEVEL SECURITY;

-- 3.2: Admin-only access policy
CREATE POLICY "Only admins view backup"
ON public.ai_learning_events_backup_pre_nullable
FOR SELECT 
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3.3: Service role heeft full access
CREATE POLICY "Service role manages backup"
ON public.ai_learning_events_backup_pre_nullable
FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- ===================================================================
-- VERIFICATIE QUERIES (outputs worden gelogd)
-- ===================================================================

-- Verify share_links policies
DO $$
DECLARE
  policy_count INT;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE tablename = 'share_links' 
  AND schemaname = 'public';
  
  RAISE NOTICE '✅ Share links policies: % actief', policy_count;
END $$;

-- Verify quota table
DO $$
DECLARE
  table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'user_upload_quotas' 
    AND schemaname = 'public'
  ) INTO table_exists;
  
  RAISE NOTICE '✅ Quota table bestaat: %', table_exists;
END $$;

-- Verify backup RLS
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT rowsecurity INTO rls_enabled
  FROM pg_tables 
  WHERE tablename = 'ai_learning_events_backup_pre_nullable'
  AND schemaname = 'public';
  
  RAISE NOTICE '✅ Backup table RLS enabled: %', rls_enabled;
END $$;

-- ===================================================================
-- COMPLETED: WEEK 1 SECURITY HARDENING
-- ===================================================================