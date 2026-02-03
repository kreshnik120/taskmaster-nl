

# UX Fix: Instellingen Knop op Facturatie Pagina

## Overzicht

Toevoegen van een "Instellingen" knop aan de Facturatie pagina header, naast de bestaande "Nieuwe factuur" knop.

---

## Wijzigingen

### Bestand: `src/pages/Facturatie.tsx`

#### 1. Icon Import Toevoegen (regel 31-43)

Toevoegen van `Settings` aan de lucide-react imports:

```typescript
import {
  Search,
  Plus,
  X,
  Receipt,
  Euro,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,  // <- TOEVOEGEN
} from "lucide-react";
```

#### 2. PageHero Children Uitbreiden (regel 239-244)

Huidige code:
```tsx
<PageHero title="Facturatie" subtitle="Beheer facturen, betalingen en herinneringen">
  <Button onClick={() => navigate("/facturatie/nieuw")}>
    <Plus className="mr-2 h-4 w-4" />
    Nieuwe factuur
  </Button>
</PageHero>
```

Nieuwe code:
```tsx
<PageHero title="Facturatie" subtitle="Beheer facturen, betalingen en herinneringen">
  <div className="flex items-center gap-2">
    <Button
      variant="outline"
      onClick={() => navigate("/facturatie/instellingen")}
    >
      <Settings className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">Instellingen</span>
    </Button>
    <Button onClick={() => navigate("/facturatie/nieuw")}>
      <Plus className="mr-2 h-4 w-4" />
      Nieuwe factuur
    </Button>
  </div>
</PageHero>
```

---

## Design Details

| Aspect | Waarde |
|--------|--------|
| Locatie | Links van "Nieuwe Factuur" knop |
| Icon | `Settings` van lucide-react |
| Button variant | `outline` (secundaire actie) |
| Desktop | Icon + tekst "Instellingen" |
| Mobile | Alleen icon (tekst verborgen met `hidden sm:inline`) |
| Navigatie | `/facturatie/instellingen` |

---

## Visueel Resultaat

**Desktop:**
```
+------------------------------------------------------------------+
| Facturatie                    [⚙ Instellingen] [+ Nieuwe Factuur] |
+------------------------------------------------------------------+
```

**Mobile:**
```
+--------------------------------+
| Facturatie         [⚙] [+]    |
+--------------------------------+
```

---

## Impactanalyse

- Minimale wijziging: 2 locaties in 1 bestand
- Geen nieuwe dependencies
- Volgt bestaand UI pattern met outline variant voor secundaire acties
- Responsive design met hidden tekst op mobile

