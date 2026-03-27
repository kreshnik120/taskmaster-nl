

# DATA-FIX-6: Ontbrekende dienst_toewijzingen aanmaken voor 21 closed diensten

## Wat
INSERT 21 rijen in `dienst_toewijzingen` voor diensten die in Bendy als `closed` staan met een gekoppelde professional, maar waar de toewijzing ontbreekt in abcito.

## Waarom
De sync heeft deze 21 koppelingen gemist. De mapping flex_user_company → user → professional is 100% compleet (alle 21 matchen).

## Stap 1 — INSERT ontbrekende toewijzingen
Via database insert tool:

```sql
INSERT INTO dienst_toewijzingen (dienst_id, professional_id, status, positie_nr, toewijzing_notities)
SELECT
  d.id,
  p.id,
  'bevestigd',
  1,
  'DATA-FIX-6: handmatig aangemaakt op basis van Bendy flex_user_company'
FROM diensten d
JOIN bendy_raw_cache brc ON brc.bendy_id = d.bendy_id::text
JOIN bendy_raw_cache cu ON cu.entity_type = 'users'
  AND cu.raw_data->'relationships'->'company'->'data'->>'id' = brc.raw_data->'relationships'->'flex_user_company'->'data'->>'id'
JOIN professionals p ON p.bendy_id = cu.bendy_id
WHERE d.datum BETWEEN '2026-03-23' AND '2026-03-29'
  AND d.status != 'geannuleerd'
  AND brc.raw_data->'attributes'->>'status' = 'closed'
  AND NOT EXISTS (SELECT 1 FROM dienst_toewijzingen dt WHERE dt.dienst_id = d.id)
```

Verwacht: 21 rijen ingevoegd.

## Stap 2 — Verificatie
Read-only query: tel diensten zonder toewijzing voor deze week. Verwacht: 0 (behalve de 1 open dienst van vr 27).

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'open') as open,
  COUNT(*) FILTER (WHERE status IN ('volledig_bezet','voltooid')) as ingepland,
  COUNT(*) FILTER (WHERE status = 'geannuleerd') as geannuleerd
FROM diensten
WHERE datum BETWEEN '2026-03-23' AND '2026-03-29';
```

## Niet aanraken
- Geen schema-wijzigingen
- Geen code changes
- Alleen week 23-29 maart

