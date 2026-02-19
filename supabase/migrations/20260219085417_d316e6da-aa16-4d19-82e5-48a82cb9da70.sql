
-- Stap 1: Nieuwe kolom voor de versleutelde data
ALTER TABLE public.professional_bsn
  ADD COLUMN IF NOT EXISTS bsn_encrypted BYTEA;

-- Stap 2: Boolean om aan te geven of het BSN versleuteld is
ALTER TABLE public.professional_bsn
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Stap 3: Markeer alle bestaande rijen als NIET versleuteld
UPDATE public.professional_bsn
  SET is_encrypted = false
  WHERE encrypted_bsn IS NOT NULL
    AND encrypted_bsn != '[ENCRYPTED]';

-- Stap 4: Index voor snel opzoeken van niet-versleutelde rijen
CREATE INDEX IF NOT EXISTS idx_professional_bsn_not_encrypted
  ON public.professional_bsn(is_encrypted)
  WHERE is_encrypted = false;

-- Stap 5: RPC functie voor encryptie (SECURITY DEFINER) — with extensions schema
CREATE OR REPLACE FUNCTION public.encrypt_bsn(p_plaintext TEXT, p_key TEXT)
RETURNS BYTEA
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_encrypt(p_plaintext, p_key);
$$;

-- Stap 6: RPC functie voor decryptie
CREATE OR REPLACE FUNCTION public.decrypt_bsn(p_encrypted BYTEA, p_key TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_decrypt(p_encrypted, p_key);
$$;

-- Stap 7: Alleen service_role mag deze functies aanroepen
REVOKE ALL ON FUNCTION public.encrypt_bsn(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_bsn(BYTEA, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_bsn(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_bsn(BYTEA, TEXT) TO service_role;

-- Stap 8: Redacteer bestaande BSN's in bendy_raw_cache
UPDATE public.bendy_raw_cache
SET raw_data = jsonb_set(
  raw_data::jsonb,
  '{attributes,citizen_service_number}',
  '"[REDACTED]"'::jsonb
)
WHERE entity_type = 'users'
  AND raw_data::jsonb -> 'attributes' ->> 'citizen_service_number' IS NOT NULL
  AND raw_data::jsonb -> 'attributes' ->> 'citizen_service_number' != '[REDACTED]';
