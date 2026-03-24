

# DIAG-5: Bevestig duplicaat-patroon ingeplande diensten

## Actie
Twee read-only SQL queries uitvoeren via `psql` om te bevestigen dat de 15 extra diensten veroorzaakt worden door meerdere Bendy requisitions voor dezelfde sublocation + datum + tijdslot. Geen codewijzigingen.

1. **Query 1** — Duplicaat-groepen: alle combinaties van locatie + datum + start + eind met meer dan 1 dienst, inclusief de bendy_ids
2. **Query 2** — Totaaltelling: som van extra diensten en aantal groepen

Verwacht resultaat: ~15 extra diensten in ~15 groepen, elk met 2 verschillende bendy_ids.

