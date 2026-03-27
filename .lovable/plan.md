

# SYNC-FIX-1: Drie kernproblemen in Bendy sync oplossen

## Overzicht
Drie wijzigingen in `supabase/functions/_shared/bendy-sync-requisitions.ts` en één kleine wijziging in `bendy-helpers.ts` om CPU timeouts, ontbrekende toewijzingen en spookdiensten structureel op te lossen.

---

## Fix A: CPU timeout — datumfiltering

**Bestand**: `bendy-sync-requisitions.ts` (regels 51-67) + `bendy-helpers.ts` (regels 159-190, 197-297)

**Aanpak**: Voeg `filter[start_date_from]` en `filter[start_date_to]` toe als extra params bij zowel `fetchDeltaBendyRecords` als `fetchAllBendyRecords` aanroepen.

- `start_date_from` = vandaag − 14 dagen
- `start_date_to` = vandaag + 56 dagen

Dit reduceert de dataset van ~61K naar een paar duizend records.

**Fallback**: Voeg ook een in-memory datumfilter toe in stap 3 (regel 129+): skip records met `attrs.date` buiten het venster. Dit vangt het geval op dat Bendy de filter-params negeert.

---

## Fix B: Ontbrekende toewijzingen — catch-up mechanisme

**Bestand**: `bendy-sync-requisitions.ts` (na stap 5D, rond regel 463)

**Probleem**: Stap 5 draait alleen voor records in `allRecords` (= wat deze sync-run ophaalde). Diensten die in een eerdere sync zijn aangemaakt maar sindsdien van open→closed zijn gegaan, worden gemist als de delta sync ze niet opnieuw ophaalt.

**Aanpak**: Voeg een **stap 5F** toe na de bestaande toewijzingen-insert:

1. Query alle `diensten` met status `volledig_bezet` zonder toewijzing, datum binnen het sync-venster
2. Voor elk: zoek in `bendy_raw_cache` het bijbehorende record, haal `flex_user_company` id op
3. Map via `fucMap` en `profMap` (al gebouwd in 5A/5B)
4. Insert met try/catch per record (overlap-bescherming)
5. Log resultaat: `STAP 5F: ${created} catch-up toewijzingen`

---

## Fix C: Spookdiensten — onderscheid open vs assigned endpoint

**Bestand**: `bendy-sync-requisitions.ts` (regels 69-84 en 180-184)

**Aanpak**: Tag records met hun bron-endpoint voordat ze worden samengevoegd:

```typescript
// Na fetch, vóór merge (regel ~69)
for (const r of openRecords) r._source = 'open';
for (const r of assignedRecords) r._source = 'assigned';
```

Pas `mapStatus` aan (regel 180-184):

```typescript
const mapStatus = (bendyStatus: string, source: string): string => {
  if (source === 'assigned') return 'volledig_bezet';
  if (bendyStatus === 'closed') return 'volledig_bezet';
  return 'open';
};
```

Gebruik `mapStatus(attrs.status, record._source)` bij zowel insert (regel 240) als update (regel 219).

Extra: bij updates, sta herstel toe van `geannuleerd` → `volledig_bezet` als record nu van assigned endpoint komt (spookdiensten die eerder geannuleerd werden maar inmiddels wel gevuld zijn).

---

## Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `bendy-sync-requisitions.ts` | Datumfilter params (A), source tagging + mapStatus (C), catch-up toewijzingen stap 5F (B) |

## Niet aanraken
- Database schema — geen wijzigingen
- `bendy-sync-users.ts` — werkt correct
- `cleanup-stale-jobs/index.ts` — niet gerelateerd
- `bendy-helpers.ts` — geen wijzigingen nodig (filter params gaan via extraParams)
- Bestaande diensten of toewijzingen

## Verificatie
Na deployment: handmatige incremental sync triggeren, daarna drie queries draaien om te checken: (1) sync slaagt binnen 60s, (2) nieuwe toewijzingen aangemaakt, (3) geen nieuwe spookdiensten.

