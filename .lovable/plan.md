
# Terugkerende / Herhalende Opdrachten

## Overzicht

Implementatie van herhalende taken: bij het afronden van een taak met een recurrence_rule maakt een database trigger automatisch een nieuwe taak aan.

---

## Wijzigingen

### 1. Database migratie

- 4 kolommen toevoegen aan `tasks`: `recurrence_rule`, `recurrence_assignee_id`, `recurrence_end_at`, `recurrence_parent_id`
- CHECK constraint op `recurrence_rule` (NULL of DAILY/WEEKLY/BIWEEKLY/MONTHLY)
- Trigger `handle_recurring_task()` die bij het zetten van `completed_at` automatisch een nieuwe taak INSERT
- De trigger berekent `due_at`, `start_at`, en `assignee_id` voor de volgende taak

### 2. TaskDialog.tsx - Herhaling sectie in stap 2

- Zod schema uitbreiden met `recurrence_rule`, `recurrence_assignee_id`, `recurrence_end_at`
- Na "Volgende actie", voor "Bijlagen": dropdown "Herhaling" (Geen/Dagelijks/Wekelijks/Tweewekelijks/Maandelijks)
- Conditioneel: "Toewijzen aan bij herhaling" dropdown + "Herhalen tot" datumpicker
- Bij bewerken: recurrence velden laden en voorinvullen
- Bij opslaan: recurrence velden meesturen in INSERT/UPDATE

### 3. useTasksQuery.ts - Type uitbreiding

- 4 velden toevoegen aan Task interface: `recurrence_rule`, `recurrence_assignee_id`, `recurrence_end_at`, `recurrence_parent_id`
- Query haalt al `*` op, data komt automatisch mee

### 4. TaskCard.tsx - Herhaling badge

- Import `Repeat` uit lucide-react
- Na subtask counter: compact Repeat icon met tooltip bij `recurrence_rule !== null`
- Task interface uitbreiden met `recurrence_rule`

### 5. TaskItem.tsx - Herhaling badge

- Zelfde Repeat icon als TaskCard
- Task interface uitbreiden met `recurrence_rule`

### 6. TaskDetailModal.tsx - "Herhaling stoppen" knop

- Na de bestaande action buttons grid (regels 874-946): conditionele extra rij als `task.recurrence_rule` niet null
- Knop met `Repeat` icon + tekst "Herhaling stoppen" + frequentie badge
- AlertDialog bevestiging
- UPDATE `recurrence_rule = NULL` + toast + `onTaskUpdated()`
- Task interface uitbreiden met `recurrence_rule`

---

## Technisch Overzicht

| Onderdeel | Bestand(en) | Type |
|-----------|-------------|------|
| Schema | SQL migratie | 4 kolommen + constraint + trigger |
| Formulier | `TaskDialog.tsx` | Zod schema + UI velden stap 2 |
| Types | `useTasksQuery.ts` | Interface uitbreiding |
| Kanban badge | `TaskCard.tsx` | Repeat icon |
| Lijst badge | `TaskItem.tsx` | Repeat icon |
| Detail modal | `TaskDetailModal.tsx` | Stop-knop + AlertDialog |

## Geen destructieve wijzigingen

- Alle kolommen zijn nullable met DEFAULT NULL
- Bestaande taken worden niet geraakt
- Subtaken worden NIET gekopieerd naar de volgende taak
- RLS werkt automatisch via org_id overerving
