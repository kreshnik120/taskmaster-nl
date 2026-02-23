
# COMPLETE FIX: Diploma regex + HBO/WO niveaus + Badge bug

## Samenvatting
14 diploma-varianten worden fout geclassificeerd, HBO/WO ontbreken als niveaus, en de badge telt verlopen documenten niet correct. Deze fix lost alle drie de problemen op.

## Wijzigingen

### A. nv4 regex uitbreiden (bendy-sync, regel 461)
Huidige regex mist `dienstverlener 4`, `SCW 4`, `Mbo 4`, `niveau 4`. Wordt uitgebreid:
```
/sociaal.*werker\s*4|spw\s*4|pedagogisch.*4|dienstverlener.*4|scw\s*4|mbo\s*4\s|niveau\s*4/i
```

### B. HBO en WO toevoegen aan ranking (bendy-sync, regels 456-457)
WO (rank 8) en generiek HBO (rank 7) worden toegevoegd boven de bestaande HBO-V regel:
- `WO` rank 8 (hoogste)
- `HBO-V` rank 7 (ongewijzigd)
- `HBO` / `bachelor` / `associate degree` rank 7 (nieuw, zelfde rang als HBO-V)
- Verpleegkundige MBO rank 6 (ongewijzigd)

### C. Diplomafilter uitbreiden (bendy-sync, regels 431-443)
`bachelor`, `associate`, `wo `, `propedeuse` toevoegen aan de filter zodat deze documenten worden meegenomen in de diploma-analyse.

### D. FUNCTIE_NIVEAU_MAP uitbreiden (functieNiveau.ts)
Toevoegen: `'HBO': 6` en `'WO': 7` zodat de frontend deze niveaus correct weergeeft als "HBO (nv6)" en "WO (nv7)".

### E. Badge bug fixen (bendy-sync, regels 1455-1469)
`documents_count` en `documents_expiring_count` worden berekend uit de DATABASE query (die ook `expires_at` ophaalt) in plaats van uit de Bendy API response. Verlopen + binnenkort verlopen (90 dagen) worden beide geteld.

### F. SQL migratie: bestaande foutieve niveaus corrigeren
Drie UPDATE statements:
1. Begeleider met nv4-diploma -> Persoonlijk begeleider
2. Helpende/Begeleider met HBO-diploma -> HBO
3. Professionals met WO-diploma -> WO

## Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (wijzigingen A, B, C, E)
- **Gewijzigd:** `src/lib/functieNiveau.ts` (wijziging D)
- **Nieuw:** SQL migratie (wijziging F)

## Technische details

### Edge function wijzigingen (bendy-sync/index.ts)

**Regel 431-443 (filter):** Toevoegen aan return-conditie:
```
name.includes('bachelor') || name.includes('associate') || 
name.includes('wo ') || name.includes('propedeuse')
```

**Regels 456-463 (ranking):** Nieuwe volgorde:
```typescript
if (/wo\s|^wo$/i.test(name)) { rank = 8; niveau = 'WO'; }
else if (/hbo.?v|hbo\s*verpleeg|nursing/i.test(name)) { rank = 7; niveau = 'HBO-V'; }
else if (/hbo|bachelor|associate\s*degree/i.test(name)) { rank = 7; niveau = 'HBO'; }
else if (/verpleegkunde|verpleegkundige/i.test(name)) { rank = 6; niveau = 'Verpleegkundige (MBO)'; }
else if (/ggz/i.test(name)) { rank = 5; niveau = 'GGZ-agoog'; }
else if (/persoonlijk\s*begeleider|evc.*begeleider/i.test(name)) { rank = 4; niveau = 'Persoonlijk begeleider'; }
else if (/verzorgend.*ig|vig/i.test(name)) { rank = 3; niveau = 'VIG'; }
else if (/sociaal.*werker\s*4|spw\s*4|pedagogisch.*4|dienstverlener.*4|scw\s*4|mbo\s*4\s|niveau\s*4/i.test(name)) { rank = 4; niveau = 'Persoonlijk begeleider'; }
else if (/begeleider|sociaal.*werker|spw|maatschappelijke.*zorg|pedagogisch|sociaal.maatschappelijk|sociaal.cultureel/i.test(name)) { rank = 2; niveau = 'Begeleider'; }
else if (/helpende/i.test(name)) { rank = 1; niveau = 'Helpende'; }
```

**Regels 1455-1469 (badge fix):** `select` krijgt `expires_at` erbij, en counts worden uit DB berekend:
```typescript
const { data: proDocs } = await adminClient
  .from('professional_documents')
  .select('document_name, document_type, expires_at')
  .eq('professional_id', pro.id);
const diplomaNiveau = deriveFunctieNiveauFromDiplomas(proDocs || []);
const now = new Date();
const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
const dbDocCount = proDocs?.length || 0;
const dbExpiringCount = (proDocs || []).filter(d =>
  d.expires_at && new Date(d.expires_at) <= ninetyDaysFromNow
).length;
const metaData: Record<string, any> = {
  documents_synced_at: new Date().toISOString(),
  documents_count: dbDocCount,
  documents_expiring_count: dbExpiringCount,
};
```

### Frontend (functieNiveau.ts)
```typescript
const FUNCTIE_NIVEAU_MAP: Record<string, number> = {
  'Helpende': 2, 'Helpende 2': 2,
  'VIG': 3, 'Begeleider': 3,
  'Persoonlijk begeleider': 4, 'Verpleegkundige MBO': 4, 'Verpleegkundige (MBO)': 4,
  'VP3': 3, 'VP4': 4,
  'GGZ-agoog': 6, 'HBO-V': 6, 'HBO': 6,
  'WO': 7,
};
```

### SQL migratie
```sql
-- Fix 1: nv4 diploma's foutief als Begeleider
UPDATE professionals p
SET functie_niveau = 'Persoonlijk begeleider', updated_at = NOW()
FROM professional_documents pd
WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL
  AND p.functie_niveau = 'Begeleider'
  AND LOWER(pd.document_name) ~ 'dienstverlener.*4|mbo\s*4\s|niveau\s*4|scw\s*4|gespecialiseerd.*pedagogisch.*4';

-- Fix 2: HBO diploma's foutief als Helpende/Begeleider
UPDATE professionals p
SET functie_niveau = 'HBO', updated_at = NOW()
FROM professional_documents pd
WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL
  AND p.functie_niveau IN ('Helpende', 'Begeleider')
  AND LOWER(pd.document_name) ~ 'hbo|bachelor|associate.*degree';

-- Fix 3: WO diploma's
UPDATE professionals p
SET functie_niveau = 'WO', updated_at = NOW()
FROM professional_documents pd
WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL
  AND LOWER(pd.document_name) ~ '^wo\s|^wo$';
```

## Verwacht resultaat
- "Mbo Sociaal-maatschappelijk dienstverlener 4" -> Persoonlijk begeleider (nv4)
- "HBO Bachelor Social Work" -> HBO (nv6)
- WO diploma -> WO (nv7)
- Badge toont correct aantal verlopen + binnenkort verlopen documenten
- Bestaande foutieve niveaus worden gecorrigeerd via SQL migratie
