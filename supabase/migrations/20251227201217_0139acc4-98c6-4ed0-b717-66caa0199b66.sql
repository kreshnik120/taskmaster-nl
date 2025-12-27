-- Add diploma verification fields to professionals table
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS diploma_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS diploma_document_path TEXT,
ADD COLUMN IF NOT EXISTS diploma_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS diploma_verification_details JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.professionals.diploma_verified IS 'Whether the diploma has been verified (DUO or manual)';
COMMENT ON COLUMN public.professionals.diploma_document_path IS 'Path to the diploma file in storage';
COMMENT ON COLUMN public.professionals.diploma_verified_at IS 'When the diploma was verified';
COMMENT ON COLUMN public.professionals.diploma_verification_details IS 'Details of the verification (method, source, etc.)';