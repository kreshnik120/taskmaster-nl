

# Fix: "Helpende" default vervangen door "Niveau onbekend"

## Samenvatting
Professionals zonder bewijs (geen diploma, groep, function_type of level) krijgen nu foutief "Helpende (nv2)". Na deze fix tonen zij "Niveau onbekend", terwijl professionals met echt bewijs hun correcte niveau behouden.

## Wijzigingen

### A. Edge Function: `deriveFunctieNiveau()` retourneert `null` i.p.v. "Helpende"
**Bestand:** `supabase/functions/bendy-sync/index.ts`
- Return type wijzigt van `string` naar `string | null`
- Regel 424: `return 'Helpende'` wordt `return null`
- Alle aanroepers werken al correct met nullable waarden (professionals tabel accepteert NULL)

### B. Frontend utility: null-handling in `formatFunctieNiveau()`
**Bestand:** `src/lib/functieNiveau.ts`
- Parameter type wordt `string | null | undefined`
- Bij null/undefined: retourneert "Niveau onbekend"
- Bestaande logica voor bekende niveaus blijft ongewijzigd

### C. SQL migratie: bestaande onterechte "Helpende" naar NULL
Professionals met "Helpende" die GEEN diploma-bewijs hebben worden naar NULL gezet. Professionals met een echt helpende-diploma behouden "Helpende".

```sql
UPDATE professionals p
SET functie_niveau = NULL, updated_at = NOW()
WHERE p.deleted_at IS NULL
  AND p.functie_niveau = 'Helpende'
  AND NOT EXISTS (
    SELECT 1 FROM professional_documents pd
    WHERE pd.professional_id = p.id
      AND (
        LOWER(pd.document_name) ~ 'helpende|diploma|certificaat|vig|begeleider|verpleeg|hbo|ggz|nursing|sociaal.*werker|spw|pedagogisch|maatschappelijke.*zorg'
        OR LOWER(pd.document_type) ~ 'diploma|certificaat'
      )
  );
```

## Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (2 regels)
- **Gewijzigd:** `src/lib/functieNiveau.ts` (parameter type + null check)
- **Nieuw:** SQL migratie

## Verwacht resultaat
- Met diploma/groep/function_type: juiste niveau (bijv. "Persoonlijk begeleider (nv4)")
- Met function_type=ADL: "Helpende (nv2)" (correct bewijs)
- Met helpende-diploma: "Helpende (nv2)" (correct bewijs)
- Zonder enig bewijs: "Niveau onbekend"

