
# Fix: functie_niveau correct afleiden via Bendy Selection Lists

## Probleem
Alle 1.427 professionals tonen "Helpende" als functie_niveau. De oorzaak is drieledig:
1. **0 professionals** hebben groep-relaties in Bendy, dus de groep-gebaseerde logica werkt nooit
2. `function_type` en `level` bevatten **gecodeerde waarden** (bijv. `,adl`, `,bgl3`) die eerst gedecodeerd moeten worden via Bendy's Selection Lists API
3. De UPDATE-path skipt updates wanneer het resultaat "Helpende" is

## Oplossing (4 wijzigingen in 1 bestand + 1 SQL migratie)

### Wijziging A: `deriveFunctieNiveau()` uitbreiden (regel 391-402)
Functie krijgt 3 parameters: `groupNames`, `functionType`, `level`. Cascade:
1. Groepnamen (al menselijk leesbaar)
2. Level (gedecodeerd via selectionListMap)
3. Function_type (gedecodeerd via selectionListMap)
4. Fallback: "Helpende"

### Wijziging B: Selection Lists ophalen in `syncUsers()` (na regel 856)
Toevoegen van een nieuwe API call naar `/api/v2/selection_lists` om de code-naar-naam mapping op te bouwen. De comma-prefix (`,adl` wordt `adl`) wordt gestript bij het opzoeken.

### Wijziging C: UPDATE path (regel 970-981)
- Decodeer `function_type` en `level` via selectionListMap
- Geef beide door aan `deriveFunctieNiveau()`
- Verwijder de `if (functieNiveau !== 'Helpende')` guard -- Bendy is altijd leidend

### Wijziging D: INSERT path (regel 1016-1022)
- Zelfde decodering + doorgifte aan `deriveFunctieNiveau()`

### Wijziging E: SQL migratie (nieuw bestand)
Corrigeer bestaande professionals op basis van `bendy_function_type` kolom (die al `,adl` bevat). Na de code-deploy + volgende sync worden alle waarden dynamisch gedecodeerd.

---

## Technische details

### Nieuw API endpoint
```
/api/v2/selection_lists
```
Opgehaald via bestaande `fetchAllBendyRecords()` -- geen nieuwe helper nodig.

### SelectionListMap opbouw
```typescript
const { records: selectionLists } = await fetchAllBendyRecords(tenant, '/api/v2/selection_lists');
const selectionListMap = new Map<string, string>();
for (const item of selectionLists) {
  const code = (item.attributes?.key || '').trim();
  const name = (item.attributes?.name || item.attributes?.value || '').trim();
  if (code && name) selectionListMap.set(code, name);
}
```

### Decodering patroon (UPDATE + INSERT)
```typescript
const rawFunctionType = attrs.function_type || null;
const rawLevel = attrs.level || null;
const decodedFunctionType = rawFunctionType 
  ? (selectionListMap.get(rawFunctionType.replace(/^,/, '')) || rawFunctionType) 
  : null;
const decodedLevel = rawLevel 
  ? (selectionListMap.get(rawLevel.replace(/^,/, '')) || rawLevel) 
  : null;
const functieNiveau = deriveFunctieNiveau(userGroupNames, decodedFunctionType, decodedLevel);
updateData.functie_niveau = functieNiveau; // altijd bijwerken
```

### Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (wijzigingen A-D)
- **Nieuw:** SQL migratie voor bestaande data correctie

### Risico's
- Als `/api/v2/selection_lists` niet bestaat of leeg is, vallen gecodeerde waarden terug op de regex-match (die `,adl` niet zal herkennen), waardoor het netto effect "Helpende" blijft -- geen verslechtering
- De `adl` regex fallback in deriveFunctieNiveau vangt ook niet-gedecodeerde waarden op als vangnet
