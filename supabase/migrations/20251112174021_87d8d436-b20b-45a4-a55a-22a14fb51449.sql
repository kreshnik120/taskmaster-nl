-- Drop trigger (if exists)
DROP TRIGGER IF EXISTS enforce_upload_quota ON storage.objects;

-- Drop function (if exists)
DROP FUNCTION IF EXISTS public.check_upload_quota();

-- Drop RLS policies
DROP POLICY IF EXISTS "Users view own quota" ON public.user_upload_quotas;
DROP POLICY IF EXISTS "Service role manages quotas" ON public.user_upload_quotas;

-- Drop table
DROP TABLE IF EXISTS public.user_upload_quotas CASCADE;