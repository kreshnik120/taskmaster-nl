

# Professionals Kaarten — Gebruiksvriendelijker voor Medewerkers

Na analyse van de screenshot en het huidige component, zijn dit de concrete verbeteringen:

## Bestand: `src/components/recruitment/ProfessionalCard.tsx`

### 1. Progress bar toevoegen voor documentstatus
De gekleurde balk op de screenshot is een goede indicator maar mist context. Vervang de losse badge door een compacte **progress bar met label** die in één oogopslag toont: "3 van 14 documenten verlopen". De bar krijgt statuskleur (groen = compleet, oranje = concept, rood = verlopen).

### 2. "Docs gesyncet" timestamp verwijderen
Dit is interne systeeminfo die medewerkers niet nodig hebben. Vervang door alleen de registratiedatum: `"Geregistreerd 2 dagen geleden"`. Sync-status hoort niet op de kaart.

### 3. Document-badge tekst verduidelijken
Huidige tekst "11 in concept" is onduidelijk voor medewerkers. Verduidelijk naar:
- Verlopen: `"3 documenten verlopen"` (volledige zin)
- Concept: `"11 documenten nog niet gepubliceerd"`
- Compleet: `"Alle documenten in orde"`
- Geen: `"Nog geen documenten"`

### 4. Visuele progress indicator
Voeg een dunne horizontale progress bar toe (h-1 rounded-full) onder de document-badge:
- Breedte = `published / total * 100%`
- Kleur volgt status: emerald (compleet), amber (concept), red (verlopen)
- Achtergrond: `bg-muted/30`

### 5. Actieknoppen duidelijker labelen
De icoon-only knoppen (telefoon, mail, locatie) zijn niet direct herkenbaar voor alle medewerkers. Voeg op hover een duidelijke tooltip toe (al aanwezig) maar maak de knoppen iets groter (`h-9` i.p.v. `h-8`) en voeg een subtiele label toe aan de "Plaatsen" knop.

### 6. Statusdot vergroten en labelen
De kleine statusdot (2.5px) op de avatar is moeilijk te zien. Vergroot naar `h-3 w-3` en voeg een ring toe met hogere contrast (`ring-3`).

Alle wijzigingen zijn puur visueel in `ProfessionalCard.tsx`.

