-- Herstel encrypt_bsn functie
CREATE OR REPLACE FUNCTION public.encrypt_bsn(p_plaintext TEXT, p_key TEXT)
RETURNS BYTEA
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_encrypt(p_plaintext, p_key);
$$;

-- Herstel decrypt_bsn functie
CREATE OR REPLACE FUNCTION public.decrypt_bsn(p_encrypted BYTEA, p_key TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_decrypt(p_encrypted, p_key);
$$;

-- Permissies: alleen service_role
REVOKE ALL ON FUNCTION public.encrypt_bsn(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_bsn(BYTEA, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_bsn(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_bsn(BYTEA, TEXT) TO service_role;