
# Apple Glass Polish: Diepte, Blur & Floating Effect

## Overzicht

De glass CSS classes bestaan al en zijn grotendeels toegepast op de juiste elementen. Het probleem is dat de waarden te zwak zijn waardoor alles "plat" oogt. Deze prompt versterkt de bestaande classes en upgradet het Dialog component voor maximale impact.

**Huidige staat (al correct toegepast):**
- TaskCard: `glass-task-card glass-hover-lift` (al op regel 157 van TaskCard.tsx)
- Kanban kolommen: `glass-kanban-column-enhanced` (al op regel 759 van MyTasksFlowSection.tsx)
- Sidebar: glass styling met `!important` (al in index.css)
- Dialog: `bg-white/90 backdrop-blur-2xl` (al in dialog.tsx)
- KPI Cards: `glass-liquid-card` + color variants (al in kpi-card.tsx)

**Probleem:** De glass-waarden zijn te subtiel en er zijn 3 duplicate definities van `.glass-hover-lift` en 2 van `.glass-search-input` die elkaar overschrijven.

---

## Wijzigingen

### 1. `src/index.css` - CSS Classes Versterken

**Duplicate cleanup + versterking van 7 glass classes:**

| Class | Huidige waarde | Nieuwe waarde |
|-------|---------------|---------------|
| `.glass-task-card` | Alleen hover styling, geen base glass | Base: `bg-white/70 backdrop-blur-lg shadow-float` |
| `.glass-task-card:hover` | blur 8px, shadow 0.08 | blur 16px, shadow 0.12, translateY(-1px) |
| `.glass-kanban-column-enhanced` | blur 20px, bg 0.55 | blur 28px, bg 0.50, sterkere shadows |
| `.glass-liquid-card` | bg 0.82 | bg 0.75 (meer transparant) |
| `.glass-panel` | blur 20px | blur 28px |
| `.glass-hover-lift` | 3 duplicate definities | 1 definitie, sterkere shadows |
| `.glass-search-input` | 2 duplicate definities | 1 definitie, sterkere blur |

**Sidebar versterken (bestaande `[data-sidebar="sidebar"]`):**
- Van: `bg-white/0.92 blur-24px`
- Naar: `bg-white/0.88 blur-32px saturate-1.8` + gradient separator

**Nieuw toevoegen:**
- `.glass-dialog` utility class voor modals met `blur-2xl saturate-1.8`
- `.glass-table-header` voor tabel headers met subtiele glaseffecten

### 2. `src/components/ui/dialog.tsx` - Dialog Component Upgraden

Dit is de meest impactvolle wijziging (raakt ALLE modals in de app).

**DialogOverlay:**
- Van: `bg-black/50 backdrop-blur-sm`
- Naar: `bg-black/30 backdrop-blur-sm` (lichter, app schijnt meer door)

**DialogContent:**
- Van: `bg-white/90 backdrop-blur-2xl border-white/40 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)]`
- Naar: `bg-white/85 backdrop-blur-2xl backdrop-saturate-[1.8] border-white/50 shadow-[0_8px_40px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]`

### 3. Duplicate CSS opschonen

De index.css bevat 3 definities van `.glass-hover-lift` (regels ~865, ~2426, ~3438) en 2 van `.glass-search-input` (regels ~1909, ~2564). De laatste definitie wint, maar dit is fragiel. Consolideer naar 1 definitie per class met de sterkste waarden.

---

## Technisch Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/index.css` | Versterking van ~7 glass classes + duplicate cleanup |
| `src/components/ui/dialog.tsx` | Overlay + Content glass upgrade |

## Wat NIET verandert

- Geen component imports of logica
- Geen database wijzigingen
- Geen routing wijzigingen
- Alle functionaliteit blijft identiek
- Geen nieuwe classes toevoegen aan component bestanden (de bestaande class-namen zijn al correct toegepast)
