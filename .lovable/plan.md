
# FINALE FIX: Regex varianten + SQL correctie voor NULL professionals

## Samenvatting
Twee regex-varianten worden niet herkend ("Social" zonder dubbel-a, "SCW)" met haakje), en 20+ professionals met diploma-documenten hebben nog steeds `functie_niveau = NULL` omdat de vorige SQL migratie alleen records met een bestaand niveau corrigeerde.

## Wijzigingen

### A. Regex varianten fixen in `supabase/functions/bendy-sync/index.ts`

**A1 - nv4 regel (regel 465):**
- `sociaal` wordt `socia(al|l)?` (vangt "Social" en "Sociaal")
- `scw` wordt `scw\)?` (vangt "SCW) 4" met sluithaakje)

**A2 - Generieke begeleider regel (regel 466):**
- Zelfde `socia(al|l)?` fix voor alle sociaal-varianten

**A3 - Diplomafilter (regels 440-443):**
- Toevoegen: `name.includes('social')` om "Social Work" e.d. mee te nemen

### B. SQL migratie: 8-staps correctie voor NULL professionals

Draait in prioriteitsvolgorde (hoogste niveau eerst):
1. HBO diploma -> HBO
2. WO diploma -> WO
3. nv4 diploma -> Persoonlijk begeleider
4. Verpleegkundige diploma -> Verpleegkundige (MBO)
5. VIG diploma -> VIG
6. Begeleider diploma (zonder "4") -> Begeleider
7. Helpende diploma -> Helpende
8. SCW 4 die nog als Begeleider staat -> Persoonlijk begeleider

### C. Edge function deployen

Na de regex-wijzigingen wordt `bendy-sync` opnieuw gedeployed.

## Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (3 regelwijzigingen)
- **Nieuw:** SQL migratie (8 UPDATE statements)

## Technische details

### Edge function regels

**Regel 440-443 (filter) - toevoegen `social`:**
```
name.includes('sociaal werker') || name.includes('social') || name.includes('spw') ||
```

**Regel 465 (nv4 regex):**
```typescript
else if (/socia(al|l)?.*werker\s*4|spw\s*4|pedagogisch.*4|dienstverlener.*4|scw\)?\s*4|mbo\s*4\s|niveau\s*4/i.test(name)) { rank = 4; niveau = 'Persoonlijk begeleider'; }
```

**Regel 466 (begeleider regex):**
```typescript
else if (/begeleider|socia(al|l)?.*werker|spw|maatschappelijke.*zorg|pedagogisch|socia(al|l)?.maatschappelijk|socia(al|l)?.cultureel/i.test(name)) { rank = 2; niveau = 'Begeleider'; }
```

### SQL migratie (8 stappen)
```sql
-- Stap 1: HBO
UPDATE professionals p SET functie_niveau = 'HBO', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ 'hbo|bachelor|associate.*degree');

-- Stap 2: WO
UPDATE professionals p SET functie_niveau = 'WO', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ '^wo\s|^wo$');

-- Stap 3: nv4 (Persoonlijk begeleider)
UPDATE professionals p SET functie_niveau = 'Persoonlijk begeleider', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ 'persoonlijk.*begeleider|socia.*werker.*4|spw.*4|pedagogisch.*4|dienstverlener.*4|scw.*4|mbo\s*4|niveau\s*4');

-- Stap 4: Verpleegkundige
UPDATE professionals p SET functie_niveau = 'Verpleegkundige (MBO)', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ 'verpleegkund');

-- Stap 5: VIG
UPDATE professionals p SET functie_niveau = 'VIG', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ 'verzorgend.*ig|^vig');

-- Stap 6: Begeleider (zonder nummer 4)
UPDATE professionals p SET functie_niveau = 'Begeleider', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ 'begeleider|socia.*werker|spw|maatschappelijke.*zorg|pedagogisch')
  AND NOT (LOWER(pd.document_name) ~ 'persoonlijk|4$|\s4\s|\s4$');

-- Stap 7: Helpende
UPDATE professionals p SET functie_niveau = 'Helpende', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau IS NULL
  AND (LOWER(pd.document_name) ~ 'helpende');

-- Stap 8: Fix SCW 4 nog als Begeleider
UPDATE professionals p SET functie_niveau = 'Persoonlijk begeleider', updated_at = NOW()
FROM professional_documents pd WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL AND p.functie_niveau = 'Begeleider'
  AND (LOWER(pd.document_name) ~ 'scw.*4|cultureel.*werker.*4');
```

## Verwacht resultaat
- 0 professionals met diploma-documenten maar NULL functie_niveau
- "Mbo Sociaal Cultureel Werker (SCW) 4" correct als Persoonlijk begeleider (nv4)
- "Social Work" varianten correct herkend
- Toekomstige syncs herkennen alle varianten automatisch
