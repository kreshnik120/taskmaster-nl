
# Plan: Medewerker-kleuren in Kalender

## Overzicht

Taken in de kalender worden nu gekleurd op basis van de **toegewezen medewerker** in plaats van prioriteit. Elke medewerker krijgt een consistente, unieke kleur zodat je in één oogopslag kunt zien wie welke taken heeft.

---

## Wat Verandert

### Huidige situatie (maandag 02-02)
```text
┌────────────────────────────────┐
│ ● Intake gesprek    │ Blauw   │ ← Medium prioriteit
│ ● VOG aanvragen     │ Blauw   │ ← Medium prioriteit  
│ ● Factuur versturen │ Blauw   │ ← Medium prioriteit
└────────────────────────────────┘
Alles ziet er hetzelfde uit!
```

### Na implementatie
```text
┌────────────────────────────────┐
│ ● Intake gesprek    │ Paars   │ ← Anna
│ ● VOG aanvragen     │ Teal    │ ← Bob
│ ● Factuur versturen │ Oranje  │ ← Carla
└────────────────────────────────┘
Elke medewerker heeft een eigen kleur!
```

---

## Technische Aanpak

### 1. Nieuwe Hook: `useAssigneeColor`

Herbruikbare hook die een consistente kleur genereert op basis van een medewerker ID of naam:

```text
src/hooks/useAssigneeColor.ts
├── hashToColor() - Hash algoritme (9 kleuren)
├── ASSIGNEE_COLORS - Kleurenpalet met bg/border/dot styling
└── getAssigneeColor(id: string) - Haalt kleur op
```

**Kleuren Palet (9 kleuren):**
| # | Kleur | Background | Border | Dot |
|---|-------|------------|--------|-----|
| 1 | Rood | bg-red-50/40 | border-l-red-500/70 | bg-red-500/80 |
| 2 | Oranje | bg-orange-50/40 | border-l-orange-500/70 | bg-orange-500/80 |
| 3 | Amber | bg-amber-50/40 | border-l-amber-500/70 | bg-amber-500/80 |
| 4 | Groen | bg-green-50/40 | border-l-green-500/70 | bg-green-500/80 |
| 5 | Teal | bg-teal-50/40 | border-l-teal-500/70 | bg-teal-500/80 |
| 6 | Blauw | bg-blue-50/40 | border-l-blue-500/70 | bg-blue-500/80 |
| 7 | Indigo | bg-indigo-50/40 | border-l-indigo-500/70 | bg-indigo-500/80 |
| 8 | Paars | bg-purple-50/40 | border-l-purple-500/70 | bg-purple-500/80 |
| 9 | Roze | bg-pink-50/40 | border-l-pink-500/70 | bg-pink-500/80 |

### 2. Aanpassing EmbeddedCalendarView.tsx

**Wat wijzigt:**
- Taak-cards gebruiken medewerker-kleur in plaats van prioriteit-kleur
- Prioriteit blijft zichtbaar via kleine indicator dot

**Code wijziging (regels 819-854):**

Huidige logica:
```text
PRIORITY_BG[priority]      → Achtergrond kleur
PRIORITY_BORDERS[priority] → Border-left kleur
PRIORITY_DOTS[priority]    → Dot kleur
```

Nieuwe logica:
```text
ASSIGNEE_BG[assignee_id]      → Achtergrond kleur per medewerker
ASSIGNEE_BORDERS[assignee_id] → Border-left kleur per medewerker
+ kleine priority indicator dot (optioneel)
```

### 3. Visuele Indicator voor Prioriteit

Omdat kleur nu op medewerker is gebaseerd, wordt prioriteit getoond via:
- Kleine dot naast de titel (rood/amber/blauw/groen)
- Of icon indicator voor urgente taken

---

## Implementatie Stappen

| Stap | Bestand | Wijziging |
|------|---------|-----------|
| 1 | `src/hooks/useAssigneeColor.ts` | **Nieuw** - Hook met kleurlogica |
| 2 | `src/components/dashboard/EmbeddedCalendarView.tsx` | Import hook + gebruik assignee kleuren |
| 3 | Task rendering (regels 819-854) | Vervang PRIORITY_* met ASSIGNEE_* |
| 4 | Priority indicator | Kleine dot toevoegen voor prioriteit |

---

## Voorbeeld Resultaat

```text
Maandag 3 februari
┌─────────────────────────────────────────┐
│ 🟣 ● Intake gesprek met kandidaat       │ ← Paars = Anna
│     09:00  ○ (medium prioriteit)        │
├─────────────────────────────────────────┤
│ 🩵 ● VOG aanvragen voor plaatsing       │ ← Teal = Bob
│     10:30  ● (hoge prioriteit - amber)  │
├─────────────────────────────────────────┤
│ 🟠 ● Factuur versturen naar klant       │ ← Oranje = Carla
│     14:00  ○ (lage prioriteit)          │
└─────────────────────────────────────────┘
```

---

## Voordelen

1. **Visuele duidelijkheid** - Direct zien wie welke taken heeft
2. **Consistente kleuren** - Dezelfde medewerker = altijd dezelfde kleur (hash-based)
3. **Prioriteit behouden** - Kleine indicator toont nog steeds urgentie
4. **Herbruikbaar** - Hook kan ook in andere componenten gebruikt worden

---

## Technische Details

### Hash Algoritme
```text
medewerker_id → hash berekening → modulo 9 → kleur index
```

Dit zorgt ervoor dat:
- Dezelfde medewerker altijd dezelfde kleur krijgt
- Kleuren worden gelijkmatig verdeeld over het team
- Geen database wijzigingen nodig

### Dark Mode Support
Alle kleuren hebben automatisch dark mode varianten:
```text
bg-teal-50/40 dark:bg-teal-900/20
```

---

## Bestanden

| Type | Bestand | Actie |
|------|---------|-------|
| Nieuw | `src/hooks/useAssigneeColor.ts` | Aanmaken |
| Wijzigen | `src/components/dashboard/EmbeddedCalendarView.tsx` | ~30 regels |

**Totaal: 1 nieuw bestand + 1 wijziging**
