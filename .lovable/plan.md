

# 4 Critical Fixes: Regex, Rankings, Timeout, Frontend Limiet

## Bestand 1: `supabase/functions/bendy-sync/index.ts`

### Fix C1+C2: matchNiveauFromText regex (regels 404-412)
- HBO-V check EERST (wordt nu fout als "Verpleegkundige MBO" geclassificeerd)
- `\bPB\b` verplaatst naar Persoonlijk begeleider (was fout bij Begeleider)
- `\bVP\b` met word boundary
- HBO-V verwijderd uit Verpleegkundige-regex

### Fix C5: deriveFunctieNiveauFromDiplomas ranking swap (regels 489-490)
- VP-MBO: rank 6 wordt rank 5
- GGZ-agoog: rank 5 wordt rank 6
- Nu consistent met NIVEAU_RANK en CAO-zorg

### Fix C3: Bulk pre-fetch professional_documents (timeout-fix)
- Nieuw blok na regel 994: bulk query van professional_documents in batches van 500
- Resultaat opgeslagen in `proDocsMap` (Map)
- Regels 1122-1127: per-professional DB query vervangen door lookup uit proDocsMap
- Elimineert ~1000 individuele DB queries uit de sync loop

## Bestand 2: `src/pages/Professionals.tsx`

### Fix: 1000-rij limiet (regel 202)
- `.limit(5000)` toevoegen na `.order("full_name")`
- Toont alle 1.427+ professionals

## Deployment
- `bendy-sync` edge function wordt opnieuw gedeployed na de wijzigingen

## Verificatie
1. `matchNiveauFromText("HBO-V")` retourneert `'HBO-V'` (niet meer `'Verpleegkundige (MBO)'`)
2. `matchNiveauFromText("PB")` retourneert `'Persoonlijk begeleider'` (niet meer `'Begeleider'`)
3. `deriveFunctieNiveauFromDiplomas`: VP-MBO=5, GGZ=6 (consistent met NIVEAU_RANK)
4. Geen `await adminClient.from('professional_documents')` meer in de sync loop
5. Frontend toont alle 1.427+ professionals

