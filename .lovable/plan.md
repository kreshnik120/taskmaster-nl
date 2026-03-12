

# BENDY-REQ-CLEANUP: Diensten Duplicaten Cleanup

## 3 onderdelen

### 1. Database migratie
Nieuwe migratie met PL/pgSQL functie `cleanup_diensten_duplicates(batch_size)`:
- Telt duplicaten via `ROW_NUMBER() OVER (PARTITION BY org_id, bendy_id)`
- Verwijdert in batches (loop met `LIMIT batch_size`)
- Maakt `UNIQUE INDEX` aan op `(org_id, bendy_id) WHERE bendy_id IS NOT NULL`
- Retourneert JSON met stats
- **Alleen CREATE FUNCTION** — wordt niet aangeroepen in de migratie

### 2. Edge function action (`supabase/functions/bendy-sync/index.ts`)
Nieuwe `cleanup_diensten` action toevoegen na het `reset_lock` blok (regel 2493), vóór de onbekende-actie check (regel 2495):
```
if (body.action === 'cleanup_diensten') {
  const { data, error } = await adminClient.rpc('cleanup_diensten_duplicates', { batch_size: 5000 });
  return jsonResponse({ success: !error, result: data, error: error?.message });
}
```
Ook `cleanup_diensten` toevoegen aan de action type en de foutmelding op regel 2495-2496.

### 3. Frontend knop (`src/pages/BendySync.tsx`)
Nieuwe state: `cleaningUp` (boolean), `cleanupResult` (object|null).

Knop boven de "Requisition Sync Starten" knop in de Requisition Sync card (regel ~1290):
- Label: "🧹 Cleanup Diensten Duplicaten"
- Amber/oranje variant (outline met amber styling)
- Roept `supabase.functions.invoke('bendy-sync', { body: { action: 'cleanup_diensten' } })` aan
- Toast bij succes/fout
- Disabled tijdens uitvoering met spinner
- Na succes: toont resultaat ("X duplicaten verwijderd, index aangemaakt")

### Niet aangeraakt
- Andere sync functies, logProgress debug code, andere pagina's, database schema buiten de nieuwe functie

