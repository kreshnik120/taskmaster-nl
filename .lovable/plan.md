

# Kritische Bug Fix: Dubbele Iconen in Sorteer Dropdown

## Root Cause Analyse

Na grondige code-analyse is de oorzaak van de **dubbele iconen** duidelijk geïdentificeerd:

### Het Probleem

In `MyTasksFlowSection.tsx` (regels 552-580) worden iconen **twee keer gerenderd**:

```tsx
// PROBLEEM 1: Icoon in de SelectTrigger (regels 554-557)
<SelectTrigger className="...">
  <div className="flex items-center gap-1.5">
    {sortBy === 'due_at' && <Calendar className="h-3 w-3" />}      // ← ICOON 1
    {sortBy === 'priority' && <AlertCircle className="h-3 w-3" />} // ← ICOON 1
    {sortBy === 'created_at' && <Clock className="h-3 w-3" />}     // ← ICOON 1
    <SelectValue />  // ← Dit rendert ook het icoon uit SelectItem!
  </div>
</SelectTrigger>

// PROBLEEM 2: Icoon ook in elke SelectItem (regels 562-579)
<SelectItem value="due_at">
  <div className="flex items-center gap-2">
    <Calendar className="h-3 w-3" />  // ← ICOON 2 (komt in SelectValue terecht)
    Deadline
  </div>
</SelectItem>
```

### Hoe Radix Select werkt

Radix UI's `SelectValue` component rendert automatisch de **volledige children** van de geselecteerde `SelectItem`. Dit betekent:

1. Wanneer "Deadline" geselecteerd is, toont `SelectValue`:
   - `<Calendar />` + "Deadline" (uit de SelectItem)
2. De custom wrapper in SelectTrigger voegt **nog een icoon** toe
3. Resultaat: **📅📅 Deadline** (dubbel icoon)

### Visueel

```text
┌─────────────────────────────────────────────────────────────────┐
│  HUIDIGE SITUATIE (BUG)                                         │
│                                                                 │
│  ┌───────────────────────────┐                                  │
│  │ 📅 📅 Deadline         ▼  │  ← Dubbel icoon!                 │
│  └───────────────────────────┘                                  │
│                                                                 │
│  Bron:                                                          │
│  - Eerste 📅: Handmatig in SelectTrigger                        │
│  - Tweede 📅: Via SelectValue uit SelectItem                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  NA FIX                                                          │
│                                                                 │
│  ┌───────────────────────────┐                                  │
│  │ 📅 Deadline            ▼  │  ← Enkel icoon                   │
│  └───────────────────────────┘                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Oplossing

Er zijn **twee opties** om dit op te lossen:

### Optie A: Verwijder iconen uit SelectTrigger (Aanbevolen)

Laat de `SelectValue` het volledige item renderen zoals Radix bedoeld is:

```tsx
<SelectTrigger className="h-8 w-[140px] text-xs glass-select-trigger">
  <SelectValue />  {/* Rendert automatisch icoon + label */}
</SelectTrigger>
```

De iconen in de `SelectItem` blijven behouden — die worden correct getoond in zowel de dropdown als de trigger.

### Optie B: Gebruik SelectValue placeholder

Verwijder iconen uit SelectItem en toon alleen tekst:

```tsx
<SelectItem value="due_at">Deadline</SelectItem>
<SelectItem value="priority">Prioriteit</SelectItem>
<SelectItem value="created_at">Aangemaakt</SelectItem>
```

En behoud de handmatige iconen in de trigger.

**Aanbeveling**: **Optie A** is schoner en volgt het Radix-patroon correct.

---

## Implementatieplan

### Bestand: `src/components/dashboard/MyTasksFlowSection.tsx`

**Wijzigingen (regels 552-560):**

**Van:**
```tsx
<SelectTrigger className="h-8 w-[140px] text-xs glass-select-trigger">
  <div className="flex items-center gap-1.5">
    {sortBy === 'due_at' && <Calendar className="h-3 w-3" />}
    {sortBy === 'priority' && <AlertCircle className="h-3 w-3" />}
    {sortBy === 'created_at' && <Clock className="h-3 w-3" />}
    <SelectValue />
  </div>
</SelectTrigger>
```

**Naar:**
```tsx
<SelectTrigger className="h-8 w-[140px] text-xs glass-select-trigger">
  <SelectValue />
</SelectTrigger>
```

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | EDIT | Verwijder handmatige iconen uit SelectTrigger wrapper |

**Totaal: 1 bestand, ~6 regels verwijderd**

---

## Acceptatiecriteria

1. Sorteer dropdown toont **één icoon** per optie
2. Icoon + label correct getoond in gesloten trigger state
3. Icoon + label correct getoond in open dropdown menu
4. Geen visuele regressie in styling of spacing
5. Alle drie opties (Deadline, Prioriteit, Aangemaakt) correct gerenderd

---

## Technische Notitie

Dit is een **veelvoorkomende Radix UI valkuil**. De `SelectValue` component is bedoeld om de volledige content van de geselecteerde `SelectItem` te spiegelen. Het handmatig toevoegen van elementen naast `SelectValue` leidt tot duplicatie.

### Best Practice

```tsx
// CORRECT: Laat SelectValue het werk doen
<SelectTrigger>
  <SelectValue placeholder="Selecteer..." />
</SelectTrigger>

// SelectItem bevat het icoon + label
<SelectItem value="option">
  <div className="flex items-center gap-2">
    <Icon />
    Label
  </div>
</SelectItem>
```

