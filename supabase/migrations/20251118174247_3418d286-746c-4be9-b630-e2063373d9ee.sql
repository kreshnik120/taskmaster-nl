-- Create table to track embedding generation failures
CREATE TABLE IF NOT EXISTS public.embedding_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID NOT NULL REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL,
  error_message TEXT,
  token_count INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_embedding_failures_knowledge_id ON public.embedding_failures(knowledge_id);
CREATE INDEX IF NOT EXISTS idx_embedding_failures_attempted_at ON public.embedding_failures(attempted_at);

-- Enable RLS
ALTER TABLE public.embedding_failures ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view embedding failures
CREATE POLICY "Admins can view embedding failures"
  ON public.embedding_failures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );