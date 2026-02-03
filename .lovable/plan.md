

# Diepere Apple visionOS Glassmorphism - Meer Kleur & Schaduw

## Onderzoeksresultaten

Na uitgebreide analyse van de huidige implementatie zie ik de volgende mogelijkheden voor verbetering:

### Huidige Staat
| Element | Status | Beoordeling |
|---------|--------|-------------|
| Ambient mesh (achtergrond glow) | Alle 8 pagina's | Goed - maar kan intenser |
| Glass cards per context | 7 kleuren gedefinieerd | Goed - maar niet overal toegepast |
| Floating shadows per kleur | 7 kleuren | Goed - maar weinig gebruikt op componenten |
| KPI cards met context kleur | Alleen `facturatie` variant | Kan uitgebreid naar alle contexten |
| Filter bars glassmorphism | Alleen Facturatie | Ontbreekt op andere pagina's |
| Table/list styling | Basis | Mist gekleurde hover states |
| Specular highlights | Beperkt | Kan verbeterd worden |

### Gevonden Verbetermogelijkheden

1. **KPI Cards gebruiken nu generieke kleuren** - niet de context-specifieke tint
2. **Filter/zoekbars** zijn standaard Cards - kunnen glassmorphism krijgen
3. **Tabel hover states** gebruiken de context kleur niet consistent
4. **Zwevende schaduw** wordt niet overal toegepast op interactieve elementen
5. **Light bleed effect** (Apple specular highlight) ontbreekt op veel cards
6. **Accent borders** (subtiele gekleurde rand aan bovenkant) ontbreken

---

## Verbeteringen Per Categorie

### 1. Gekleurde KPI Card Varianten

Nieuwe KPI varianten toevoegen die de context-specifieke kleuren gebruiken:

| Context | Variant Naam | Kleur HSL |
|---------|--------------|-----------|
| Sollicitaties | `rose` | 345, 48%, 52% |
| Professionals | `violet` | 270, 45%, 55% |
| Klanten | `slate` | 215, 25%, 48% |
| Plaatsingen | `teal` | 174, 42%, 43% |
| Tijdregistratie | `amber` | 38, 55%, 50% |
| WhatsApp | `blue` | 217, 91%, 60% |
| Mijn Werk | `indigo` | 234, 45%, 52% |

Elke variant krijgt:
- Gekleurde gradient achtergrond
- Gekleurde border-top accent
- Gekleurde zwevende schaduw
- Context-specifieke icon kleur

### 2. Enhanced Glass Filter Bars

Nieuwe CSS class `.glass-filter-bar-[color]` voor elke pagina:

```css
.glass-filter-bar-rose {
  background: linear-gradient(135deg, hsla(345, 48%, 99%, 0.85) 0%, hsla(345, 48%, 97%, 0.70) 100%);
  border: 1px solid hsla(345, 48%, 90%, 0.6);
  border-top: 3px solid hsla(345, 48%, 52%, 0.4);
  box-shadow: 0 4px 16px hsla(345, 48%, 52%, 0.08);
}
```

### 3. Specular Highlights (Lichtreflectie Banden)

Apple visionOS gebruikt een subtiele lichtband aan de bovenkant van elementen:

```css
.glass-specular::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, 
    rgba(255,255,255,0.25) 0%, 
    rgba(255,255,255,0.05) 50%,
    transparent 100%
  );
  pointer-events: none;
  border-radius: inherit;
}
```

### 4. Context-Gekleurde Table Hover States

Elke pagina krijgt tabel rows met context-specifieke hover:

```css
.table-row-hover-rose:hover {
  background: hsla(345, 48%, 97%, 0.6);
  box-shadow: inset 0 0 0 1px hsla(345, 48%, 85%, 0.5);
}
```

### 5. Accent Border Top Systeem

Subtiele gekleurde bovenkant rand voor visuele hiërarchie:

```css
.accent-border-rose {
  border-top: 3px solid hsla(345, 48%, 52%, 0.5);
}
```

---

## Implementatie Per Pagina

### Sollicitaties.tsx (Rose)
| Element | Huidige Class | Nieuwe Class |
|---------|---------------|--------------|
| KPI Cards | `variant="count"` etc. | `variant="rose"` |
| Filter Popover | Standaard Card | + `glass-filter-bar-rose` |
| Kanban columns | `border-t-4` | + `shadow-float-rose` |

### Professionals.tsx (Violet)
| Element | Huidige Class | Nieuwe Class |
|---------|---------------|--------------|
| KPI Cards | `variant="count"` etc. | `variant="violet"` |
| Filter section | Standaard | + `glass-card-violet glass-light-bleed` |
| Professional cards | Basis Card | + `shadow-float-violet-hover` |

### Klanten.tsx (Slate)
| Element | Huidige Class | Nieuwe Class |
|---------|---------------|--------------|
| KPI Cards | `variant="count"` etc. | `variant="slate"` |
| Search/filter bar | Standaard | + `glass-filter-bar-slate` |
| Organization cards | OrganizationCard | + `glass-card-slate` |

### Plaatsingen.tsx (Teal)
| Element | Huidige Class | Nieuwe Class |
|---------|---------------|--------------|
| KPI Cards | `variant="count"` etc. | `variant="teal"` |
| Filter section | Standaard Card | + `glass-card-teal` |
| Placement cards | Basis | + `shadow-float-teal-hover` |

