

# Analyse: Taaktoewijzing, Acceptatie & Zichtbaarheid

## Gevonden Problemen (3 kernissues)

### Probleem 1: `reporter_id` wordt NOOIT ingevuld
**Ernst: Hoog**

De database heeft een `reporter_id` kolom (wie de taak aanmaakt/toewijst). Maar de `TaskDialog` (het formulier waarmee taken worden aangemaakt) **vult dit veld nooit in**. In de database staan alle 20+ recente taken met `reporter_id: null`.

Gevolg: je kunt NOOIT zien wie een taak heeft aangemaakt of toegewezen aan iemand anders.

**Waar het misgaat** (TaskDialog.tsx, regel 300-320):
```text
// Huidige code — reporter_id ontbreekt volledig:
const insertData = {
  title, description, priority,
  assignee_id,        // ← wie de taak krijgt
  // reporter_id ← ONTBREEKT! Wordt nooit meegegeven
  accepted_by, accepted_at,
  ...
};
```

**Fix**: Bij het aanmaken van een nieuwe taak moet `reporter_id: currentUser.id` worden meegezet.

---

### Probleem 2: TaskDetailModal haalt reporter-naam niet op
**Ernst: Medium**

De `TaskDetailModal` toont "Aangemaakt door" info (regel 1149-1165), maar ALLEEN als `task.reporter_id` gevuld is EN als `task.reporter` (de JOIN) beschikbaar is. Maar:
- `reporter_id` is altijd null (probleem 1)
- De meeste queries die taken ophalen doen **geen JOIN** op `reporter_id → profiles`

De `MyTasksFlowSection` haalt taken op met:
```text
profiles:profiles!tasks_assignee_id_fkey(name, email)
```
Dit haalt alleen de **assignee** naam op, niet de **reporter** naam.

**Fix**: Alle task-queries moeten een extra JOIN toevoegen:
```text
reporter:profiles!tasks_reporter_id_fkey(name, email)
```

---

### Probleem 3: Taken WEL zichtbaar, maar acceptatie-flow onduidelijk
**Ernst: Medium**

De taak-zichtbaarheid werkt technisch correct:
- RLS policy: taken zijn zichtbaar voor alle users in dezelfde organisatie
- `MyTasksFlowSection` filtert op `assignee_id = user.id` — als een taak aan jou is toegewezen, verschijnt hij

De acceptatie-flow werkt ook, maar met haken en ogen:
- De `TaskCard` toont een "Wacht op acceptatie" badge + accepteerknop als `accepted_at` null is
- MAAR: als iemand zelf een taak aanmaakt voor zichzelf, wordt die automatisch geaccepteerd (auto-accept logica regel 271-278 in TaskDialog)
- Als iemand anders een taak voor jou maakt, is `accepted_at` null → je ziet de accepteerknop

**Mogelijke oorzaak "taak niet zichtbaar"**: Als de taak vandaag is gemaakt maar de pagina niet ververst, en de realtime channel een error had (wat we in de console logs zien: `[mytasks-flow-realtime] Channel error`), dan verschijnt de taak niet totdat je de pagina herlaadt.

---

## Oplossingsplan

### Stap 1: `reporter_id` invullen bij aanmaken taak
**Bestand**: `src/components/TaskDialog.tsx`
- In de `onSubmit` functie, bij het INSERT-blok, `reporter_id: currentUser?.id` toevoegen aan `insertData`
- Bij update: reporter_id niet wijzigen (die blijft staan)

### Stap 2: Reporter-naam ophalen in alle task-queries
**Bestanden** (4 stuks):
- `src/components/dashboard/MyTasksFlowSection.tsx` (regel 270-276) — voeg `reporter:profiles!tasks_reporter_id_fkey(name, email)` toe aan de select
- `src/components/dashboard/EmbeddedListView.tsx` (regel 164-184) — idem
- `src/hooks/useTasksQuery.ts` (regel 82-100) — idem (shared cache voor Dashboard/Opvolging)
- `src/components/dashboard/MyWeekCalendarSection.tsx` (regel 232-235) — idem

### Stap 3: Reporter tonen in TaskCard en lijstweergaven
**Bestanden**:
- `src/components/TaskCard.tsx` — interface uitbreiden met `reporter_id` en `reporter`, toon "Toegewezen door [naam]" als `reporter_id !== assignee_id`
- `src/components/dashboard/EmbeddedListCards.tsx` — idem voor de mobiele kaartweergave

### Stap 4: Interfaces bijwerken
**Bestanden**:
- `src/components/dashboard/MyTasksFlowSection.tsx` — Task interface uitbreiden
- `src/hooks/useTasksQuery.ts` — Task interface uitbreiden
- `src/components/TaskCard.tsx` — Task interface uitbreiden

### Stap 5: Bulk-fix bestaande taken (optioneel)
Alle bestaande taken hebben `reporter_id = null`. Dit kan niet automatisch hersteld worden (we weten niet achteraf wie welke taak aanmaakte). Vanaf nu wordt het wel correct bijgehouden.

---

## Samenvatting per probleem

| Probleem | Oorzaak | Impact | Fix |
|---|---|---|---|
| Niet zichtbaar wie taak heeft toegekend | `reporter_id` wordt nooit ingevuld in TaskDialog | Niemand weet wie een taak heeft gedelegeerd | `reporter_id: currentUser.id` toevoegen bij INSERT |
| "Aangemaakt door" altijd leeg in detail modal | Queries doen geen JOIN op reporter | Info beschikbaar in DB maar niet opgehaald | JOIN toevoegen in 4 queries |
| Taak soms niet zichtbaar na aanmaken | Realtime channel errors (zichtbaar in console logs) + pagina niet ververst | Taken bestaan in DB maar UI updatet niet | Realtime channel error handling verbeteren + reporter info toont context |

