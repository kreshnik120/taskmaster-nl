

# Facturatie UI Implementatie - Uitvoeringsplan

## Status
Het plan is gereed en goedgekeurd. **Klik op "Approve"** om mij naar de uitvoeringsmodus te schakelen, zodat ik de volgende wijzigingen kan doorvoeren.

---

## Uit te voeren wijzigingen

### Bestand 1: `src/App.tsx`
**Actie:** EDIT - Import toevoegen + route toevoegen

```typescript
// Regel 28 - Import toevoegen:
import Facturatie from "./pages/Facturatie";

// Regel 104 - Route toevoegen (na /notulen):
<Route path="/facturatie" element={<Facturatie />} />
```

### Bestand 2: `src/components/AppSidebar.tsx`
**Actie:** EDIT - Receipt icon + menu item

```typescript
// Regel 1 - Receipt toevoegen aan imports:
import { ..., Receipt } from "lucide-react";

// Regel 80 - Menu item toevoegen in Recruitment groep (na Plaatsingen):
{
  title: "Facturatie",
  url: "/facturatie",
  icon: Receipt,
  requiresEdit: true
}
```

### Bestand 3: `src/pages/Facturatie.tsx`
**Actie:** CREATE - Complete pagina (450+ regels)

Bevat:
- PageHero met titel en "Nieuwe factuur" button
- 4 KPI cards (Openstaand, Vervallen, Betaald, Omzet)
- Filter sectie (zoekbalk, status dropdown, type dropdown)
- Facturen tabel met alle kolommen
- Paginatie component
- Empty state en error handling
- Keyboard shortcuts (Cmd+K, /)

---

## Klik "Approve" om te starten

Na goedkeuring voer ik alle 3 bestandswijzigingen in één keer uit.

