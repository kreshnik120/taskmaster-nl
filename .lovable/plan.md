
# Fix: encrypt_bsn en decrypt_bsn RPC functies aanmaken

## Probleem
De oorspronkelijke migratie bevatte de CREATE FUNCTION statements voor `encrypt_bsn` en `decrypt_bsn`, maar deze zijn niet in de database terechtgekomen. Waarschijnlijk is de migratie gedeeltelijk gefaald bij de functies vanwege een `search_path` probleem met pgcrypto (die in het `extensions` schema zit).

## Huidige status
- pgcrypto: actief
- Kolommen: aanwezig
- Cache redactie: compleet (937 records)
- bsn-vault edge function: deployed en werkend (status actie OK)
- **encrypt_bsn / decrypt_bsn functies: ONTBREKEN**
- 472 BSN's staan nog als plaintext

## Oplossing
Een nieuwe database migratie die de twee RPC functies aanmaakt met het juiste search_path (`public, extensions`) zodat pgcrypto gevonden wordt:

```sql
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
```

## Na de migratie
Daarna kan via de BendySync pagina "BSN's Nu Versleutelen" worden gedrukt om alle 472 plaintext BSN's te encrypteren.

## Technisch detail
- 1 nieuw bestand: SQL migratie
- Geen code-wijzigingen nodig
- Geen frontend-wijzigingen nodig
