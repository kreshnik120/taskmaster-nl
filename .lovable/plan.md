
# Fix: Kopiëren datum+1 timezone bug

## Bestand: `src/pages/Planning.tsx`

Twee minimale wijzigingen:

1. **Regel 4** — `parseISO` toevoegen aan import:
   `import { startOfWeek, format, addDays, parseISO } from "date-fns";`

2. **Regel 88** — `new Date(dienst.datum)` vervangen door `parseISO(dienst.datum)`:
   `const newDatum = format(addDays(parseISO(dienst.datum), 1), "yyyy-MM-dd");`

## Verificatie
Kopieer een dienst van 12-02-2026 → kopie moet op 13-02-2026 verschijnen (niet op 12-02-2026).
