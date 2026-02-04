

# Volledige Pagina-Kleur & Sidebar Styling Audit

## Huidige Status

### Pagina's MET PageContainer (11 ✅)
| Pagina | contextColor | Status |
|--------|--------------|--------|
| Sollicitaties | rose | ✅ Correct |
| Professionals | violet | ✅ Correct |
| Klanten | slate | ✅ Correct |
| Plaatsingen | teal | ✅ Correct |
| Facturatie | emerald | ✅ Correct |
| Tijdregistratie | amber | ✅ Correct |
| Gebruikers | violet | ✅ Correct |
| Bijlagen | indigo | ✅ Correct |
| Notulen | indigo | ✅ Correct |
| WhatsApp | blue | ✅ Correct |
| UnifiedDashboard | dynamisch | ✅ Correct (per tab) |

### Pagina's ZONDER PageContainer (8 ❌)
| Pagina | Probleem | Voorgestelde kleur |
|--------|----------|-------------------|
| Kanban.tsx | Geen PageContainer | indigo (werk/taken) |
| AiTraining.tsx | Geen PageContainer | violet (admin/AI) |
| AfgerondeTaken.tsx | Geen PageContainer | emerald (afgerond) |
| VerwijderdeTaken.tsx | Geen PageContainer | slate (archief) |
| SollicitatiesArchief.tsx | Geen PageContainer | rose (recruitment) |
| FactuurAanmaken.tsx | Geen PageContainer | emerald (facturatie) |
| FactuurDetail.tsx | Geen PageContainer | emerald (facturatie) |
| FacturatieInstellingen.tsx | Geen PageContainer | emerald (facturatie) |

---

## Implementatieplan

### Stap 1: Kanban.tsx

Voeg PageContainer toe aan de Kanban pagina:

```tsx
import { PageContainer } from "@/components/ui/page-container";

// In return statement, wrap alles in:
return (
  <PageContainer contextColor="indigo" className="space-y-6">
    {/* bestaande content */}
  </PageContainer>
);
```

### Stap 2: AiTraining.tsx

Voeg PageContainer toe met violet kleur (admin/AI context):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <>
    <ValidationOnboardingWizard />
    <PageContainer contextColor="violet" className="space-y-6">
      {/* bestaande content */}
    </PageContainer>
  </>
);
```

### Stap 3: AfgerondeTaken.tsx

Voeg PageContainer toe met emerald kleur (succes/afgerond):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <PageContainer contextColor="emerald" className="space-y-6">
    {/* bestaande content */}
  </PageContainer>
);
```

### Stap 4: VerwijderdeTaken.tsx

Voeg PageContainer toe met slate kleur (archief):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <PageContainer contextColor="slate" className="space-y-6">
    {/* bestaande content */}
  </PageContainer>
);
```

### Stap 5: SollicitatiesArchief.tsx

Voeg PageContainer toe met rose kleur (recruitment):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <PageContainer contextColor="rose" className="space-y-6">
    {/* bestaande content */}
  </PageContainer>
);
```

### Stap 6: FactuurAanmaken.tsx

Voeg PageContainer toe met emerald kleur (facturatie):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <PageContainer contextColor="emerald" className="container mx-auto py-6 max-w-3xl">
    {/* bestaande content */}
  </PageContainer>
);
```

### Stap 7: FactuurDetail.tsx

Voeg PageContainer toe met emerald kleur (facturatie):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <PageContainer contextColor="emerald" className="container mx-auto py-6">
    {/* bestaande content */}
  </PageContainer>
);
```

### Stap 8: FacturatieInstellingen.tsx

Voeg PageContainer toe met emerald kleur (facturatie):

```tsx
import { PageContainer } from "@/components/ui/page-container";

return (
  <PageContainer contextColor="emerald" className="container mx-auto py-6">
    {/* bestaande content */}
  </PageContainer>
);
```

---

## Sidebar Styling Verfijning

