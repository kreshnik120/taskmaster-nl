

# Fix: Alle taken tonen in "Mijn Werk" bordweergave

## Probleem

`MAX_VISIBLE_TASKS = 5` in `MyTasksFlowSection.tsx` (regel 71) beperkt elke kolom tot 5 kaarten. Overige taken worden verborgen achter "+6 meer in team overzicht" die naar `/kanban` navigeert -- niet naar de volledige lijst van eigen taken.

## Oplossing

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

### Stap 1: Verhoog MAX_VISIBLE_TASKS

Verander `MAX_VISIBLE_TASKS` van `5` naar `50` (effectief ongelimiteerd voor dagelijks gebruik). Dit toont alle taken per kolom zonder afkapping.

### Stap 2: "Toon alles" toggle ipv overflow-link

Vervang de huidige overflow-knop (die naar `/kanban` navigeert) door een **inline expand/collapse**:
- Default: toon eerste 10 taken per kolom (verhoogd van 5)
- Als er meer zijn: toon "Toon alle X taken" knop die de rest inline ontklapt
- Geen navigatie meer naar een andere pagina

### Stap 3: Scroll verbetering

Voeg `max-h-[70vh] overflow-y-auto` toe aan de kolom-content zodat bij veel taken de kolom scrollbaar wordt zonder de pagina te breken.

### Technische details

- `MAX_VISIBLE_TASKS` wijzigen naar `50` (regel 71)
- State `expandedColumns` toevoegen om bij te houden welke kolommen volledig uitgevouwen zijn
- `getVisibleTasks` aanpassen: toon 10 default, alle bij expanded
- Overflow-knop tekst wijzigen naar "Toon alle {total} taken" en onClick toggle expanded state
- Kolom CardContent krijgt scroll-container styling

