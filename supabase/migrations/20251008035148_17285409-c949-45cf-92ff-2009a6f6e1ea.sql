-- Week 1-2: Data & PII Foundations Migration (Fixed)
-- Add new metadata columns to ai_knowledge_base for enhanced filtering and security

-- Add new columns to ai_knowledge_base (skip enum creation as it already exists)
ALTER TABLE public.ai_knowledge_base
ADD COLUMN IF NOT EXISTS valid_from DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS valid_to DATE,
ADD COLUMN IF NOT EXISTS jurisdiction TEXT DEFAULT 'NL',
ADD COLUMN IF NOT EXISTS confidentiality confidentiality_level DEFAULT 'intern',
ADD COLUMN IF NOT EXISTS acl JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS role_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS assignment_id UUID,
ADD COLUMN IF NOT EXISTS chunk_id TEXT,
ADD COLUMN IF NOT EXISTS chunk_index INTEGER,
ADD COLUMN IF NOT EXISTS original_text TEXT,
ADD COLUMN IF NOT EXISTS redacted_text TEXT;

-- Create indexes for date range queries (validity window)
CREATE INDEX IF NOT EXISTS idx_knowledge_validity ON public.ai_knowledge_base(valid_from, valid_to) 
WHERE deleted_at IS NULL;

-- Create index for role-based filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_role_tags ON public.ai_knowledge_base USING GIN(role_tags)
WHERE deleted_at IS NULL;

-- Create index for ACL filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_acl ON public.ai_knowledge_base USING GIN(acl)
WHERE deleted_at IS NULL;

-- Create index for jurisdiction
CREATE INDEX IF NOT EXISTS idx_knowledge_jurisdiction ON public.ai_knowledge_base(jurisdiction)
WHERE deleted_at IS NULL;

-- Create function to check if knowledge is currently valid
CREATE OR REPLACE FUNCTION public.is_knowledge_valid(
  _valid_from DATE,
  _valid_to DATE
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT (
    _valid_from <= CURRENT_DATE 
    AND (_valid_to IS NULL OR _valid_to >= CURRENT_DATE)
  )
$$;

-- Create function to check ACL access
CREATE OR REPLACE FUNCTION public.has_acl_access(
  _user_id UUID,
  _acl JSONB
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Empty ACL means accessible to all
    jsonb_array_length(_acl) = 0
    OR
    -- Check if user's role is in ACL
    EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = _user_id
      AND ur.role::text = ANY(
        SELECT jsonb_array_elements_text(_acl)
      )
    )
  )
$$;

