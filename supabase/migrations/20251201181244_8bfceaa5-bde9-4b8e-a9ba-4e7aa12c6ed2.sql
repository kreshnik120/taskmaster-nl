-- Voeg provincie kolom toe aan professionals tabel voor betere regio matching
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS provincie text;