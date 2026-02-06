

# Plan: Verbeteringen Beschrijving Verloop

## Overzicht Verbeteringen

Dit plan implementeert **4 verbeteringen** aan de Beschrijving Verloop functionaliteit:

1. **Filter Optimalisatie** - `description_change` expliciet uitsluiten uit ActionTimeline
2. **Header Badge** - Teller toevoegen aan "Beschrijving" header met wijzigingsaantal
3. **Herstel Functie** - "Terugzetten" knop om eerdere versie te herstellen
4. **Visuele Polish** - Consistentie met ActionTimeline verbeteren

---

## Wat verandert er?

### 1. Filter Optimalisatie

**Huidige situatie:** ActionTimeline filtert impliciet op `completed_at` waardoor description_change entries meestal niet verschijnen, maar dit is niet expliciet.

**Na verbetering:** Expliciete filter zodat `description_change` entries nooit in ActionTimeline verschijnen:

```text
ActionTimeline (Actieverloop)
├── followup ✓
├── note ✓
├── status_change ✓
├── description_change ✗ (expliciet uitgefilterd)
├── assignment_change ✓
└── ...
```

---

### 2. Header Badge met Wijzigingsaantal

**Huidige situatie:** Beschrijving header toont alleen "Beschrijving"

**Na verbetering:** Header toont aantal wijzigingen als badge

```text
┌────────────────────────────────────────────┐
│  📄 Beschrijving              [3]    [▼]   │
│                               ^^^          │
│                     Nieuwe badge met count │
└────────────────────────────────────────────┘
```

---

### 3. Herstel Functie (Terugzetten)

**Na verbetering:** In de detail dialog krijg je een "Terugzetten" knop

```text
┌─────────────────────────────────────────────┐
│  Beschrijving wijziging                     │
├─────────────────────────────────────────────┤
│  5 feb om 16:12 • Erik • Gewijzigd          │
│                                             │
│  Oude versie:                               │
│  ┌─────────────────────────────────────┐    │
│  │ De oude tekst stond hier...        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Nieuwe versie:                             │
│  ┌─────────────────────────────────────┐    │
│  │ De nieuwe tekst staat hier...      │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Terugzetten naar oude versie]             │
│   ^^^^^^^^^^^^^^^^^^^^^^^^^^^               │
│        Nieuwe knop                          │
└─────────────────────────────────────────────┘
```

---

### 4. Visuele Polish

**Verbeteringen:**
- Subtielere hover animaties consistent met ActionTimeline
- Betere spacing en padding
- Fade-in animatie voor timeline items
- Verbeterde dark mode contrast

---

## Technische Wijzigingen

### Bestanden die aangepast worden:

| Bestand | Wijziging |
|---------|-----------|
| `src/components/ActionTimeline.tsx` | Filter `description_change` expliciet uit |
| `src/components/TaskDetailModal.tsx` | Badge met description history count aan header toevoegen |
| `src/components/DescriptionTimeline.tsx` | Herstel functie + visuele polish |

### DescriptionTimeline uitbreidingen:

1. **Nieuwe prop:** `onDescriptionRestore?: (description: string) => void`
2. **Herstel knop:** In detail dialog met bevestigingsflow
3. **Animaties:** Fade-in voor timeline items
4. **Badge functionaliteit:** Export count voor parent component

### TaskDetailModal wijzigingen:

1. **State voor count:** Bijhouden van description changes count
2. **Badge in header:** Dynamisch tonen van wijzigingsaantal
3. **Callback prop:** Doorgeven aan DescriptionTimeline voor herstel

---

## Implementatie Volgorde

1. Update `ActionTimeline.tsx` - filter expliciet maken
2. Update `DescriptionTimeline.tsx` - herstel functie + polish
3. Update `TaskDetailModal.tsx` - header badge + callback

---

## Geschatte Tijd

| Onderdeel | Tijd |
|-----------|------|
| Filter optimalisatie | 5 min |
| Header badge | 10 min |
| Herstel functie | 20 min |
| Visuele polish | 10 min |
| **Totaal** | ~45 min |

