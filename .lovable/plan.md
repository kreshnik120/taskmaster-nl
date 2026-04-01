

# FIX: Stale-detectie en status-reconciliatie voor Bendy-sync

## Probleem (samenvatting)
- 36 diensten staan als "open" in het systeem maar zijn in Bendy ingevuld of verwijderd
- 7 ingeplande diensten ontbreken (59 uur verschil)
- 1 dienst heeft een toewijzing maar status "open" (inconsistentie)
- Oorzaak: geen mechanisme om diensten te detecteren die uit de Bendy API verdwijnen

## Oplossing: 2-staps reconciliatie

### Stap 1: Stale-detectie na sync (in `sync-requisitions.ts`)

Na het verwerken van alle open + assigned records, voeg een reconciliatie-stap toe:

1. Verzamel alle bendy_ids die de sync heeft gezien (zowel open als assigned endpoint)
2. Vergelijk met alle "open" en "deels_bezet" diensten in de database (binnen het datumvenster)
3. Diensten die NIET in de API-response voorkomen → markeer als `geannuleerd` met opmerking "Niet meer in Bendy API"
4. Veiligheidsmaatregel: maximaal 50 diensten per run annuleren (voorkomt bulk-fout bij API-storing)

**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`
- Na de batch-updates (Stap 4), een nieuw blok "Stap 6: Stale-detectie"
- Bouw een `Set<string>` van alle verwerkte bendy_ids
- Query alle open/deels_bezet diensten in het datumvenster die een bendy_id hebben
- Filter diensten waarvan de bendy_id NIET in de set zit
- Update hun status naar `geannuleerd` via batch-update
- Log het aantal in de sync-result

### Stap 2: Status-consistentie check (in `sync-requisitions.ts`)

Na de catch-up toewijzingen (Stap 5F), voeg een consistentie-check toe:

- Query diensten met status "open" die WEL een actieve toewijzing hebben
- Update deze naar `volledig_bezet`

**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`
- Na Stap 5F, een nieuw blok voor status-consistentie
- Simpele UPDATE query: `status = 'volledig_bezet' WHERE status = 'open' AND EXISTS(toewijzing)`

### Geen wijzigingen aan
- Database schema
- Frontend
- pg_cron configuratie
- Andere sync-modules

## Verwacht resultaat
- Na volgende sync: 36 spook-open diensten worden geannuleerd of correct gemarkeerd
- De 1 inconsistente dienst (met toewijzing maar status open) wordt volledig_bezet
- Uren en aantallen komen overeen met Bendy (of zeer dicht erbij)

## Risico-mitigatie
- Maximum 50 stale-annuleringen per run (voorkomt cascade bij API-downtime)
- Alleen diensten binnen het datumvenster (-14 tot +56 dagen) worden gecontroleerd
- Logging van elke annulering in sync-result voor audittrail

