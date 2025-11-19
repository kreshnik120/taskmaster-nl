-- Update check constraint om 'auto_resolved' toe te staan
ALTER TABLE public.data_conflicts 
DROP CONSTRAINT IF EXISTS data_conflicts_resolution_status_check;

ALTER TABLE public.data_conflicts 
ADD CONSTRAINT data_conflicts_resolution_status_check 
CHECK (resolution_status IN ('pending', 'resolved', 'ignored', 'merged', 'auto_resolved'));

-- Update bestaande records met ongeldige status (indien aanwezig)
-- Dit voorkomt problemen met bestaande data
UPDATE public.data_conflicts 
SET resolution_status = 'resolved' 
WHERE resolution_status NOT IN ('pending', 'resolved', 'ignored', 'merged', 'auto_resolved');