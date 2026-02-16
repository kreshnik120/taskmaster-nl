
# KL-2: Klanten Pagina Bendy Sync Indicator

## Overzicht
Maakt Bendy sync status zichtbaar op de Klanten pagina door `bendy_id` toe te voegen aan de TypeScript interfaces en een teal-kleurige badge + HoverCard info te tonen op organisatiekaarten.

## Wijziging 1 -- `src/pages/Klanten.tsx` (interfaces)

### Sublocation interface (regel 32-43)
Voeg `bendy_id?: string | null` toe aan het einde van de interface.

### Organization interface (regel 54-64)
Voeg `bendy_id?: string | null` toe aan het einde van de interface.

Geen query-wijzigingen nodig -- SELECT * haalt bendy_id al op.

## Wijziging 2 -- `src/components/organization/OrganizationCardSimple.tsx`

### 2a. Interfaces (regels 20-40)
Voeg `bendy_id?: string | null` toe aan zowel Sublocation (regel 20-28) als Organization (regel 30-40) interfaces.

### 2b. Import (regel 8)
Voeg `Link2` toe aan de lucide-react import.

### 2c. Bendy telling (na regel 61)
Voeg twee variabelen toe na de sublocationCount berekening:
- `bendySyncedCount`: telt sublocaties met een bendy_id via reduce + filter
- `isBendySynced`: boolean (bendySyncedCount > 0)

### 2d. Badge in card (na regel 228, voor regel 229)
Voeg een teal-kleurige badge toe met Link2 icoon, alleen zichtbaar als isBendySynced:
- Border: teal-300 (light) / teal-700 (dark)
- Text: teal-600 (light) / teal-400 (dark)
- Tooltip: "Bendy gekoppeld" + "X van Y werklocaties gesynchroniseerd"
- Positie: tussen sublocation count badge en data completeness indicator

### 2e. HoverCard uitbreiden (na regel 353, voor regel 354)
Voeg onder de structuur-info een teal-kleurige regel toe:
- Link2 icoon + "{X}/{Y} via Bendy sync"
- Alleen zichtbaar als isBendySynced === true
