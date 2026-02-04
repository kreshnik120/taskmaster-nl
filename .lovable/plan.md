

# Enterprise Glass Styling - Expert Diagnose en Verfijningsplan

## Diagnose: Wat Werkt & Wat Ontbreekt

### Wat Correct Is Geïmplementeerd
| Component | Status | Locatie |
|-----------|--------|---------|
| PageContainer component | Werkt | `src/components/ui/page-container.tsx` |
| Page-bg-* tint classes | Werkt | `src/index.css` (regel 3467-3609) |
| Enhanced ambient mesh (Tier 2) | Werkt | `src/index.css` (regel 3614-3700+) |
| glass-liquid-card base | Werkt | `src/index.css` (regel 626-827) |
| Context-colored shadow variants | Werkt | `src/index.css` |
| KPICard component met glass classes | Werkt | `src/components/ui/kpi-card.tsx` |

### Wat NIET Werkt of Onzichtbaar Is

| Probleem | Root Cause | Impact |
|----------|------------|--------|
| **Dashboard puur witte achtergrond** | `UnifiedDashboard.tsx` gebruikt GEEN PageContainer | Geen module-identiteit op hoofddashboard |
| **Ambient mesh niet zichtbaar op dashboard tabs** | Tab containers hebben `glass-liquid-premium` die de parent ambient mesh overschrijft | Verlies van ruimtelijke diepte |
| **KPI cards missen floating look** | Opaciteit te subtiel (0.12 in shadows) + achtergrond te wit | Cards lijken plat i.p.v. zwevend |
| **Geen vignette op pagina's** | PageContainer heeft `withVignette = true` default maar effect te zwak | Mist 3D ruimtelijke diepte |

---

## Verfijningsplan: 5 Kritieke Fixes

### Fix 1: Dashboard Voorzien van PageContainer per Tab Context

**Bestand:** `src/pages/UnifiedDashboard.tsx`

Het dashboard moet dynamisch de juiste PageContainer gebruiken gebaseerd op actieve tab:

**Huidige situatie:**
```tsx
return (
  <div className="space-y-6">
    {/* Content zonder page-bg of ambient mesh */}
  </div>
);
```

**Nieuwe situatie:**
```tsx
import { PageContainer, ContextColor } from "@/components/ui/page-container";

// Map tab naar context color
const TAB_CONTEXT_MAP: Record<string, ContextColor> = {
  'mijn-werk': 'indigo',
  'kalender': 'teal', 
  'lijst': 'slate',
  'opvolging': 'amber',
  'team': 'violet',
  'recruitment': 'rose',
};

return (
  <PageContainer 
    contextColor={TAB_CONTEXT_MAP[activeTab] || 'indigo'} 
    className="space-y-6"
  >
    {/* Bestaande content */}
  </PageContainer>
);
```

**Impact:** Dashboard krijgt dynamische kleur-identiteit per tab.

---

### Fix 2: Versterkte KPI Card Floating Effect

**Bestand:** `src/index.css`

Verhoog de shadow opaciteit van de glass-liquid-card classes voor meer zichtbaar "lift" effect:

**Huidige waarden:**
- Shadow layer 1: `0.08` opaciteit
- Shadow layer 2: `0.12` opaciteit  
- Context shadow layers: `0.12` opaciteit

**Nieuwe waarden:**
- Shadow layer 1: `0.12` opaciteit (+50%)
- Shadow layer 2: `0.18` opaciteit (+50%)
- Context shadow layers: `0.18` opaciteit (+50%)

**Voorbeeld fix voor glass-liquid-card:**
```css
.glass-liquid-card {
  box-shadow:
    0 4px 24px -4px rgba(0, 0, 0, 0.12),  /* Was 0.08 */
    0 8px 16px -8px rgba(0, 0, 0, 0.18),  /* Was 0.12 */
    0 16px 40px -12px rgba(0, 0, 0, 0.10), /* Was 0.06 */
    inset 0 1px 0 rgba(255, 255, 255, 0.85); /* Was 0.75 */
}
```

