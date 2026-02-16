
# BENDY-FIX-10: Check Constraint Fix voor Professional Insert

## Probleem
De edge function crasht niet — hij draait correct maar alle 100 inserts falen met:
`"violates check constraint \"professionals_functie_niveau_check\""`

De `deriveFunctieNiveau()` helper retourneert `'Onbekend'` als fallback, maar de database accepteert alleen deze waarden:
`VIG, HBO-V, Verpleegkundige MBO, Verpleegkundige (MBO), Helpende, Helpende 2, Begeleider, Persoonlijk begeleider, GGZ-agoog, VP3, VP4`

## Oplossing
Twee wijzigingen in `supabase/functions/bendy-sync/index.ts`:

### Wijziging 1: `deriveFunctieNiveau` uitbreiden
De fallback `'Onbekend'` wijzigen naar `'Helpende'` (veilige default) en meer Bendy groepnamen herkennen:

```text
Huidige mapping:
  /Begeleider|BGL/i -> 'Begeleider'
  /Helpende/i       -> 'Helpende'
  default           -> 'Onbekend'  <-- FOUT

Nieuwe mapping:
  /Begeleider|BGL|PB/i              -> 'Begeleider'
  /Persoonlijk begeleider/i         -> 'Persoonlijk begeleider'
  /Verpleegkundige|VP|HBO-V/i      -> 'Verpleegkundige (MBO)'
  /VIG/i                            -> 'VIG'
  /GGZ/i                            -> 'GGZ-agoog'
  /Helpende/i                       -> 'Helpende'
  default                           -> 'Helpende'  <-- veilige fallback
```

### Wijziging 2: Extra validatie voor status
De `status` CHECK constraint staat alleen toe: `actief, inactief, pauze, beschikbaar, beschikbaar_pending_documents`. De huidige code mapt al correct naar `actief`/`inactief`, dus dit is OK.

### Wijziging 3: Werkvorm validatie
De `werkvorm` CHECK constraint staat toe: `ZZP, Uitzendkracht, ABCito constructie, Detachering, Beide` (of NULL). De huidige `mapWerkvorm` retourneert alleen `ZZP`, `Uitzendkracht`, of `null` -- dit is OK.

## Samenvatting
Alleen de `deriveFunctieNiveau` functie aanpassen: meer groepnamen herkennen en fallback wijzigen van `'Onbekend'` naar `'Helpende'`. Geen andere wijzigingen nodig.

## Verificatie
1. `deriveFunctieNiveau` retourneert alleen waarden uit de CHECK constraint
2. Fallback is `'Helpende'` (geldig)
3. Professional sync verwerkt ~100 users zonder constraint violations
