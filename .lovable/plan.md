

# Apple visionOS Glassmorphism voor Facturatie

## Overzicht

De Facturatie pagina krijgt een premium Apple visionOS-stijl met:
- **Glassmorphism cards** die lijken te zweven boven de achtergrond
- **Context-specifieke kleur**: Emerald (groen) - passend bij financiele/geld context
- **Gekleurde schaduwen** die het "zwevende" effect versterken
- **Subtiele backdrop blur** en licht-bleed effecten

---

## Gekozen Contextkleur: Emerald

Voor Facturatie gebruiken we **Emerald** (geld/financien):
- HSL: `142, 55%, 52%` (gebaseerd op bestaande success/emerald kleuren in het systeem)
- Past bij de financiele context (groen = geld, groei, succes)
- Volgt het bestaande patroon van andere tab-contexten

---

## Wijzigingen

### 1. CSS Variabelen en Klassen (`src/index.css`)

Nieuwe CSS variabelen toevoegen voor de Facturatie context:

```css
/* Facturatie - Emerald (Finance, Money) */
--tab-facturatie-50: 142 55% 97%;
--tab-facturatie-100: 142 55% 93%;
--tab-facturatie-200: 142 55% 85%;
--tab-facturatie-300: 142 55% 73%;
--tab-facturatie-400: 142 55% 58%;
--tab-facturatie-500: 142 55% 45%;
--tab-facturatie-600: 142 55% 38%;
--tab-facturatie-700: 142 55% 32%;
--tab-facturatie-800: 142 55% 26%;
--tab-facturatie-900: 142 55% 20%;
```

Nieuwe glassmorphism classes:

```css
/* Emerald-tinted glass for Facturatie */
.glass-card-emerald { ... }
.shadow-float-emerald { ... }
.shadow-float-emerald-hover { ... }
.glass-ambient-mesh-emerald::before { ... }
```

### 2. Facturatie Pagina (`src/pages/Facturatie.tsx`)

Pas de volgende elementen aan:

| Element | Huidige State | Nieuwe State |
|---------|---------------|--------------|
| Wrapper div | `space-y-6 p-6` | + `glass-ambient-mesh-emerald` |
| KPI Cards container | Standaard grid | + `glass-layer-1` met emerald shadow |
| Filter Card | Basis Card | + `glass-card-emerald glass-light-bleed` |
| Tabel Card | Basis Card | + `glass-card-emerald shadow-float-emerald` |
| Tabel rows | `hover:bg-muted/50` | + `hover:shadow-float-emerald-hover` |

### 3. KPI Cards Update (`src/components/ui/kpi-card.tsx`)

Voeg een `facturatie` variant toe die de emerald-tint gebruikt met glassmorphism.

---

## Visuele Effecten

### Zwevend Effect (Floating)
- **Meerlaagse gekleurde schaduwen**: Combinatie van zachte zwarte schaduw + emerald-getinte schaduw
- **Subtle elevation op hover**: Shadow intensiteit neemt toe zonder transform (DnD-safe)

### Glassmorphism
- **Background**: `rgba(255, 255, 255, 0.72)` + gradient met emerald tint
- **Backdrop blur**: `blur(20px) saturate(150%)`
- **Border**: `hsla(142, 55%, 85%, 0.5)` (emerald-tinted)
- **Light bleed**: Subtiele witte highlight aan bovenkant

### Ambient Mesh
- Achtergrond gradient mesh met subtiele emerald glows
- Creëert diepte en "omgevingslicht" effect

---

## Technische Details

### Bestanden die worden aangepast:

1. **`src/index.css`**
   - Voeg `--tab-facturatie-*` CSS variabelen toe
   - Voeg `.glass-card-emerald` class toe
   - Voeg `.shadow-float-emerald` classes toe
   - Voeg `.glass-ambient-mesh-emerald` toe

2. **`src/pages/Facturatie.tsx`**
   - Update wrapper div met ambient mesh
   - Apply glassmorphism classes op Cards
   - Voeg hover effects toe aan tabel rows

3. **`tailwind.config.ts`**
   - Voeg `facturatie` tab kleuren toe aan config

---

## Voorbeeld Resultaat

De Cards zullen:
- Een subtiele groene tint hebben (niet te opvallend)
- Lijken te "zweven" door de emerald-getinte schaduwen
- Een frosted glass effect hebben door de backdrop blur
- Een premium, Apple-achtige uitstraling krijgen

Light mode:
- Lichte achtergrond met subtiele emerald glow
- Witte/transparante cards met emerald schaduwen

Dark mode:
- Donkere achtergrond met gedempte emerald accenten
- Diepere glass panels met emerald highlights

