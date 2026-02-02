
## Doel
1) Het “schieten/jump” effect bij het vastpakken van een taak volledig elimineren, zodat de kaart exact onder de muis blijft tijdens slepen.  
2) Het glass-effect verder aanscherpen (meer diepte, kleurige schaduw) zonder dat we nog `transform`-animaties gebruiken die DnD kunnen verstoren.

---

## Analyse (waarom het nu nog “schiet”)
We hebben `rotate/scale` uit de `DragOverlay` gehaald (goed), maar de **bronkaart (de echte TaskCard in de lijst)** heeft nog steeds een hover-lift via CSS:

- In `src/index.css` staat `.glass-hover-lift:hover { transform: translateY(-2px) scale(1.005); }`
- `TaskCard.tsx` gebruikt `glass-hover-lift` op de `<Card ...>`.

Bij drag-start verliest het element vaak zijn `:hover`-staat (of verandert die abrupt), waardoor die `transform` ineens wegvalt terwijl dnd-kit net de startpositie heeft “gemeten”. Dat voelt voor de gebruiker alsof de kaart “wegschiet” bij het vastpakken.

Kort: **DnD + hover transforms op het draggable element = visuele sprong**.

---

## Oplossing: Phase 10 — DnD-stabiele hover (shadows-only) + “dragging mode” freeze
We gaan het zwevende gevoel behouden, maar tijdens drag (en voor TaskCard in het algemeen) **geen translate/scale transforms** meer gebruiken op het draggable element. We doen dit op twee niveaus:

### A) TaskCard hover-lift vervangen door shadow-only lift (geen transform)
**Bestand:** `src/components/TaskCard.tsx`

- Verwijder/replace `glass-hover-lift` op de TaskCard `<Card ...>` door een nieuwe class die alleen shadows/blur/border accentueert.
- Resultaat: de kaart kan nog steeds “premium zweven”, maar zonder geometrische verplaatsing.

Concreet:
- `glass-hover-lift` → `glass-hover-shadow` (nieuw)
- Hover-effect blijft, maar via `box-shadow`, `border`, `background`, `backdrop-filter` (geen `transform`).

### B) Tijdens actief draggen: hover-transforms globaal “bevriezen”
**Bestanden:**
- `src/components/dashboard/MyTasksFlowSection.tsx`
- `src/pages/Kanban.tsx`
- `src/index.css`

**In code:**
- In `handleDragStart`: `document.documentElement.classList.add('dnd-dragging')`
- In `handleDragEnd` én `onDragCancel`: `document.documentElement.classList.remove('dnd-dragging')`

**In CSS (`src/index.css`):**
- Voeg een globale guard toe zodat tijdens drag alle hover-transforms uit staan:
  - `.dnd-dragging .glass-hover-lift, .dnd-dragging .glass-hover-lift:hover { transform: none !important; }`
  - (en idem voor andere plekken waar nog translateY/scale op hover voorkomt binnen draggable zones, indien nodig)

Waarom dit extra helpt:
- Ook als er elders nog een transform-hover staat (bijv. kolommen of cards), voorkom je micro-jumps tijdens slepen.

### C) DragOverlay blijft “shadows-only”
**Bestanden:**
- `src/components/dashboard/MyTasksFlowSection.tsx`
- `src/pages/Kanban.tsx`
- `src/index.css`

- We laten `glass-drag-overlay-enhanced` bestaan en zorgen dat deze uitsluitend shadows/outline gebruikt.
- Geen `transform`, geen `opacity` wijzigingen die layout/positionering beïnvloeden.

---

## Glass-effect verder afmaken (wat je aangaf: “echt van de achtergrond af”)
Nadat DnD stabiel is, versterken we de “floating” illusie op de gemiste punten die je in de screenshot/flow ziet, zónder transforms:

### 1) Overdue/“Verlopen” badge premium glass
**Waarschijnlijk bestand:** `src/components/ui/urgency-badge.tsx` (of waar `UrgencyBadge` gedefinieerd is)  
- Voeg indigo-tinted shadow + inner highlight toe
- Zorg dat rood/oranje urgentie nog duidelijk is, maar met glass-depth (border + blur + zachte glow)

### 2) Status-dot (rechtsonder op TaskCard) subtiel glass
**Bestand:** `src/components/TaskCard.tsx`
- Dot krijgt een mini glow + border i.p.v. een “platte” kleur
- Hiermee voelt zelfs dat detail “bovenop” de kaart te liggen

---

## Implementatiestappen (volgorde)
1) **TaskCard hover transform verwijderen** (shadow-only hover toevoegen).
2) **Dragging mode toevoegen** (`dnd-dragging` class togglen in beide DnD flows).
3) CSS guard toevoegen om transforms tijdens drag te blokkeren.
4) Controle: slepen vanuit de drag-handle blijft exact onder de cursor, zonder jump.
5) Daarna: **urgency badge** + **status dot** upgraden naar premium glass.

---

## Bestanden die we aanpassen
- `src/components/TaskCard.tsx`
- `src/components/dashboard/MyTasksFlowSection.tsx`
- `src/pages/Kanban.tsx`
- `src/index.css`
- (mogelijk) `src/components/ui/urgency-badge.tsx` (of equivalent waar `UrgencyBadge` staat)

---

## Acceptatiecriteria (wat jij meteen moet voelen/zien)
1) Als je de drag-handle vastpakt, **blijft de taak exact onder je cursor** en “schiet” niet meer.
2) Tijdens slepen voelt de kaart **premium elevated** door indigo multi-layer shadows, zonder dat hij geometrisch verschuift.
3) De glass-look is consequent: badges/dots voelen “op” de UI i.p.v. “in” de achtergrond.

---

## Testprotocol (snel, maar end-to-end)
- Desktop: pak een taak bij de grip en sleep langzaam + snel; check of er geen jump is bij start.
- Hover over kaart vóór het pakken: start drag terwijl je nog “hover” bent; check jump = 0.
- Test ook in dark mode (indigo shadows moeten daar niet “modderig” worden).
