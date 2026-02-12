ALTER TABLE public.diensten ADD COLUMN is_spoed BOOLEAN DEFAULT false;
ALTER TABLE public.diensten ADD COLUMN kleur TEXT DEFAULT null;