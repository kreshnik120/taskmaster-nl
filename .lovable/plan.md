
# Kleur Activatie: Achtergronden & Glass Tints per Tab

## Overzicht

De glass-elementen zijn correct gestyled maar de pagina-achtergronden zijn te bleek (bijna wit). Glass-op-wit = wit. Deze prompt versterkt de achtergrondkleuren zodat ze door het glas heen schijnen, en voegt een glow toe aan de actieve tab indicator.

**Kernprobleem:** De `.page-bg-*` classes gebruiken een enkele `linear-gradient` met lightness van 97-99%. De ambient mesh orbs hebben opacity van 0.14-0.28. Samen is dit te subtiel.

---

## Wijzigingen

### Enig bestand: `src/index.css`

Alle wijzigingen vinden uitsluitend plaats in het CSS-bestand. Geen component-wijzigingen nodig.

---

### 1. Page Backgrounds versterken (7 kleuren + blue)

Elke `.page-bg-*` class wordt vervangen door een 3-laags radial+linear gradient patroon:

```text
Huidig (1 laag):
  linear-gradient(165deg, hsl(H S% 98%) 0%, hsl(H S% 99%) 40%, white 100%)

Nieuw (3 lagen):
  radial-gradient(ellipse 80% 50% at 20% 20%, hsla(H, S%, 92%, 0.7), transparent 70%)
  radial-gradient(ellipse 60% 40% at 80% 80%, hsla(H, S%, 90%, 0.5), transparent 60%)
  linear-gradient(135deg, hsla(H, S-15%, 97%, 1), hsla(H, S-25%, 95%, 1), hsla(H, S-10%, 93%, 1))
```

Dark mode variant (lagere lightness):
```text
  radial-gradient(ellipse 80% 50% at 20% 20%, hsla(H, S%, 20%, 0.5), transparent 70%)
  radial-gradient(ellipse 60% 40% at 80% 80%, hsla(H, S%, 18%, 0.35), transparent 60%)
  linear-gradient(135deg, hsla(H, S-15%, 8%, 1), hsla(H, S-25%, 6%, 1), hsla(222, 47%, 11%, 1))
```

Per kleur:

| Kleur | Hue | Sat |
|-------|-----|-----|
| indigo | 234 | 55% |
| teal | 174 | 50% |
| slate | 215 | 35% |
| amber | 38 | 60% |
| violet | 270 | 50% |
| rose | 345 | 55% |
| emerald | 142 | 50% |
| blue | 217 | 55% |

Regels ~3707-3849 worden vervangen.

### 2. Ambient Mesh Orbs versterken (7 kleuren)

De enhanced ambient mesh secties (regels ~3856-4022) krijgen hogere opaciteit:

```text
Huidig: orb1=0.28, orb2=0.22, orb3=0.14
Nieuw:  orb1=0.38, orb2=0.30, orb3=0.22
```

Dark mode:
```text
Huidig: orb1=0.24, orb2=0.18, orb3=0.12
Nieuw:  orb1=0.30, orb2=0.22, orb3=0.16
```

Dit geldt voor alle 7 ambient mesh classes (rose, violet, slate, teal, amber, emerald, indigo). De eerder gedefinieerde indigo mesh op regels 3639-3657 wordt verwijderd (is een duplicate die wordt overschreven door de latere definitie op regel 4000).

### 3. Glass-card specular highlight toevoegen

De glass-card-* classes (regels ~349-1570) hebben al goede styling. Toevoeging: een specular `inset 0 1px 0` highlight in de box-shadow voor alle 7 kleuren, voor zover die er nog niet staat.

Huidige indigo box-shadow heeft al `inset 0 1px 1px`. Controleer en uniformeer alle 7 kleuren zodat ze allemaal de specular highlight bevatten:
```css
inset 0 1px 0 hsla(H, S+10%, 95%, 0.7)
```

### 4. Glass-liquid-card-* kleurtint versterken

De `glass-liquid-card-*` classes (regels ~700-818) krijgen een gekleurde achtergrond in plaats van alleen gekleurde shadows:

```css
.glass-liquid-card-indigo {
  background: hsla(234, 45%, 97%, 0.7);
  /* bestaande shadows blijven */
}
```

Dit voor alle 7 kleuren. Dark mode equivalent met lagere lightness.

### 5. Tab indicator glow

De actieve tab bottom bar in `UnifiedDashboard.tsx` is een `<span>` met `h-0.5`. Dit wordt versterkt:
- Van `h-0.5` naar `h-[3px]`
- Toevoegen van een `shadow-[0_2px_8px_currentColor]` voor een glow effect

Dit wordt gedaan in `src/pages/UnifiedDashboard.tsx` op de 6 tab indicator spans (regels ~198-199, ~216-217, etc.).

### 6. Kanban kolom header gradient

In `src/components/dashboard/MyTasksFlowSection.tsx` (regel ~759-760):
- `border-t-2` wordt `border-t-[3px]`
- De header gradient `from-white/60` wordt `from-tab-mijn-werk-50/40` voor een zachtgekleurde top

---

## Technisch Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/index.css` | Page-bg versterken (8 kleuren), ambient mesh opacity verhogen (7 kleuren), glass-liquid-card-* kleurtint, duplicate indigo mesh verwijderen |
| `src/pages/UnifiedDashboard.tsx` | Tab indicator van h-0.5 naar h-[3px] + glow shadow (6 spans) |
| `src/components/dashboard/MyTasksFlowSection.tsx` | border-t-2 naar border-t-[3px], header gradient kleurtint |

## Wat NIET verandert

- Geen functionaliteit, logica of data-flows
- Geen database wijzigingen
- Geen nieuwe componenten
- TodayFocusCard: heeft al `glass-card-indigo` (correct)
- Glass-card-* base styling: blijft intact (alleen specular highlight uniformeren)
- Geen routing wijzigingen
