

# KPI-Tegels Verfijning: Compacter Formaat + Enhanced Apple Glass

## Probleemanalyse

Op basis van de screenshot zie ik de volgende verbeterpunten:

| Issue | Impact |
|-------|--------|
| **KPI-tegels te breed** | Cards vullen de hele breedte, voelen "uitgesmeerd" aan |
| **Onvoldoende "lift" effect** | Cards lijken plat te liggen op de achtergrond |
| **Schaduw ontbreekt of is te subtiel** | Geen duidelijke scheiding tussen card en achtergrond |
| **Glass effect niet krachtig genoeg** | Te weinig specular highlights en depth |

## Oplossingsplan

### Stap 1: Compacter Card Formaat

**Bestand:** `src/components/ui/kpi-card.tsx`

Verklein de padding en font sizes voor een strakker uiterlijk:

| Element | Huidig | Nieuw |
|---------|--------|-------|
| CardContent padding | `p-4` | `p-3` |
| Icon size | `h-5 w-5` | `h-4 w-4` |
| Value font | `text-3xl` | `text-2xl` |
| Title margin | `mb-3` | `mb-2` |

### Stap 2: Enhanced Glass Effect met Floating Shadow

**Bestand:** `src/components/ui/kpi-card.tsx`

Voeg een prominentere schaduw en glass-laag toe:

```tsx
// In de Card className:
cn(
  "glass-liquid-card", // Nieuwe enhanced glass class
  "shadow-[0_8px_30px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)]",
  "hover:shadow-[0_12px_40px_rgba(0,0,0,0.12),0_6px_16px_rgba(0,0,0,0.08)]",
  "transition-shadow duration-300"
)
```

### Stap 3: Nieuwe `.glass-liquid-card` Class met Lift Effect

**Bestand:** `src/index.css`

Maak een specifieke class voor KPI cards met meer "float" gevoel:

```css
.glass-liquid-card {
  position: relative;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.55);
  
  /* 4-Layer Float Shadow System */
  box-shadow:
    /* Layer 1: Soft ambient glow */
    0 4px 24px -4px rgba(0, 0, 0, 0.08),
    /* Layer 2: Edge shadow for lift */
    0 8px 16px -8px rgba(0, 0, 0, 0.12),
    /* Layer 3: Subtle bottom spread */
    0 16px 40px -12px rgba(0, 0, 0, 0.06),
    /* Layer 4: Inner top highlight */
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.glass-liquid-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 6px 32px -4px rgba(0, 0, 0, 0.10),
    0 12px 24px -8px rgba(0, 0, 0, 0.15),
    0 24px 48px -12px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}
```

### Stap 4: Context-Gekleurde Schaduw

Voeg context-specifieke schaduwen toe per module (rose, teal, etc.):

```css
.glass-liquid-card-rose {
  box-shadow:
    0 4px 24px -4px hsla(345, 55%, 50%, 0.12),
    0 8px 16px -8px hsla(345, 55%, 40%, 0.10),
    0 16px 40px -12px hsla(345, 55%, 50%, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.glass-liquid-card-teal { /* Plaatsingen */ }
.glass-liquid-card-violet { /* Professionals */ }
/* etc. voor alle context-kleuren */
```

### Stap 5: Update KPI Grid Spacing

**Bestand:** `src/pages/Sollicitaties.tsx` en andere pagina's

Optioneel: pas de gap aan voor meer "ademruimte" tussen cards:

```tsx
// Van:
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">

// Naar (optioneel):
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

---

## Visueel Resultaat

Na implementatie:
- **Compactere tegels** met minder padding (strakker)
- **Duidelijke "lift"** door 4-layer shadow system
- **Glass effect versterkt** met hogere opaciteit en inner highlight
- **Hover animatie** die de card 2px optilt voor interactieve feedback
- **Context-gekleurde schaduwen** die de rose/teal/violet tint subtiel doorzetten

---

## Technische Details

### Bestanden te wijzigen:

| Bestand | Wijziging |
|---------|-----------|
| `src/components/ui/kpi-card.tsx` | Padding verkleinen, enhanced glass classes toevoegen |
| `src/index.css` | `.glass-liquid-card` class met float shadow system |
| `src/index.css` | Context-gekleurde card variants (`.glass-liquid-card-rose`, etc.) |
| `src/pages/Sollicitaties.tsx` | Grid gap optioneel aanpassen |

### Nieuwe CSS Classes:

- `.glass-liquid-card` - Basisclass met enhanced glass + float shadows
- `.glass-liquid-card-rose` - Rose context-schaduw
- `.glass-liquid-card-teal` - Teal context-schaduw
- `.glass-liquid-card-violet` - Violet context-schaduw
- `.glass-liquid-card-amber` - Amber context-schaduw
- `.glass-liquid-card-emerald` - Emerald context-schaduw
- `.glass-liquid-card-slate` - Slate context-schaduw
- `.glass-liquid-card-indigo` - Indigo context-schaduw
- `.glass-liquid-card-blue` - Blue context-schaduw

