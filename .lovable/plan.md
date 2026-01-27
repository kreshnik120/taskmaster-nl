

# Fix: useTaskMeetingMinutes.ts - Ambigue Foreign Key

## Probleem

**Bestand:** `src/hooks/useTaskMeetingMinutes.ts`  
**Regel:** 15  
**Huidige code:** `tasks!inner(id, title, start_at, due_at)`  
**Error:** `PGRST201` - Ambigue foreign key relatie

Dit is exact dezelfde bug die eerder in `useMeetingMinutes.ts` is gefixt.

---

## Oplossing

**Wijzig regel 15:**

```typescript
// VAN:
tasks!inner(id, title, start_at, due_at)

// NAAR:
tasks!meeting_minutes_task_id_fkey(id, title, start_at, due_at)
```

---

## Impact

| Aspect | Waarde |
|--------|--------|
| Bestand | `src/hooks/useTaskMeetingMinutes.ts` |
| Regel | 15 |
| Wijziging | 1 regel |
| Risico | Laag |
| Effect | Task detail pagina kan weer meeting minutes laden |

---

## Na Fix

Deze hook wordt gebruikt in `TaskMeetingMinutesSection.tsx` om notulen te tonen die gekoppeld zijn aan een specifieke taak. Na de fix werkt deze weergave weer correct.

