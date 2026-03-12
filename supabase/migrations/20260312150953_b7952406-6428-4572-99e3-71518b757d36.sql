
-- Drop the partial unique index that PostgREST cannot use as conflict target
DROP INDEX IF EXISTS public.idx_diensten_org_bendy_id_unique;

-- Create a real UNIQUE constraint that PostgREST recognizes for upsert onConflict
ALTER TABLE public.diensten ADD CONSTRAINT diensten_org_bendy_unique UNIQUE (org_id, bendy_id);
