-- Create processing_jobs table for background job queue
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'excel', 'docx', 'text'
  
  -- Job management
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  
  -- Chunking
  chunk_index INTEGER,
  total_chunks INTEGER,
  
  -- Results
  result JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Progress
  progress_pct INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  items_processed INTEGER DEFAULT 0,
  items_total INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON public.processing_jobs(status, priority DESC, created_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jobs_user ON public.processing_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_org ON public.processing_jobs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.processing_jobs(org_id, status, created_at DESC);

-- Enable RLS
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own jobs"
ON public.processing_jobs FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own jobs"
ON public.processing_jobs FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can manage all jobs"
ON public.processing_jobs FOR ALL
USING (true);