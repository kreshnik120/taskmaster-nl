

# FIX-DEDUP-1: Gevraagd Aantal Reset + Cleanup + FIX-UREN-1 Revert

## Scope (bevestigd via diagnostiek)

| Item | Aantal |
|------|--------|
| Diensten met gevraagd_aantal > 1 | 9 stuks (12 extra posities) |
| Overtollige toewijzingen te verwijderen | ~12 (elke dienst houdt 1 oudste) |
| Orphaned bendy_id_mapping records | 727 |

## Taak 1: Database fixes (3 SQL statements via insert tool)

**1a. Reset gevraagd_aantal → 1**
```sql
UPDATE diensten SET gevraagd_aantal = 1, updated_at = now()
WHERE gevraagd_aantal > 1 AND bron = 'geimporteerd';
```
→ 9 rijen

**1b. Verwijder overtollige toewijzingen**
Per dienst met >1 bevestigde toewijzing: behoud de oudste, verwijder de rest.
```sql
DELETE FROM dienst_toewijzingen
WHERE id IN (
  SELECT dt.id FROM dienst_toewijzingen dt
  JOIN diensten d ON d.id = dt.dienst_id
  WHERE d.bron = 'geimporteerd' AND d.bendy_id IS NOT NULL
    AND dt.status IN ('bevestigd', 'positief')
    AND dt.id != (
      SELECT dt2.id FROM dienst_toewijzingen dt2
      WHERE dt2.dienst_id = dt.dienst_id AND dt2.status IN ('bevestigd', 'positief')
      ORDER BY dt2.created_at ASC LIMIT 1
    )
    AND (SELECT COUNT(*) FROM dienst_toewijzingen dt3
         WHERE dt3.dienst_id = d.id AND dt3.status IN ('bevestigd', 'positief')) > 1
);
```
→ ~12 rijen

**1c. Cleanup orphaned mappings**
```sql
DELETE FROM bendy_id_mapping
WHERE entity_type = 'dienst'
  AND local_id NOT IN (SELECT id FROM diensten);
```
→ 727 rijen

## Taak 2: FIX-UREN-1 revert (2 bestanden)

Na de database fix zijn alle gevraagd_aantal = 1, dus de multiplier is overbodig en moet terug.

**`src/hooks/useDienstenPlanning.ts` regel 239:**
```
Was:  sum + (d.netto_uren || 0) * (d.gevraagd_aantal || 1)
Wordt: sum + (d.netto_uren || 0)
```

**`src/components/planning/PlanningWeekKalender.tsx` regel 103:**
```
Was:  s + (d.netto_uren || 0) * (d.gevraagd_aantal || 1)
Wordt: s + (d.netto_uren || 0)
```

## Taak 3: Verificatie queries

Na uitvoering worden de volgende checks gedraaid:
- Geen diensten meer met gevraagd_aantal > 1 (geïmporteerd)
- Geen orphaned mappings meer
- COUNT = SUM(gevraagd_aantal) voor week 23-29 maart

## Niet aanraken
- Sync code, bendy_raw_cache, netto_uren kolom, handmatige diensten

## Verwacht resultaat
Na volgende sync: de 12 ontbrekende Bendy IDs worden als nieuwe losse diensten aangemaakt → ~184 diensten, SUM(netto_uren) dichter bij Bendy's 1213.92.