### Huidige Status
- ✅ Sidebar CSS variabelen correct gedefinieerd
- ✅ Sidebar heeft edge glow effect
- ✅ Achtergrond geforceerd met `!important`

### Voorgestelde Verbeteringen

1. **Enhanced Glass Effect voor Sidebar**

Voeg toe aan `src/index.css`:

```css
/* Enhanced Sidebar Glass - Enterprise niveau */
[data-sidebar="sidebar"] {
  background: rgba(255, 255, 255, 0.92) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.3) !important;
  box-shadow: 
    4px 0 24px -8px rgba(0, 0, 0, 0.08),
    inset -1px 0 0 rgba(255, 255, 255, 0.5) !important;
}

.dark [data-sidebar="sidebar"] {
  background: rgba(15, 23, 42, 0.92) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
  box-shadow:
    4px 0 24px -8px rgba(0, 0, 0, 0.3),
    inset -1px 0 0 rgba(255, 255, 255, 0.04) !important;
}
```

2. **Active Menu Item Glass Highlight**

Verbeter de actieve menu-item styling:

```css
/* Active sidebar item - enhanced */
.sidebar-menu-item-active {
  background: rgba(255, 255, 255, 0.6) !important;
  backdrop-filter: blur(8px);
  box-shadow: 
    0 2px 8px -2px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.dark .sidebar-menu-item-active {
  background: rgba(255, 255, 255, 0.08) !important;
  box-shadow:
    0 2px 8px -2px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

---

## Kleur-Mapping Overzicht (Compleet)

| Module | contextColor | HSL Hue | Reden |
|--------|--------------|---------|-------|
| Dashboard/Mijn Werk | indigo | 234° | Focus, werk |
| Kalender | teal | 174° | Planning, rust |
| Lijst | slate | 215° | Data, neutraal |
| Opvolging | amber | 38° | Urgentie, aandacht |
| Team | violet | 270° | Samenwerking |
| Recruitment/Sollicitaties | rose | 345° | Mensen, warmte |
| Professionals | violet | 270° | Team/mensen |
| Klanten | slate | 215° | Data, zakelijk |
| Plaatsingen | teal | 174° | Planning |
| Facturatie (alle) | emerald | 142° | Geld, groei |
| Tijdregistratie | amber | 38° | Tijd, urgentie |
| WhatsApp | blue | 217° | Communicatie |
| Bijlagen/Documenten | indigo | 234° | Werk, focus |
| Notulen | indigo | 234° | Vergaderingen |
| AI Training | violet | 270° | Admin, technisch |
| Afgeronde Taken | emerald | 142° | Succes |
| Verwijderde Taken | slate | 215° | Archief |
| Sollicitaties Archief | rose | 345° | Recruitment |

---

## Technische Details

### Bestanden te wijzigen:

| Bestand | Wijziging |
|---------|-----------|
| `src/pages/Kanban.tsx` | + PageContainer (indigo) |
| `src/pages/AiTraining.tsx` | + PageContainer (violet) |
| `src/pages/AfgerondeTaken.tsx` | + PageContainer (emerald) |
| `src/pages/VerwijderdeTaken.tsx` | + PageContainer (slate) |
| `src/pages/SollicitatiesArchief.tsx` | + PageContainer (rose) |
| `src/pages/FactuurAanmaken.tsx` | + PageContainer (emerald) |
| `src/pages/FactuurDetail.tsx` | + PageContainer (emerald) |
| `src/pages/FacturatieInstellingen.tsx` | + PageContainer (emerald) |
| `src/index.css` | Enhanced sidebar glass styling |

---

## Visueel Resultaat

Na implementatie:
- **Alle 19 pagina's** hebben unieke kleur-identiteit
- **Sidebar** heeft verbeterd glass effect met zachte edge glow
- **Consistente module-herkenbaarheid** door het hele platform
- **Enterprise-niveau visuele coherentie** vergelijkbaar met Apple visionOS

