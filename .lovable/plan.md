
Do I know what the issue is? Ja.

Probleem (bevestigd):
- De cleanup zelf werkt: er zijn al ~70k duplicaten verwijderd.
- De fout ontstaat pas bij de afronding: `CREATE UNIQUE INDEX ...` in `cleanup_diensten_duplicates`.
- Die functie draait nu als **SECURITY INVOKER** (default), dus met rechten van de aanroeper (`service_role`) en niet van de eigenaar van `diensten`.
- Daarom krijg je: `must be owner of table diensten`.

Bestanden die dit raken:
- `supabase/migrations/20260312142111_e213bb79-7071-4910-a45c-5a1ab97dc7b6.sql` (huidige functie)
- `supabase/functions/bendy-sync/index.ts` (RPC-aanroep/response)
- `src/pages/BendySync.tsx` (status/voortgangstekst)

Plan van aanpak:
1) Database-functie veilig en uitvoerbaar maken
- Nieuwe migratie met `CREATE OR REPLACE FUNCTION public.cleanup_diensten_duplicates(...)`
- Zelfde batch-delete logica behouden (tie-breaker op `created_at` + `id`)
- Functie aanpassen naar:
  - `SECURITY DEFINER`
  - `SET search_path = public`
- Rechten aanscherpen:
  - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
  - `GRANT EXECUTE ... TO service_role`
- Index-aanmaak in `BEGIN ... EXCEPTION ... END` zetten zodat bij index-probleem geen harde crash meer komt maar een nette return (`index_error`) i.p.v. volledig falen.

2) Edge function response robuuster maken
- In `bendy-sync` cleanup-actie:
  - bestaande RPC-call houden
  - als RPC faalt: duidelijke `error` teruggeven
  - als RPC slaagt maar `result.index_error` bestaat: dit expliciet teruggeven zodat frontend juiste melding toont.

3) Frontend UX corrigeren (zodat status klopt en niet “vast” lijkt)
- In `BendySync.tsx`:
  - cumulatief tellen vanaf bestaande `cleanupResult.total_deleted` (niet steeds vanaf 0 bij hervatten)
  - “-1 resterend” vervangen door nette tekst (“bezig met batches…”)
  - status onderscheid:
    - Cleanup klaar + index aangemaakt → groen voltooid
    - Cleanup klaar + index nog niet aangemaakt → waarschuwing met retry mogelijk
    - Onderbroken door timeout/andere fout → hervatbaar

4) Verificatie na implementatie
- Klik op “🧹 Cleanup Diensten Duplicaten” vanuit huidige onderbroken status.
- Verwacht:
  - geen `must be owner` meer
  - afronding met index-aanmaak of duidelijke, niet-crashende index-foutmelding
- Daarna “Requisition Sync Starten” draaien en controleren dat upsert op `onConflict: org_id,bendy_id` normaal doorloopt.

Technische details:
- Kernoorzaak is permissiecontext in Postgres (invoker vs definer), niet meer primair query-performance.
- `CREATE OR REPLACE FUNCTION` behoudt bestaande functie-identiteit; daarom zetten we expliciet security + grants opnieuw in migratie.
- Met restricted execute op alleen `service_role` voorkomen we dat een definer-functie per ongeluk publiek aanroepbaar wordt.