### Tijdregistratie.tsx (Amber)
| Element | Huidige Class | Nieuwe Class |
|---------|---------------|--------------|
| Timer cards | Basis | + `glass-card-amber` |
| Time entries table | Standaard | + hover state amber |

### WhatsApp.tsx (Blue)
| Element | Huidige Class | Nieuwe Class |
|---------|---------------|--------------|
| Chat list panel | Standaard | + `glass-layer-1 glass-specular` |
| Message bubbles | Basis styling | + blue tinted glass |

---

## Nieuwe CSS Classes Toe Te Voegen

### A. KPI Card Variant Config (~60 regels)

```typescript
// In kpi-card.tsx - nieuwe varianten:
rose: {
  gradient: "from-tab-recruitment-50/80 to-white/60",
  borderColor: "border-t-tab-recruitment-400/60",
  textColor: "text-tab-recruitment-600",
  iconColor: "text-tab-recruitment-500",
  shadowColor: "shadow-float-rose",
}
// + violet, slate, teal, amber, blue, indigo
```

### B. Glass Filter Bars (~120 regels CSS)

```css
.glass-filter-bar-rose { ... }
.glass-filter-bar-violet { ... }
.glass-filter-bar-slate { ... }
.glass-filter-bar-teal { ... }
.glass-filter-bar-amber { ... }
.glass-filter-bar-blue { ... }
```

### C. Enhanced Light Bleed Per Kleur (~80 regels CSS)

```css
.glass-light-bleed-rose::before { ... }
.glass-light-bleed-violet::before { ... }
.glass-light-bleed-slate::before { ... }
/* etc. */
```

### D. Table Row Hover States (~70 regels CSS)

```css
.table-row-hover-rose:hover { ... }
.table-row-hover-violet:hover { ... }
/* etc. */
```

### E. Accent Border System (~40 regels CSS)

```css
.accent-border-rose { ... }
.accent-border-violet { ... }
/* etc. */
```

---

## Visueel Resultaat

### Per Pagina Kleuridentiteit:

```text
┌────────────────────────────────────────────────────────────────┐
│  SOLLICITATIES (Rose 345°)                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🌸 Rose KPI cards met rose schaduwen                    │  │
│  │  🌸 Filter bar met subtiele rose tint                    │  │
│  │  🌸 Kanban columns met rose border-top accent            │  │
│  │  🌸 Ambient mesh geeft warme rose achtergrond glow       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  PROFESSIONALS (Violet 270°)                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  💜 Violet KPI cards met purple floating shadows         │  │
│  │  💜 Professional cards krijgen violet hover glow          │  │
│  │  💜 Filter section met violet glass styling              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  FACTURATIE (Emerald 142°)                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  💚 Emerald glass cards (al geïmplementeerd)             │  │
│  │  💚 Floating green shadows op alle elementen             │  │
│  │  💚 Table rows met emerald hover                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Technische Details

### Bestanden die worden aangepast:

1. **`src/index.css`** (~350 regels toevoegen)
   - Glass filter bar classes per kleur
   - Enhanced light bleed per kleur
   - Table row hover states per kleur
   - Accent border utilities
   - Specular highlight class
   - Glass hover lift per kleur variant

2. **`src/components/ui/kpi-card.tsx`** (~100 regels wijzigen)
   - 7 nieuwe color-context varianten
   - Consistente shadow-float classes per variant
   - Glass light-bleed integratie

3. **`src/pages/Sollicitaties.tsx`**
   - KPI cards → `variant="rose"`
   - Filter popover → glass styling
   - Kanban columns → rose shadow hover

4. **`src/pages/Professionals.tsx`**
   - KPI cards → `variant="violet"`
   - Cards → `glass-card-violet`

5. **`src/pages/Klanten.tsx`**
   - KPI cards → `variant="slate"`
   - Organization cards → glass slate styling

6. **`src/pages/Plaatsingen.tsx`**
   - KPI cards → `variant="teal"`
   - Cards → `glass-card-teal`

7. **`src/pages/Tijdregistratie.tsx`**
   - Timer KPIs → `variant="amber"`
   - Table → amber hover states

8. **`src/pages/WhatsApp.tsx`**
   - Chat panels → `glass-layer-1 glass-specular`
   - Input area → blue glass styling

---

## Apple Glassmorphism Kenmerken Die Worden Toegepast

| Effect | Beschrijving | Implementatie |
|--------|--------------|---------------|
| **Layered Blur** | Meerdere blur-lagen voor diepte | `blur(20px) saturate(150%)` |
| **Colored Shadows** | Schaduwen nemen kleur aan van content | `hsla(hue, sat%, lig%, opacity)` |
| **Specular Highlights** | Lichtreflectie aan bovenkant | `::before` gradient overlay |
| **Frosted Glass** | Doorschijnend met kleur-tint | Gradient background + border |
| **Ambient Light Bleed** | Zachte glow langs randen | `::before` met mask-composite |
| **Floating Effect** | Elements lijken te zweven | Multi-layer colored box-shadow |
| **Accent Borders** | Subtiele gekleurde bovenkant | `border-top: 3px solid` |

---

## Performance Overwegingen

Alle nieuwe effecten volgen de bestaande mobile-first strategie:

```css
@media (max-width: 768px) {
  /* Reduceer blur naar 12px */
  /* Verklein shadows */
  /* Vereenvoudig gradients */
}
```

Geen nieuwe transforms (DnD-safe), alleen shadow-based elevation changes.

