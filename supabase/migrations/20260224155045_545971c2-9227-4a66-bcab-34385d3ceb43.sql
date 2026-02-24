ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS documents_published_count INTEGER DEFAULT 0;