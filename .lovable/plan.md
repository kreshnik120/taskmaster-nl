

# Enterprise Task Flow Verfijning - Implementatieplan

## Analyse: Huidige Architectuur

De bestaande codebase is uitstekend gestructureerd met:

| Component | Regels | Verantwoordelijkheid |
|-----------|--------|---------------------|
| `TaskDetailModal.tsx` | 1337 | Centrale taakweergave, host voor alle subsecties |
| `ActionTimeline.tsx` | 1532 | Actieverloop, eigen actie-invoer met assignee-toggle |
| `ProcessTimeline.tsx` | 245 | Subtaken weergave met status-toggles |
| `DescriptionWithDiff.tsx` | 204 | Inline diff-highlighting met 24-uur logica |
| `DescriptionTimeline.tsx` | 459 | Verloop historie met restore-functionaliteit |

### Bestaande Sterke Punten
- `ActionTimeline` heeft al een "Toewijzen aan collega" toggle die subtasks creëert
- `DescriptionWithDiff` en `DescriptionTimeline` zijn gesynchroniseerd via 24-uur threshold
- Realtime subscriptions voor subtasks en action_history
- Keyboard shortcuts (e/c/t) zijn al geïmplementeerd

---

## Verfijningsplan: 4 Fases

### Fase 1: Inline Description Editor

**Doel**: Beschrijving direct bewerkbaar maken zonder TaskDialog te openen

**Nieuw bestand**: `src/components/InlineDescriptionEditor.tsx`

```text
┌────────────────────────────────────────────────────────────────┐
│ 📝 Beschrijving                                    [✏️ hover]  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 11-02 wil ik starten met ingeschreven kandidaten...      │   │
│ │ ▌                                                        │   │  ← Klik = cursor
│ └──────────────────────────────────────────────────────────┘   │
│                                                                │
│ [Ctrl+Enter = Opslaan]  [Escape = Annuleren]  ● Opslaan...     │
└────────────────────────────────────────────────────────────────┘
```

**Functionaliteiten**:
- Hover op beschrijving → Edit icoon verschijnt
- Klik → Inline textarea met auto-resize
- Debounced auto-save (2 seconden idle)
- Ctrl+Enter = direct opslaan
- Escape = annuleren (rollback)
- Visuele feedback: "Opslaan..." indicator
- Triggers bestaande `log_task_description_change` trigger

**Integratie in TaskDetailModal** (regels 1068-1073):
- Vervang statische `DescriptionWithDiff` met clickable wrapper
- State: `descriptionEditing: boolean`
- Behoud `latestDescriptionChange` koppeling

---

### Fase 2: Quick Subtask Input in ProcessTimeline

**Doel**: Subtaken direct toevoegen binnen ProcessTimeline

**Nieuw bestand**: `src/components/QuickSubtaskInput.tsx`

```text
┌────────────────────────────────────────────────────────────────┐
│ 📋 Processtappen (2/4)                                         │
│ ☑ Kandidaat bellen                                             │
│ ○ Documenten opvragen  ← Actief                                │
│ ○ Planning bevestigen                                          │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ + [Nieuwe stap toevoegen...]                               │ │  ← Klik = expandeer
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ Expanded:                                                      │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Titel: [CV doorsturen naar klant          ]                │ │
│ │ @Toewijzen: [Kreshnik ▾]  #Deadline: [📅]                  │ │
│ │                              [Toevoegen] [Annuleren]       │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Functionaliteiten**:
- Compact trigger: "+ Stap toevoegen"
- Expandeert naar inline form
- Optionele toewijzing (@mention pattern)
- Optionele deadline
- Enter = submit
- Insert met `order = max(existing) + 1`

**Aanpassing aan ProcessTimeline.tsx**:
- Voeg `onAddSubtask` prop toe
- Render `QuickSubtaskInput` na laatste subtask
- Prop drilling naar parent voor assignee lookup

---

### Fase 3: Unified Action Hub

**Doel**: Eén centraal invoerpunt voor acties EN subtaken

**Nieuw bestand**: `src/components/UnifiedActionHub.tsx`

```text
┌────────────────────────────────────────────────────────────────┐
│ 🎯 Wat moet er gebeuren?                                       │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ @kreshnik Diploma opvragen #morgen                       │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                │
│ Preview: 📌 Subtaak voor Kreshnik • 📅 Deadline: morgen        │
│                                                                │
│ [+ Actie]  [+ Subtaak]  [@ Toewijzen]                          │
│                                                                │
│ 💡 @naam = toewijzen, /s = subtaak, #morgen = deadline         │
└────────────────────────────────────────────────────────────────┘
```

**Smart Parsing Regels**:

| Pattern | Resultaat | Database |
|---------|-----------|----------|
| `Bel terug` | Eigen actie | `tasks.next_action` |
| `@kreshnik Check docs` | Subtaak toegewezen | `subtasks` |
| `/s Planning checken` | Eigen subtaak | `subtasks` |
| `/n Goed gesprek` | Notitie | `task_action_history` |
| `#morgen` suffix | Deadline toevoegen | `due_at` field |
| `#vandaag` suffix | Deadline vandaag 17:00 | `due_at` field |

