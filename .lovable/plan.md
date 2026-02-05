
# Kritieke Mobile Bug Fix: Content Clipping en Layout Problemen

## Probleemanalyse

Op basis van de screenshot die je hebt gedeeld, zie ik de volgende kritieke problemen op mobiele apparaten:

### Waargenomen Bugs
1. **Tekst afgesneden aan linkerkant** - "Vand**ag** Focus" ipv "Vandaag Focus"
2. **Content schuift buiten het scherm** - taaktitels beginnen vóór de linkerrand
3. **Kanban kolommen incorrect** - "Acti..." afgesneden
4. **Veel lege ruimte rechts** - asymmetrische layout

### Technische Oorzaak

Na grondig onderzoek van de CSS heb ik de exacte oorzaak gevonden:

De `.glass-ambient-mesh-indigo` class (gebruikt op de "Mijn Werk" tab) heeft een pseudo-element dat **200px buiten de container** uitstrekt:

```css
/* Regel 4006-4020 in index.css */
.glass-ambient-mesh-indigo::before {
  inset: -200px !important;  /* ← PROBLEEM: te groot voor mobiel */
}
```

**Waarom alleen op mobiel?**
- De viewport is 390px breed
- Het pseudo-element strekt 200px naar links + 200px naar rechts uit
- Totale breedte: 790px (meer dan 2x de viewport)
- Dit veroorzaakt horizontale scroll en content verschuiving

**Waarom alleen indigo?**
Alle andere ambient mesh kleuren zijn gecorrigeerd in twee plaatsen:
1. `overflow: hidden` groep (regel 2623-2630) - **indigo ontbreekt**
2. Mobile optimization query (regel 2666-2676) - **indigo ontbreekt**

---

## Oplossing

### Wijziging 1: Voeg indigo toe aan overflow control (regel 2622-2631)

**Huidige code:**
```css
/* Overflow control for ambient mesh containers */
.glass-ambient-mesh-emerald,
.glass-ambient-mesh-rose,
.glass-ambient-mesh-violet,
.glass-ambient-mesh-slate,
.glass-ambient-mesh-teal,
.glass-ambient-mesh-amber,
.glass-ambient-mesh-blue {
  overflow: hidden;
}
```

**Nieuwe code:**
```css
/* Overflow control for ambient mesh containers */
.glass-ambient-mesh-emerald,
.glass-ambient-mesh-rose,
.glass-ambient-mesh-violet,
.glass-ambient-mesh-slate,
.glass-ambient-mesh-teal,
.glass-ambient-mesh-amber,
.glass-ambient-mesh-blue,
.glass-ambient-mesh-indigo {
  overflow: hidden;
}
```

---

### Wijziging 2: Voeg indigo toe aan GPU optimization (regel 2633-2643)

**Huidige code:**
```css
/* GPU optimization hints */
.glass-ambient-mesh-emerald::before,
.glass-ambient-mesh-rose::before,
.glass-ambient-mesh-violet::before,
.glass-ambient-mesh-slate::before,
.glass-ambient-mesh-teal::before,
.glass-ambient-mesh-amber::before,
.glass-ambient-mesh-blue::before {
  will-change: auto;
  contain: strict;
}
```

**Nieuwe code:**
```css
/* GPU optimization hints */
.glass-ambient-mesh-emerald::before,
.glass-ambient-mesh-rose::before,
.glass-ambient-mesh-violet::before,
.glass-ambient-mesh-slate::before,
.glass-ambient-mesh-teal::before,
.glass-ambient-mesh-amber::before,
.glass-ambient-mesh-blue::before,
.glass-ambient-mesh-indigo::before {
  will-change: auto;
  contain: strict;
}
```

---

### Wijziging 3: Voeg indigo toe aan mobile optimization (regel 2665-2676)

**Huidige code:**
```css
/* Smaller ambient mesh on mobile */
.glass-ambient-mesh::before,
.glass-ambient-mesh-emerald::before,
.glass-ambient-mesh-rose::before,
.glass-ambient-mesh-violet::before,
.glass-ambient-mesh-slate::before,
.glass-ambient-mesh-teal::before,
.glass-ambient-mesh-amber::before,
.glass-ambient-mesh-blue::before {
  inset: -50px;
  filter: blur(30px);
}
```

**Nieuwe code:**
```css
/* Smaller ambient mesh on mobile */
.glass-ambient-mesh::before,
.glass-ambient-mesh-emerald::before,
.glass-ambient-mesh-rose::before,
.glass-ambient-mesh-violet::before,
.glass-ambient-mesh-slate::before,
.glass-ambient-mesh-teal::before,
.glass-ambient-mesh-amber::before,
.glass-ambient-mesh-blue::before,
.glass-ambient-mesh-indigo::before {
  inset: -50px !important;  /* !important nodig om regel 4009 te overrulen */
  filter: blur(30px) !important;
}
```

---

### Wijziging 4: Fix de base indigo definitie (regel 3641-3644)

**Huidige code:**
```css
.glass-ambient-mesh-indigo {
  position: relative;
  overflow: visible;  /* ← PROBLEEM */
}
```

**Nieuwe code:**
```css
.glass-ambient-mesh-indigo {
  position: relative;
  overflow: hidden;  /* Consistent met andere ambient mesh classes */
}
```

---

## Impact

| Probleem | Status na fix |
|----------|---------------|
| Tekst afgesneden links | ✅ Opgelost |
| Content buiten scherm | ✅ Opgelost |
| Kanban kolommen | ✅ Correct zichtbaar |
| Lege ruimte rechts | ✅ Gecorrigeerd |
| Ambient mesh effect | ✅ Behouden (verkleind op mobiel) |

---

## Technische Details

### Waarom `overflow: hidden` werkt

Het pseudo-element met `inset: -200px` blijft bestaan, maar de parent container met `overflow: hidden` verbergt alles wat buiten de container valt. Het visuele effect blijft behouden omdat het centrale deel van het pseudo-element (binnen de container) nog steeds zichtbaar is.

### Waarom `!important` nodig is in de media query

De latere definitie op regel 4009 gebruikt `!important`. Om dit te overrulen in de media query voor mobiel, moeten we ook `!important` gebruiken vanwege CSS specificiteitregels.

### Consistentie

Na deze fix zijn alle 8 ambient mesh kleuren (emerald, rose, violet, slate, teal, amber, blue, **indigo**) consistent behandeld met dezelfde overflow, GPU optimization en mobile optimization regels.
