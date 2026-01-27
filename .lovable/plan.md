

# Fix: Ambigue Foreign Key Relatie in useMeetingMinutes

## Probleem Analyse

### Root Cause
Na de Fase 7C database migratie zijn er **twee foreign key relaties** tussen `meeting_minutes` en `tasks`:

| Relatie | Richting | Foreign Key |
|---------|----------|-------------|
| Origineel | `meeting_minutes.task_id → tasks.id` | `meeting_minutes_task_id_fkey` |
| Nieuw (Fase 7C) | `tasks.source_meeting_minute_id → meeting_minutes.id` | `tasks_source_meeting_minute_id_fkey` |

### Error
```
PGRST201: Could not embed because more than one relationship was found for 'meeting_minutes' and 'tasks'
```

PostgREST kan niet bepalen welke relatie te gebruiken bij `tasks!inner`.

---

## Oplossing

### Bestand: `src/hooks/useMeetingMinutes.ts`

**Wijziging**: Specificeer de exacte foreign key in de select query.

**Huidige code (regel 75-86)**:
```typescript
.select(`
  *,
  tasks!inner(id, title, start_at, due_at),
  meeting_attendees(...)
`)
```

**Nieuwe code**:
```typescript
.select(`
  *,
  tasks!meeting_minutes_task_id_fkey(id, title, start_at, due_at),
  meeting_attendees(...)
`)
```

De syntax `tasks!meeting_minutes_task_id_fkey` vertelt PostgREST expliciet om de originele foreign key te gebruiken (meeting_minutes.task_id → tasks.id).

---

## Implementatie Details

| Aspect | Waarde |
|--------|--------|
| Bestand | `src/hooks/useMeetingMinutes.ts` |
| Regel | 77 |
| Wijziging | `tasks!inner` → `tasks!meeting_minutes_task_id_fkey` |
| Impact | Minimaal - alleen de query syntax |
| Risico | Laag - bestaande functionaliteit ongewijzigd |

---

## Verwacht Resultaat

Na deze fix:
- Meeting minutes laden correct
- Teller toont juiste aantallen
- Bestaande notulen zijn weer zichtbaar
- Nieuwe notulen verschijnen direct na aanmaken

---

## Aanvullende Context

De `!inner` modifier kan nog steeds worden toegevoegd als je alleen meeting minutes wilt die een gekoppelde task hebben:

```typescript
tasks!meeting_minutes_task_id_fkey!inner(id, title, start_at, due_at)
```

Echter, omdat `task_id` verplicht is in `meeting_minutes`, is `!inner` technisch gezien niet nodig. De huidige query werkt ook zonder inner join.

