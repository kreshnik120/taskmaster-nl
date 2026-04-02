

# Plan: Hard Cap Verhogen + Bestaande Duplicaten Opschonen

## Probleem

Beide Bendy endpoints overschrijden de 10.000 record limiet (open: 10.080, assigned: 10.647). Dit veroorzaakt:
- Ontbrekende diensten (Week 14: 6 open + 9 ingepland missen)
- Stale-detectie permanent uitgeschakeld
- Data-integriteit niet te garanderen

## Stap 1: Hard cap verhogen naar 15.000

**Bestand**: `supabase/functions/_shared/bendy-helpers.ts`

Verhoog `MAX_TOTAL_RECORDS` van 10.000 naar 15.000. Dit geeft ruimte voor groei en garandeert dat alle huidige records (10.080 open, 10.647 assigned) volledig worden opgehaald. Stale-detectie kan dan weer veilig draaien.

## Stap 2: Bestaande duplicaten opschonen (Week 15)

Er zijn 5 slot-duplicaten waar een `open` en `volledig_bezet` dienst naast elkaar bestaan op dezelfde sublocation/datum/tijden. De dedup-logica in de sync voorkomt nieuwe duplicaten, maar bestaande moeten handmatig worden opgeruimd.

**Actie**: SQL migratie die voor elke slot-match waar `volledig_bezet` bestaat, de `open` variant op `geannuleerd` zet.

## Stap 3: Re-sync en verificatie

Na de fixes een nieuwe full sync triggeren en Week 14 vergelijken met Bendy-referentie (14 open, 196 ingepland, 1.388,75 uur).

## Technisch

| Bestand | Wijziging |
|---|---|
| `bendy-helpers.ts` | `MAX_TOTAL_RECORDS`: 10000 → 15000 |
| Database migratie | UPDATE 5 `open` duplicaten → `geannuleerd` |
| Edge function | Re-deploy na cap-verhoging |

