

# Professional Aanmaken bij Geen Match + Groepen/Werkvorm Mapping

## Overzicht
De `syncUsers()` functie wordt uitgebreid zodat professionals worden **aangemaakt** (INSERT) wanneer er geen match is, in plaats van alleen als pending te registreren. Bendy groepen worden opgehaald om `functie_niveau` te bepalen. 1 bestand wordt gewijzigd.

## Wijziging 1 -- Nieuwe helpers na `buildFullName` (na regel 294)

Twee nieuwe functies:
- **`deriveFunctieNiveau(groupNames)`**: Zoekt in groepnamen naar "Begeleider/BGL" (voorrang) of "Helpende". Retourneert `'Onbekend'` als fallback.
- **`mapWerkvorm(professionalType)`**: Mapt Bendy `professional_type` naar lokale waarden: `'zzp'` wordt `'ZZP'`, `'loondienst'` wordt `'Uitzendkracht'`, anders `null`.

## Wijziging 2 -- Groepen ophalen in `syncUsers` (na regel 723)

Na `const professionals = ...` worden alle Bendy groepen opgehaald via `fetchAllBendyRecords(tenant, '/api/v2/groups')` en in een `Map<id, naam>` gezet voor snelle lookup.

## Wijziging 3 -- Email sync bij bestaande match (na regel 766)

Na de telefoon-sync wordt ook `email` gesynchroniseerd als deze afwijkt.

## Wijziging 4 -- Vervang pending-blok door INSERT (regels 793-813)

Het "GEEN MATCH -- registreer als pending" blok wordt vervangen door een INSERT in de `professionals` tabel met:
- `org_id`, `full_name`, `email`, `telefoonnummer`, `bendy_id`
- `functie_niveau` (afgeleid uit Bendy groepen via `deriveFunctieNiveau`)
- `werkvorm` (via `mapWerkvorm` uit `professional_type`)
- `status` (`'inactief'` als state="Inactief", anders `'actief'`)
- `geboortedatum`, `profile_photo_url` (indien beschikbaar)

Na succesvolle INSERT wordt `bendy_id_mapping` bijgewerkt met `sync_status: 'synced'` en het nieuwe `local_id`. Bij falen wordt `result.failed++` verhoogd.

## Technische details

```text
Groepen flow:
  fetchAllBendyRecords(tenant, '/api/v2/groups')
    -> Map<groupId, groupName>
    -> bendyUser.relationships.groups.data[].id
    -> groupMap lookup
    -> deriveFunctieNiveau(['Begeleider pool', ...])
    -> 'Begeleider'

Werkvorm flow:
  attrs.professional_type -> mapWerkvorm()
  'Loondienst' -> 'Uitzendkracht'
  'ZZP' -> 'ZZP'
  null/other -> null
```

## Geen andere bestanden
Alleen `supabase/functions/bendy-sync/index.ts`. Edge function wordt herdeployed.