**Impact:** Cards "zweven" duidelijk zichtbaar boven de achtergrond.

---

### Fix 3: Versterkte Page Vignette voor 3D Diepte

**Bestand:** `src/index.css`

De huidige vignette (als die bestaat) is te subtiel. Verhoog de edge-darkening:

**Nieuwe/verbeterde vignette class:**
```css
.page-vignette {
  position: relative;
}

.page-vignette::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse 85% 65% at 50% 50%,
    transparent 45%,
    hsla(0, 0%, 0%, 0.035) 100%  /* Verhoogd van 0.02 */
  );
}

.dark .page-vignette::after {
  background: radial-gradient(
    ellipse 85% 65% at 50% 50%,
    transparent 45%,
    hsla(0, 0%, 0%, 0.08) 100%
  );
}
```

**Impact:** Pagina's krijgen subtiele 3D "ruimte" gevoel.

---

### Fix 4: Tab Content Containers Transparanter Maken

**Bestand:** `src/pages/UnifiedDashboard.tsx`

De huidige tab containers (`glass-liquid-premium`) hebben een te hoge opaciteit waardoor de parent ambient mesh onzichtbaar wordt.

**Huidige situatie:**
```tsx
<div className="glass-liquid-premium glass-specular-premium p-6 rounded-2xl">
```

**Nieuwe situatie:**
```tsx
<div className="glass-liquid-overlay rounded-2xl p-6">
```

Of: verwijder de glass wrapper volledig zodat de cards direct op de page-bg zweven:

```tsx
<div className="space-y-6">
  {/* Content direct op PageContainer achtergrond */}
</div>
```

**Impact:** Ambient mesh orbs worden zichtbaar door de content heen.

---

### Fix 5: PageContainer Ambient Mesh Visibility Boost

**Bestand:** `src/index.css`

De enhanced ambient mesh classes gebruiken `!important` maar de z-index kan conflicteren met content. Zorg dat ze ALTIJD zichtbaar zijn:

**Toevoegen aan ambient mesh classes:**
```css
.glass-ambient-mesh-rose::before,
.glass-ambient-mesh-violet::before,
.glass-ambient-mesh-teal::before,
/* etc. */ {
  z-index: -1 !important;  /* Al aanwezig */
  opacity: 1 !important;   /* Nieuw: forceer visibility */
}
```

Optioneel: verhoog de opaciteit van de radial gradients nog verder:
- Van `0.22` naar `0.28` voor primaire orb
- Van `0.16` naar `0.22` voor secundaire orb

---

## Samenvatting Wijzigingen

| Bestand | Wijziging |
|---------|-----------|
| `src/pages/UnifiedDashboard.tsx` | Wrap met PageContainer, dynamische contextColor per tab |
| `src/index.css` | Verhoog glass-liquid-card shadow opaciteit (+50%) |
| `src/index.css` | Voeg/versterk .page-vignette effect toe |
| `src/index.css` | Optioneel: verhoog ambient mesh opaciteit |
| `src/pages/UnifiedDashboard.tsx` | Tab containers transparanter of verwijderen |

---

## Technische Details

### Tab-to-Context Color Mapping

| Tab | contextColor | HSL Hue |
|-----|--------------|---------|
| Mijn Werk | indigo | 234° |
| Kalender | teal | 174° |
| Lijst | slate | 215° |
| Opvolging | amber | 38° |
| Team | violet | 270° |
| Recruitment | rose | 345° |

### Shadow Opaciteit Progression

Nieuwe waarden voor optimaal floating effect:

| Layer | Huidig | Nieuw | Effect |
|-------|--------|-------|--------|
| Ambient | 0.08 | 0.12 | +50% zichtbaarder |
| Edge lift | 0.12 | 0.18 | +50% dieper |
| Bottom spread | 0.06 | 0.10 | +67% grounding |
| Context shadows | 0.12 | 0.18 | +50% kleur-glow |