**Parser Logica**:
```typescript
interface ParsedAction {
  cleanText: string;
  type: 'action' | 'subtask' | 'note';
  assignee_id: string | null;
  deadline: Date | null;
}

function parseActionInput(text: string, teamMembers: TeamMember[]): ParsedAction
```

**Integratie**:
- Vervangt de huidige add-form in `ActionTimeline`
- Hergebruikt bestaande `teamMembers` state
- Koppelt aan `onActionAdded` en `onSubtaskCompleted` callbacks

---

### Fase 4: Text Selection Menu (Power Feature)

**Doel**: Selecteer tekst in beschrijving → Maak subtaak/actie

**Nieuw bestand**: `src/components/TextSelectionMenu.tsx`

```text
┌────────────────────────────────────────────────────────────────┐
│ Beschrijving:                                                  │
│                                                                │
│ Vandaag gebeld met kandidaat. Ze wil graag:                    │
│ - ████████████████████████████ ← Geselecteerde tekst           │
│ - CV opsturen naar klant                                       │
│                                                                │
│ ┌─────────────────────────────────────────┐                    │
│ │ 📌 Subtaak   📝 Actie   📋 Kopieer   ✖ │ ← Floating menu    │
│ └─────────────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────┘
```

**Implementatie**:
- Custom hook `useTextSelection` voor detectie
- Floating menu met `position: absolute` gebaseerd op selection rect
- Klik "Subtaak" → Prefill QuickSubtaskInput met geselecteerde tekst
- Klik "Actie" → Set als next_action
- Klik "Kopieer" → Navigator clipboard API

---

## Technische Wijzigingen Overzicht

### Nieuwe Bestanden

| Bestand | Regels (est.) | Fase |
|---------|---------------|------|
| `src/components/InlineDescriptionEditor.tsx` | ~120 | 1 |
| `src/components/QuickSubtaskInput.tsx` | ~100 | 2 |
| `src/components/UnifiedActionHub.tsx` | ~200 | 3 |
| `src/components/TextSelectionMenu.tsx` | ~80 | 4 |
| `src/hooks/useTextSelection.ts` | ~40 | 4 |

### Aangepaste Bestanden

| Bestand | Wijziging | Fase |
|---------|-----------|------|
| `TaskDetailModal.tsx` | Integreer InlineDescriptionEditor, UnifiedActionHub | 1, 3 |
| `ProcessTimeline.tsx` | Voeg QuickSubtaskInput toe, nieuwe prop `onAddSubtask` | 2 |
| `DescriptionWithDiff.tsx` | Voeg selection event forwarding toe | 4 |

### Database Impact

**Geen nieuwe tabellen** - Hergebruik bestaande:
- `tasks.description` → Inline editing
- `tasks.next_action` → UnifiedActionHub acties
- `subtasks` → UnifiedActionHub subtaken + QuickSubtaskInput
- `task_action_history` → Notities via `/n` prefix

---

## Klik-Reductie Analyse

| Actie | Nu | Straks | Besparing |
|-------|---:|-------:|----------:|
| Beschrijving bewerken | 3 klikken | **1 klik** | 67% |
| Subtaak toevoegen | 4 klikken | **1 klik** | 75% |
| Actie toevoegen | 2 klikken | **1 klik** | 50% |
| Tekst → Subtaak | 5+ klikken | **2 klikken** | 60% |

---

## Implementatie Volgorde

| Stap | Component | Prioriteit | Reden |
|------|-----------|------------|-------|
| **1** | `InlineDescriptionEditor` | Hoogste | Snelste UX winst, onafhankelijk |
| **2** | `QuickSubtaskInput` | Hoog | Bouwt voort op ProcessTimeline |
| **3** | ProcessTimeline integratie | Hoog | Koppeling Fase 2 |
| **4** | `UnifiedActionHub` | Medium-Hoog | Vervangt deel ActionTimeline |
| **5** | ActionTimeline refactor | Medium | Koppeling Fase 4 |
| **6** | `TextSelectionMenu` + hook | Medium | Power feature |
| **7** | DescriptionWithDiff integratie | Medium | Koppeling Fase 6 |

---

## Bewaarde Functionaliteit

De volgende bestaande features blijven **100% intact**:

- ✅ TaskDialog (3-stappen wizard) voor bulk edits
- ✅ DescriptionTimeline verloop + restore
- ✅ DescriptionWithDiff inline highlighting
- ✅ ActionTimeline filters, zoeken, exporteren
- ✅ ProcessTimeline status toggles
- ✅ Keyboard shortcuts (e/c/t)
- ✅ Realtime updates via Supabase channels
- ✅ Attachment management
- ✅ Interview-specifieke secties

---

## Resultaat: Unified Task Hub

Na implementatie heeft de gebruiker:

1. **Inline Editing** - Beschrijving direct aanpassen met 1 klik
2. **Smart Command Line** - Eén invoer voor alles via @mentions en prefixes
3. **Quick Subtasks** - Stappen toevoegen zonder context-switch
4. **Text-to-Task** - Selecteer → Maak taak in 2 klikken

Dit creëert een **enterprise-niveau workflow** waar de beschrijving de centrale bron is en acties/subtaken daar naadloos uit voortkomen.

