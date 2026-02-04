

# Enterprise-Niveau Page Background Systeem

## Analyse: Huidige Staat vs. Gewenste Staat

### Wat werkt al:
- ✅ **Ambient mesh classes** bestaan voor alle modules (rose, violet, slate, teal, amber, emerald, blue, indigo)
- ✅ **Per-pagina toepassing** - elke pagina heeft al een `glass-ambient-mesh-[color]` class
- ✅ **Dark mode support** in alle ambient mesh variants

### Wat ontbreekt voor "top-tier enterprise":

| Probleem | Impact |
|----------|--------|
| Ambient mesh opaciteit te laag (0.10-0.15) | Kleur is nauwelijks zichtbaar, geen sterke visuele identiteit |
| Geen achtergrond-tint op pagina zelf | Glass elementen hebben geen context-kleur om mee te interageren |
| Geen vignette/edge gradient | Pagina voelt "plat" in plaats van 3D ruimtelijk |
| Geen noise texture op page niveau | Mist "materiaal" gevoel van echte Apple interfaces |

---

## Het 3-Tier Enterprise Background Systeem

```text
┌──────────────────────────────────────────────────────────────┐
│  TIER 3: Noise Texture Overlay (optioneel)                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  TIER 2: Ambient Mesh Orbs (VERSTERKT)                 │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  TIER 1: Page Background Tint                    │  │  │
│  │  │  (Subtiele context-kleur in achtergrond)         │  │  │
│  │  │                                                  │  │  │
│  │  │     [Glass Cards zweven hier bovenop]           │  │  │
│  │  │                                                  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementatie Stappen

### Stap 1: Page Background Tint Classes (CSS)

**Bestand:** `src/index.css`

Nieuwe utility classes die een subtiele context-kleur aan de volledige pagina-achtergrond toevoegen:

```css
/* Page Background Tints - Enterprise niveau */
.page-bg-rose {
  background: linear-gradient(
    165deg,
    hsl(345 48% 98%) 0%,
    hsl(345 15% 99%) 40%,
    hsl(0 0% 100%) 100%
  );
}

.page-bg-violet { /* Professionals */ }
.page-bg-slate  { /* Klanten */ }
.page-bg-teal   { /* Plaatsingen */ }
.page-bg-amber  { /* Tijdregistratie */ }
.page-bg-emerald { /* Facturatie */ }
.page-bg-indigo { /* Dashboard/Mijn Werk */ }
.page-bg-blue   { /* WhatsApp */ }
```

### Stap 2: Versterkte Ambient Mesh Orbs (CSS)

**Bestand:** `src/index.css`

Verhoog de opaciteit van de bestaande ambient mesh classes van 0.10-0.15 naar **0.18-0.28** en vergroot de radial gradients voor meer "ruimte" gevoel:

| Huidige Waarde | Nieuwe Waarde | Effect |
|----------------|---------------|--------|
| `hsla(..., 0.15)` | `hsla(..., 0.22)` | 47% sterker, nog steeds elegant |
| `inset: -150px` | `inset: -200px` | Groter bereik, zachter verloop |
| `blur(50px)` | `blur(65px)` | Nog vloeiender, visionOS-achtig |

### Stap 3: Page Vignette Effect (CSS)

Voeg een subtiele edge-darkening toe voor 3D diepte:

```css
.page-vignette::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 50%,
    transparent 50%,
    hsla(0 0% 0% / 0.02) 100%
  );
}
```

### Stap 4: PageContainer Component (TSX)

**Nieuw bestand:** `src/components/ui/page-container.tsx`

Een wrapper component die automatisch de juiste background, ambient mesh en optionele noise texture toepast:

```tsx
interface PageContainerProps {
  contextColor: "rose" | "violet" | "slate" | "teal" | "amber" | "emerald" | "indigo" | "blue";
  children: React.ReactNode;
  withNoise?: boolean; // Optionele noise texture
}

export function PageContainer({ 
  contextColor, 
  children, 
  withNoise = false 
}: PageContainerProps) {
  return (
    <div className={cn(
      "min-h-full",
      `page-bg-${contextColor}`,
      `glass-ambient-mesh-${contextColor}`,
      withNoise && "page-noise-texture"
    )}>
      {children}
    </div>
  );
}
```

### Stap 5: Micro-Noise Texture op Page Niveau (CSS)

```css
.page-noise-texture::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background-image: url("data:image/svg+xml,...noise...");
  opacity: 0.015; /* Zeer subtiel */
  mix-blend-mode: overlay;
}
```

---

## Page-to-Color Mapping

| Pagina | contextColor | Hue | Reden |
|--------|--------------|-----|-------|
| Sollicitaties | `rose` | 345° | Recruitment = mensen, warmte |
| Professionals | `violet` | 270° | Team = samenwerking |
| Gebruikers | `violet` | 270° | Gebruikersbeheer |
| Klanten | `slate` | 215° | Data = neutraal, professioneel |
| Plaatsingen | `teal` | 174° | Kalender/planning = rust |
| Tijdregistratie | `amber` | 38° | Tijd = urgentie, focus |
| Facturatie | `emerald` | 142° | Geld = groei |
| WhatsApp | `blue` | 217° | Communicatie |
| Dashboard | `indigo` | 234° | Focus, werk |
| Bijlagen | `indigo` | 234° | Documenten |
| Notulen | `indigo` | 234° | Vergaderingen |

---

## Wijzigingen per Bestand

| Bestand | Wijziging |
|---------|-----------|
| `src/index.css` | +60 regels: 8 page-bg-* classes, versterkte ambient mesh, vignette, noise texture |
| `src/components/ui/page-container.tsx` | **NIEUW** - 30 regels wrapper component |
| `src/pages/Plaatsingen.tsx` | Update naar `<PageContainer contextColor="teal">` |
| `src/pages/Professionals.tsx` | Update naar `<PageContainer contextColor="violet">` |
| `src/pages/Klanten.tsx` | Update naar `<PageContainer contextColor="slate">` |
| `src/pages/Sollicitaties.tsx` | Update naar `<PageContainer contextColor="rose">` |
| `src/pages/Facturatie.tsx` | Update naar `<PageContainer contextColor="emerald">` |
| `src/pages/Tijdregistratie.tsx` | Update naar `<PageContainer contextColor="amber">` |
| `src/pages/WhatsApp.tsx` | Update naar `<PageContainer contextColor="blue">` |
| `src/pages/Gebruikers.tsx` | Update naar `<PageContainer contextColor="violet">` |
| `src/pages/Bijlagen.tsx` | Update naar `<PageContainer contextColor="indigo">` |
| `src/pages/Notulen.tsx` | Update naar `<PageContainer contextColor="indigo">` |

---

## Visueel Resultaat

Na implementatie:
- **Elke pagina heeft een unieke kleuridentiteit** die onmiddellijk herkenbaar is
- **Glass elementen "zweven" zichtbaar** boven de gekleurde achtergrond
- **Ambient orbs zijn prominenter** maar nog steeds elegant (niet fel)
- **Subtiele vignette** geeft 3D diepte zonder afleidend te zijn
- **Optionele noise texture** voor premium materiaal-gevoel
- **Consistent dark mode** met aangepaste saturatie en helderheid

Dit systeem creëert de "ruimtelijke computing" esthetiek van Apple visionOS waar elke module zijn eigen "environment" heeft.

