

# BENDY-REQ-5B-DIAG-1: Sync log checkpoints zichtbaar maken

## Wijzigingen

### 1. Edge function query — `errors` toevoegen (`supabase/functions/bendy-sync/index.ts`, ~regel 2112)
- Voeg `errors` toe aan de select string van `recentLogs` (naast bestaande `metadata`)

### 2. Frontend SyncLog interface (`src/pages/BendySync.tsx`, regel 29-43)
- Voeg `errors?: any[]` en `metadata?: any` toe aan de interface

### 3. Sync logs tabel uitklapbaar maken (~regel 1544-1565)
- Voeg `expandedLogId` state toe (string | null)
- Maak elke `TableRow` klikbaar (`onClick` → toggle expandedLogId)
- Na elke rij: als expanded, toon een extra `TableRow` met `colSpan={9}` die `errors` en `metadata` toont als geformateerde JSON in een `<pre>` blok
- Styling: `bg-gray-50 dark:bg-gray-900`, monospace, max-h-[400px] overflow-y-auto, p-4
- Cursor pointer op rijen, subtiele hover indicator

### Niet aanraken
- Edge function sync logica, cleanup, database schema

