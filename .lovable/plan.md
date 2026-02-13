

# Enterprise UI Verfijning -- DienstDetailSheet

## Overzicht
Subtiele, naadloze verfijningen van het DienstDetailSheet panel om de gebruikservaring, overzichtelijkheid en visuele kwaliteit naar enterprise niveau te tillen. Geen grote redesign, maar doordachte micro-verbeteringen die aansluiten op het bestaande design system.

## Problemen (gebaseerd op screenshot)

1. **Header**: Titel en status badge staan los, geen visuele hiërarchie
2. **Actieknoppen**: Destructieve en neutrale acties staan op dezelfde rij zonder groepering
3. **Detail kolommen**: Geen visuele containers -- details "zweven" op de pagina
4. **Detail rijen**: Labels en waarden hebben dezelfde visuele gewicht
5. **Lege velden**: Waarden als "---" bieden geen context
6. **Sectie-overgangen**: Geen subtiele scheiders tussen secties (details -> toewijzingen -> AI)

## Oplossing -- 6 verfijningen

### Verfijning 1: Header met subtiele achtergrond en verbeterde hiërarchie
- Voeg een zachte gradient achtergrond toe aan de header (status-afhankelijk, lage saturatie)
- Toon de titel van de dienst (bijv. "Dagdienst 08:00-17:00") als subtitel onder organisatie/sublocation
- Status badge direct rechts van de titel in plaats van eronder

### Verfijning 2: Actieknoppen gegroepeerd met separator
- Groepeer primaire acties (Bevestigen, Bewerken, Kopieren) links
- Plaats destructieve acties (Sluiten, Verwijderen) rechts met een visuele separator ertussen
- Verwijder de losse "ghost" styling van Verwijderen en geef het een subtiele destructive-outline

### Verfijning 3: Detail secties in glass-cards
- Wrap "Dienst details" en "Opdrachtgever" elk in een subtiele rounded card met `bg-white/40 dark:bg-slate-900/40 border border-white/20`
- Voeg sectie-iconen toe naast de headers (CalendarDays voor details, Building2 voor opdrachtgever)
- Dit geeft visuele scheiding en maakt de 2-koloms layout duidelijker

### Verfijning 4: DetailRow component verbeteren
- Voeg een lichte dot-leader toe tussen label en waarde (subtiele dots ipv lege ruimte)
- Maak labels iets donkerder voor betere leesbaarheid
- Voeg subtiele hover highlight toe aan rijen

### Verfijning 5: Toewijzingen sectie header met bezettingsindicator
- Voeg een gekleurde cirkel-indicator toe naast "Toewijzingen & Reacties" die de bezettingsgraad visueel toont
- Toon "Nog geen toewijzingen" met een subtiel lege-state icoon (Users) in plaats van alleen tekst

### Verfijning 6: Verbeterde scroll en spacing
- Voeg `scroll-smooth` toe aan het sheet content
- Vergroot de spacing tussen secties van `space-y-6` naar `space-y-8` voor meer ademruimte
- Voeg een subtiele fade-out gradient toe aan de onderkant van het scrollbare gebied

## Technische Details

### Gewijzigd bestand
`src/components/planning/DienstDetailSheet.tsx`

### Wijzigingen per sectie

**DetailRow component (regel 26-33)**:
- Voeg `hover:bg-white/30 dark:hover:bg-white/5 rounded-md px-2 -mx-2 transition-colors` toe
- Labels krijgen `text-muted-foreground/80` voor iets meer contrast

**Header (regel 107-118)**:
- Achtergrond: status-afhankelijke zachte tint via conditionale klasse
- Subtitel toevoegen met diensttype + tijden
- Status badge inline met titel

**Action buttons (regel 122-142)**:
- Wrap in `flex justify-between` met twee groepen
- Separator via `border-l border-white/20 mx-1`

**Detail secties (regel 145-266)**:
- Beide kolommen in glass cards
- Sectie headers met iconen (CalendarDays, Building2)

**Toewijzingen leeg state (ToewijzingenBeheer referentie)**:
- Niet gewijzigd in dit bestand, maar de spacing wordt verbeterd

**Scroll/spacing**:
- Content div: `space-y-8` ipv `space-y-6`
- SheetContent: `scroll-smooth`

### Geen nieuwe dependencies
Alle gebruikte icons (CalendarDays, Building2) zijn al beschikbaar in lucide-react.