-- Update match_knowledge function to include new filters
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 50,
  filter_org_id uuid DEFAULT NULL,
  filter_role_tags text[] DEFAULT NULL,
  filter_customer_id uuid DEFAULT NULL,
  filter_jurisdiction text DEFAULT 'NL'
)
RETURNS TABLE(
  knowledge_id uuid,
  category text,
  key text,
  value jsonb,
  confidence_score numeric,
  similarity double precision,
  role_tags text[],
  valid_from date,
  valid_to date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id AS knowledge_id,
    kb.category,
    kb.key,
    kb.value,
    kb.confidence_score,
    1 - (ke.embedding <=> query_embedding) AS similarity,
    kb.role_tags,
    kb.valid_from,
    kb.valid_to
  FROM public.knowledge_embeddings ke
  JOIN public.ai_knowledge_base kb ON kb.id = ke.knowledge_id
  WHERE 
    -- Existing filters
    (filter_org_id IS NULL OR kb.org_id = filter_org_id)
    AND kb.deleted_at IS NULL
    AND (1 - (ke.embedding <=> query_embedding)) > match_threshold
    -- New validity window filter
    AND is_knowledge_valid(kb.valid_from, kb.valid_to)
    -- Jurisdiction filter
    AND (filter_jurisdiction IS NULL OR kb.jurisdiction = filter_jurisdiction)
    -- Client/customer filter
    AND (filter_customer_id IS NULL OR kb.client_id = filter_customer_id)
    -- Role tags filter (overlap check)
    AND (
      filter_role_tags IS NULL 
      OR kb.role_tags && filter_role_tags
      OR array_length(kb.role_tags, 1) IS NULL
    )
    -- ACL check
    AND has_acl_access(auth.uid(), kb.acl)
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create table for PII detection patterns
CREATE TABLE IF NOT EXISTS public.pii_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  regex_pattern TEXT NOT NULL,
  replacement_template TEXT DEFAULT '[REDACTED]',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default PII patterns for Dutch context (only if table is empty)
INSERT INTO public.pii_patterns (pattern_type, regex_pattern, replacement_template)
SELECT * FROM (VALUES
  ('bsn', '\b\d{9}\b', '[BSN]'),
  ('email', '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]'),
  ('phone', '\b(\+31|0031|0)\s?[1-9](\s?\d){8}\b', '[TELEFOON]'),
  ('phone_mobile', '\b(\+31|0031|0)6(\s?\d){8}\b', '[MOBIEL]'),
  ('postcode', '\b\d{4}\s?[A-Z]{2}\b', '[POSTCODE]'),
  ('iban', '\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b', '[IBAN]')
) AS patterns(pattern_type, regex_pattern, replacement_template)
WHERE NOT EXISTS (SELECT 1 FROM public.pii_patterns LIMIT 1);

-- Enable RLS on pii_patterns
ALTER TABLE public.pii_patterns ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and recreate
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read PII patterns" ON public.pii_patterns;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Authenticated users can read PII patterns"
ON public.pii_patterns
FOR SELECT
TO authenticated
USING (true);

-- Drop and recreate admin policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage PII patterns" ON public.pii_patterns;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Only admins can manage PII patterns"
ON public.pii_patterns
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create function for PII redaction
CREATE OR REPLACE FUNCTION public.redact_pii(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_text TEXT;
  pattern_record RECORD;
BEGIN
  result_text := input_text;
  
  -- Apply all enabled PII patterns
  FOR pattern_record IN 
    SELECT regex_pattern, replacement_template 
    FROM pii_patterns 
    WHERE enabled = true
    ORDER BY pattern_type
  LOOP
    result_text := regexp_replace(
      result_text, 
      pattern_record.regex_pattern, 
      pattern_record.replacement_template, 
      'g'
    );
  END LOOP;
  
  RETURN result_text;
END;
$$;

-- Update RLS policies on ai_knowledge_base to respect new ACL and role_tags
DROP POLICY IF EXISTS "Users can view knowledge in their org" ON public.ai_knowledge_base;
DROP POLICY IF EXISTS "Users can view knowledge with ACL check" ON public.ai_knowledge_base;

CREATE POLICY "Users can view knowledge with ACL check"
ON public.ai_knowledge_base
FOR SELECT
TO authenticated
USING (
  -- Must be in same org
  EXISTS (
    SELECT 1
    FROM user_organizations
    WHERE user_organizations.org_id = ai_knowledge_base.org_id
    AND user_organizations.user_id = auth.uid()
  )
  -- Must have ACL access
  AND has_acl_access(auth.uid(), acl)
  -- Must be within validity window
  AND is_knowledge_valid(valid_from, valid_to)
  -- Not deleted
  AND deleted_at IS NULL
);

-- Add helpful comments
COMMENT ON COLUMN public.ai_knowledge_base.valid_from IS 'Start date of knowledge validity period';
COMMENT ON COLUMN public.ai_knowledge_base.valid_to IS 'End date of knowledge validity period (NULL = indefinite)';
COMMENT ON COLUMN public.ai_knowledge_base.jurisdiction IS 'Legal jurisdiction (default: NL for Netherlands)';
COMMENT ON COLUMN public.ai_knowledge_base.confidentiality IS 'Data classification level';
COMMENT ON COLUMN public.ai_knowledge_base.acl IS 'Access Control List - array of roles that can access this knowledge';
COMMENT ON COLUMN public.ai_knowledge_base.role_tags IS 'Functional role tags (HR, Planning, Facturatie, Compliance, Sales)';
COMMENT ON COLUMN public.ai_knowledge_base.assignment_id IS 'Link to specific assignment/opdracht';
COMMENT ON COLUMN public.ai_knowledge_base.chunk_id IS 'Stable chunk identifier: doc:ver:sec:page:idx';
COMMENT ON COLUMN public.ai_knowledge_base.original_text IS 'Original text before PII redaction (encrypted storage only)';
COMMENT ON COLUMN public.ai_knowledge_base.redacted_text IS 'PII-redacted version for embeddings and display';