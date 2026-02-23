

# Bendy-Sync Fix: Functie-niveau herberekening bij Document Sync

## Probleem
1. `syncDocuments()` slaat 3.099 documenten correct op maar herberekent NIET het `functie_niveau` op basis van de gesyncte diploma's
2. Het INSERT path in `syncUsers()` (regel 1137) roept `deriveFunctieNiveau()` aan met slechts 3 parameters -- het diploma-niveau ontbreekt als 4e parameter

## Wijzigingen

### A. Document sync: functie_niveau herberekenen (regels 1444-1451)
Na het verwerken van documenten per professional, wordt `professional_documents` opgehaald en `deriveFunctieNiveauFromDiplomas()` aangeroepen. Als een diploma-niveau gevonden wordt, wordt `functie_niveau` meegestuurd in de meta-update.

### B. INSERT path: diploma-niveau meenemen (regel 1137)
Voor nieuwe professionals worden documenten opgehaald via `fetchBendyApi(tenant, '/api/v2/users/${bendyId}/documents')` en het diploma-niveau wordt als 4e parameter doorgegeven aan `deriveFunctieNiveau()`.

## Technische details

### Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (2 wijzigingen)

### Wijziging A detail (regels 1444-1451)
Huidige code bouwt enkel `documents_synced_at`, `documents_count`, `documents_expiring_count`. Wordt uitgebreid met:
```typescript
const { data: proDocs } = await adminClient
  .from('professional_documents')
  .select('document_name, document_type')
  .eq('professional_id', pro.id);
const diplomaNiveau = deriveFunctieNiveauFromDiplomas(proDocs || []);
// ... metaData object opbouwen
if (diplomaNiveau) {
  metaData.functie_niveau = diplomaNiveau;
}
```

### Wijziging B detail (regel 1137)
Huidige code: `deriveFunctieNiveau(userGroupNames, decodedFunctionType, decodedLevel)` (3 params).
Wordt uitgebreid met een `fetchBendyApi` call naar `/api/v2/users/${bendyId}/documents` om diploma's op te halen en als 4e parameter door te geven.

### Risico
- Wijziging A: 1 extra DB query per professional in document sync. Bij ~200 professionals met documenten is dit acceptabel.
- Wijziging B: 1 extra API call per INSERT. Bij nieuwe professionals is dit een klein aantal per sync.
- Beide wijzigingen zijn defensief: als ophalen faalt, wordt de bestaande 3-parameter logica gebruikt.
