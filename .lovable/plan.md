
# BSN Encryptie (AVG-compliance)

## Probleem
BSN-nummers staan als plaintext in de database (`professional_bsn.encrypted_bsn`) en in de Bendy cache (`bendy_raw_cache.raw_data`). Dit is een AVG-schending.

## Oplossing: 6 wijzigingen

### A. Database migratie
- Activeer `pgcrypto` extensie
- Voeg `bsn_encrypted` (BYTEA) en `is_encrypted` (BOOLEAN) kolommen toe aan `professional_bsn`
- Maak `encrypt_bsn` en `decrypt_bsn` RPC functies (SECURITY DEFINER, alleen service_role)
- Redacteer bestaande BSN's in `bendy_raw_cache` naar `[REDACTED]`
- Index op `is_encrypted = false` voor snelle migratie-queries

### B. Nieuwe edge function: `bsn-vault`
3 acties (alle admin-only):
- `decrypt`: BSN ophalen + decrypteren via pgcrypto, audit log schrijven
- `migrate`: Alle plaintext BSN's in bulk versleutelen
- `status`: Tellen hoeveel versleuteld vs plaintext

### C. bendy-sync: BSN strippen uit cache
Bij het opbouwen van `cacheWrites` wordt `citizen_service_number` vervangen door `[REDACTED]` voordat het in `bendy_raw_cache` wordt opgeslagen.

### D. bendy-sync: BSN versleuteld opslaan
- BSN writes verzamelen met `bsn_plaintext` veld (in-memory)
- In fase 2d: elk BSN versleutelen via `encrypt_bsn` RPC
- Opslaan als `bsn_encrypted` (BYTEA) + `encrypted_bsn = '[ENCRYPTED]'` + `is_encrypted = true`
- Als `BSN_ENCRYPTION_KEY` ontbreekt: BSN opslag overslaan (geen crash, geen plaintext)

### E. Frontend: BSN ophalen via edge function
`fetchAndRevealBsn` in `ProfessionalDetailModal.tsx` roept `bsn-vault` edge function aan i.p.v. directe database query. Audit logging gebeurt server-side.

### F. BendySync pagina: BSN Encryptie Status card
Nieuwe card met:
- "Controleer Encryptie Status" knop (toont totaal/versleuteld/plaintext)
- "X BSN's Nu Versleutelen" knop (alleen zichtbaar als er plaintext BSN's zijn)

## Na deployment (handmatig)
1. Secret `BSN_ENCRYPTION_KEY` instellen (min 32 tekens)
2. Via BendySync pagina: "Controleer Encryptie Status" en dan "BSN's Nu Versleutelen"
3. Verifieer dat BSN-onthulling nog werkt bij een professional

## Bestanden die wijzigen
- `supabase/migrations/new.sql` (migratie)
- `supabase/functions/bsn-vault/index.ts` (nieuw)
- `supabase/functions/bendy-sync/index.ts` (4 kleine edits)
- `src/components/ProfessionalDetailModal.tsx` (1 edit)
- `src/pages/BendySync.tsx` (3 edits)

## Wat NIET verandert
- Sync logica (matching, veld-mapping, status)
- Lock/circuit breaker
- Overige RLS policies
- Database schema (geen kolom verwijderingen)
