
-- BENDY-SYNC-4D: 9 nieuwe kolommen voor company data en extra user attributen
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS agb_code TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS skj_registratie TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS iban_tenaamstelling TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS boekhouding_email TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bedrijfstelefoon TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bendy_username TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bendy_mediator_id TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bendy_function_type TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bendy_created_at TIMESTAMPTZ;
