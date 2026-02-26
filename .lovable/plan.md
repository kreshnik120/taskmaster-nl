

# Fix: HoverCard toont niet alle kaartinformatie

## Probleem

De HoverCard mist informatie die wél op de kaart zelf staat:
- **Acceptatiestatus** ("Wacht op acceptatie") ontbreekt
- **Urgentie-indicator** (kleur-gecodeerde deadline) ontbreekt
- **Reporter** ("Toegewezen door ...") ontbreekt
- **Herhalingsindicator** ontbreekt
- **Tijd in kolom** ontbreekt

De beschrijving en titel worden wél volledig getoond (niet truncated), maar de context-informatie die de kaart visueel toont is afwezig in de hover.

## Oplossing

**Bestand:** `src/components/TaskCard.tsx` — HoverCardContent (regels 297-353)

Voeg de ontbrekende secties toe aan de HoverCard:

1. **Acceptatiestatus** — "Wacht op acceptatie" badge tonen wanneer `isPendingAcceptance(task)` true is
2. **Reporter** — "Toegewezen door ..." regel als reporter verschilt van assignee
3. **Urgentie-badge** — `UrgencyBadge` component hergebruiken voor kleur-gecodeerde deadline
4. **Herhaling** — Tekst "Herhaalt dagelijks/wekelijks/etc." tonen bij `recurrence_rule`
5. **Tijd in kolom** — "X dagen in deze kolom" toevoegen

Alle informatie die op de kaart zelf (truncated) staat, wordt in de hover volledig en leesbaar getoond.

