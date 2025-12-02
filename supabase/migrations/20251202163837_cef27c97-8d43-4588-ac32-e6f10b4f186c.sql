-- Database function for case-insensitive email duplicate check
-- This is O(1) vs O(n) client-side filtering

CREATE OR REPLACE FUNCTION public.check_duplicate_email(
  p_email TEXT,
  p_table TEXT DEFAULT 'professional_applications'
)
RETURNS TABLE(
  id UUID,
  naam TEXT,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table = 'professional_applications' THEN
    RETURN QUERY
    SELECT 
      pa.id,
      COALESCE((pa.extracted_data->>'naam')::TEXT, 'Onbekend') as naam,
      pa.email_from as email
    FROM professional_applications pa
    WHERE LOWER(TRIM(pa.email_from)) = LOWER(TRIM(p_email))
      AND pa.deleted_at IS NULL
    LIMIT 1;
  ELSIF p_table = 'professionals' THEN
    RETURN QUERY
    SELECT 
      p.id,
      p.full_name as naam,
      p.email
    FROM professionals p
    WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(p_email))
      AND p.deleted_at IS NULL
    LIMIT 1;
  END IF;
END;
$$;