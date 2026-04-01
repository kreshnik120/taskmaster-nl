

# FIX: Deduplicatie openRecords vs assignedRecords

## Root Cause

De Bendy `/api/v2/requisitions/open` endpoint retourneert **zowel open ALS closed** records:
- `bendy_status_verdeling: { "open": 8220, "closed": 8437 }` → totaal 16.657 records

Het probleem zit in regel 98:
```typescript
const allRecords = [...openRecords, ...assignedRecords];
```

Wanneer een dienst op **BEIDE** endpoints voorkomt (open + assigned), wordt deze twee keer verwerkt:

1. **Eerste pass** (open, source='open'): bendy status='open' → `mapStatus` = `'open'` → queue update van `volledig_bezet` → `open` (**DOWNGRADE**)
2. **Tweede pass** (assigned, source='assigned'): `existingDienst.status` is nog steeds de **DB-snapshot** (`volledig_bezet`), newStatus='volledig_bezet' → zelfde → **SKIP**

Resultaat: alleen de downgrade wordt uitgevoerd. **36 diensten worden onterecht van `volledig_bezet` naar `open` gezet.**

## Oplossing

**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`

Na regel 97 (na het taggen en filteren), voeg deduplicatie toe: als een `bendy_id` in zowel `openRecords` als `assignedRecords` zit, gebruik alleen de assigned versie (die is autoritatief).

```typescript
// ═══ DEDUP: assigned is leidend bij overlap ═══
const assignedIds = new Set(assignedRecords.map((r: any) => String(r.id)));
openRecords = openRecords.filter((r: any) => !assignedIds.has(String(r.id)));
```

Dit plaatsen we **vóór** `const allRecords = [...openRecords, ...assignedRecords]` (regel 98).

## Verwacht resultaat
- ~36 records die op beide endpoints staan worden niet meer als 'open' verwerkt
- Alleen de assigned versie wordt gebruikt → status `volledig_bezet`
- De 6 echt open diensten (alleen op open endpoint) blijven correct
- Het uren-verschil van ~130 uur wordt grotendeels opgelost
- Het verschil 187 vs 194 ingeplande diensten wordt kleiner

## Geen andere wijzigingen nodig
- Database schema: ongewijzigd
- Frontend: ongewijzigd
- Stale-detectie (Stap 6): blijft werken, nu met correctere `seenBendyIds`
- Status-consistentie (Stap 5G): nog steeds actief als vangnet

