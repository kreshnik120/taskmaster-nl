

# SYNC-FIX-4: Datumfilter + metadata debuggen

## Probleem
De sync slaagt nu (14s, success), maar:
- **16.545 records** ipv ~449 → datumfilter niet actief
- **metadata = null** → debug info wordt niet weggeschreven
- De CPU-fix (skip cache/mapping) compenseert, maar 16K records is onnodig

## Diagnose nodig
Ik moet het huidige bestand lezen om te zien waarom:
1. De `dateFilterParams` niet worden meegegeven aan `fetchAllBendyRecords`
2. Het metadata-blok aan het einde van de sync niet schrijft
3. Het in-memory `inDateRange` filter niet werkt

## Voorstel
Laat me eerst `bendy-sync-requisitions.ts` lezen (huidige staat na SYNC-FIX-3) om de exacte regels te identificeren. Dan ontwerp ik een gerichte fix.

**Wil je dat ik het bestand inspecteer en een fix-plan maak?**

