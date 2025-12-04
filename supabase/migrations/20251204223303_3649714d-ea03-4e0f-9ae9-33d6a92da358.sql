-- Add matching fields to professionals table for unified matching
-- These fields enable direct matching without JOINing to professional_applications.extracted_data

-- Add experience fields
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS ervaring_sector text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS doelgroep_ervaring text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS jaren_ervaring integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS leidinggevende_ervaring boolean DEFAULT false;

-- Add availability/mobility fields  
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS nachtdienst_bereid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS weekenddienst_bereid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS certificaten text[] DEFAULT '{}';

-- Add beschikbaarheid_uren JSONB field for structured availability
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS beschikbaarheid_uren jsonb DEFAULT NULL;

-- Backfill Murad Kasac with his extracted_data from application
UPDATE public.professionals p
SET 
  ervaring_sector = COALESCE((
    SELECT ARRAY(SELECT jsonb_array_elements_text(pa.extracted_data->'ervaring_sector'))
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    AND pa.extracted_data->'ervaring_sector' IS NOT NULL
    LIMIT 1
  ), '{}'),
  doelgroep_ervaring = COALESCE((
    SELECT ARRAY(SELECT jsonb_array_elements_text(pa.extracted_data->'doelgroep_ervaring'))
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    AND pa.extracted_data->'doelgroep_ervaring' IS NOT NULL
    LIMIT 1
  ), '{}'),
  jaren_ervaring = (
    SELECT (pa.extracted_data->>'jaren_ervaring')::integer
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    AND pa.extracted_data->>'jaren_ervaring' IS NOT NULL
    LIMIT 1
  ),
  leidinggevende_ervaring = COALESCE((
    SELECT (pa.extracted_data->>'leidinggevende_ervaring')::boolean
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    LIMIT 1
  ), false),
  nachtdienst_bereid = COALESCE((
    SELECT (pa.extracted_data->>'nachtdienst_bereid')::boolean
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    LIMIT 1
  ), false),
  weekenddienst_bereid = COALESCE((
    SELECT (pa.extracted_data->>'weekenddienst_bereid')::boolean
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    LIMIT 1
  ), false),
  certificaten = COALESCE((
    SELECT ARRAY(SELECT jsonb_array_elements_text(pa.extracted_data->'certificaten'))
    FROM professional_applications pa 
    WHERE pa.professional_id = p.id 
    AND pa.extracted_data->'certificaten' IS NOT NULL
    LIMIT 1
  ), '{}')
WHERE EXISTS (
  SELECT 1 FROM professional_applications pa WHERE pa.professional_id = p.id
);

-- Add index for faster matching queries
CREATE INDEX IF NOT EXISTS idx_professionals_ervaring_sector ON public.professionals USING GIN(ervaring_sector);
CREATE INDEX IF NOT EXISTS idx_professionals_doelgroep_ervaring ON public.professionals USING GIN(doelgroep_ervaring);

-- Add comment for documentation
COMMENT ON COLUMN public.professionals.ervaring_sector IS 'Healthcare sectors the professional has experience in (VVT, GGZ, GHZ, etc.)';
COMMENT ON COLUMN public.professionals.doelgroep_ervaring IS 'Target groups the professional has experience with (LVB, Autisme, Ouderen, etc.)';
COMMENT ON COLUMN public.professionals.jaren_ervaring IS 'Total years of healthcare experience';
COMMENT ON COLUMN public.professionals.leidinggevende_ervaring IS 'Whether the professional has leadership/management experience';
COMMENT ON COLUMN public.professionals.nachtdienst_bereid IS 'Willing to work night shifts';
COMMENT ON COLUMN public.professionals.weekenddienst_bereid IS 'Willing to work weekend shifts';
COMMENT ON COLUMN public.professionals.certificaten IS 'Professional certifications (BIG, BHV, etc.)';