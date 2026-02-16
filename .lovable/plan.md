

# BENDY-FIX-5: Migratie Forceren + Data Verificatie

## Probleem
De DO $$ blokken uit BENDY-FIX-3 en BENDY-FIX-4 zijn niet uitgevoerd op de live database. Dr. Kuyperstraat bestaat nog als aparte organisatie en Siza mist mogelijk haar KvK-nummer.

## Oplossing
Een nieuwe idempotente SQL migratie die alle data fixes opnieuw uitvoert.

## Wijziging -- Nieuw SQL migratiebestand in `supabase/migrations/`

**Deel A**: Dr. Kuyperstraat samenvoegen met Stichting Prisma
- Zoek Dr. Kuyperstraat op `kvk_nummer = '41100695' AND LOWER(name) LIKE '%kuyper%'`
- Zoek Prisma op `LOWER(name) LIKE '%prisma%' AND id != dr_kuyper_id`
- IF-guard: alleen als beide gevonden
- KvK overschrijven op Prisma, sublocaties verplaatsen, bendy_id_mapping updaten, Dr. Kuyperstraat verwijderen

**Deel B**: KvK-nummer voor Stichting Siza
- Zoek Siza zonder KvK, vul `09103844` in

**Deel C**: Kolommen idempotent toevoegen
- `ALTER TABLE IF NOT EXISTS` voor email en contactpersoon_naam (vangnet)

## Geen andere bestanden
Alleen het nieuwe migratiebestand wordt aangemaakt.

