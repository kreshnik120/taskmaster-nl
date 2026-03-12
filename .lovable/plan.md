
Ik heb de fout herleid en weet nu waar het misgaat.

Do I know what the issue is? Ja.

Wat ik heb vastgesteld:
- De foutmelding is: `canceling statement due to statement timeout`.
- In de database staan nog heel veel duplicaten (`~70k` te verwijderen).
- De huidige cleanup-functie doet per call meerdere zware full-table scans (`COUNT ... EXISTS`) vóór én ná de delete.
- Er is nog geen `UNIQUE` index op `(org_id, bendy_id)`.
- Er zijn ook timestamp-ties (gelijke `created_at`) in duplicate groepen; met alleen `<` mis je een deel duplicaten.

Plan (BENDY-REQ-CLEANUP-v3):

1) Nieuwe migratie: functie vervangen door “delete-first” batch functie
- Bestand: nieuwe migratie in `supabase/migrations/...sql`
- `CREATE OR REPLACE FUNCTION public.cleanup_diensten_duplicates(batch_size int default 200)`
- Belangrijk:
  - Eerst direct 1 batch deleten (geen voorafgaande totale count).
  - Duplicate-detectie met tie-breaker:
    - `d2.created_at < d1.created_at`
    - OF bij gelijke timestamp: `d2.id < d1.id`
  - Daarna:
    - als `deleted_this_batch > 0` => `has_more = true` (zonder zware recount)
    - als `deleted_this_batch = 0` => pas dan 1 lichte controle of nog duplicates bestaan.
  - Alleen als echt 0 duplicates: poging tot unique index aanmaken.
  - Return payload: `{ deleted_this_batch, has_more, unique_index_created, message }`.

2) Nieuwe migratie: helper index toevoegen voor snelle duplicate lookup
- In dezelfde migratie:
  - `CREATE INDEX IF NOT EXISTS idx_diensten_org_bendy_created_id ON public.diensten (org_id, bendy_id, created_at, id) WHERE bendy_id IS NOT NULL;`
- Doel: EXISTS-lookup versnellen zodat batch-calls onder timeout blijven.

3) Edge function klein aanpassen
- Bestand: `supabase/functions/bendy-sync/index.ts`
- `cleanup_diensten` action:
  - batch_size verlagen naar `200` (veiligere runtime).
  - response ongewijzigd doorgeven.
  - extra logging toevoegen rond RPC-duration + fouttekst (voor snelle diagnose bij volgende issues).

4) Frontend-loop robuust maken
- Bestand: `src/pages/BendySync.tsx`
- Cleanup handler:
  - loop op `result.has_more` i.p.v. exacte `duplicates_remaining`.
  - max-iteratie guard (bijv. 1000) + korte delay (50–100ms) tussen calls.
  - als onderbroken: duidelijke toast met “klik opnieuw om door te gaan”.
- Button tekst:
  - tijdens run: totaal verwijderd tonen.
  - bij success: index-status tonen.
  - bij onderbreking: hervat-status tonen.

Technische details (kort):
- Kernfix is: zware `COUNT` niet meer op elke batch-call.
- Tie-breaker op `(created_at, id)` voorkomt dat duplicates met gelijke timestamp blijven hangen.
- Helper index voorkomt dure scans op 70k+ records.
- Frontend stuurt gecontroleerde batch-loop; backend-call blijft kort en timeout-safe.

Verificatie na implementatie:
1. Klik “Cleanup Diensten Duplicaten”.
2. Verwacht: batches lopen door zonder timeout, teller loopt op.
3. Eindsituatie: `deleted_this_batch = 0`, `has_more = false`, `unique_index_created = true`.
4. Daarna Requisition Sync draaien: geen nieuwe duplicate inserts op `(org_id, bendy_id)`.

