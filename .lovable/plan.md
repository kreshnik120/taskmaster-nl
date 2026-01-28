
# Fix: Notule Verwijderen met Audit Trail

## Probleem Analyse

De huidige `useDeleteMeetingMinute` hook faalt wanneer taken gekoppeld zijn via `source_meeting_minute_id` door een foreign key constraint. Daarnaast wordt de foutmelding niet specifiek getoond ("Onbekende fout").

**Huidige Code Problemen:**
1. De hook probeert direct de meeting minute te verwijderen zonder eerst gekoppelde taken te ontkoppelen
2. Foreign key `tasks_source_meeting_minute_id_fkey` blokkeert de delete
3. Error handling is te generiek

---

## Implementatie Plan

### Bestand: `src/hooks/notulen/useDeleteMeetingMinute.ts`

**Volledige Herschrijving** met de volgende logica:

```text
1. Haal notule info op inclusief task title (voor audit trail)
2. Haal huidige user op (voor audit trail)
3. Vind alle taken gekoppeld via source_meeting_minute_id
4. Voor elke gekoppelde taak:
   - Zet source_meeting_minute_id op null
   - Voeg audit trail tekst toe aan description
5. Verwijder de meeting minute (attendees cascade via FK)
6. Verwijder de gekoppelde meeting task (task_id)
7. Invalidate queries
8. Toon success toast met aantal ontkoppelde taken
```

**Code Wijzigingen:**

```typescript
const deleteMeetingMinute = async (minuteId: string): Promise<void> => {
  setIsDeleting(true);
  try {
    // 1. Haal notule info op voor audit trail (inclusief task title)
    const { data: minute, error: fetchError } = await supabase
      .from('meeting_minutes')
      .select('task_id, tasks!meeting_minutes_task_id_fkey(title)')
      .eq('id', minuteId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const notuleTitle = minute?.tasks?.title || 'Onbekende notule';

    // 2. Haal huidige user op voor audit trail
    const { data: { user } } = await supabase.auth.getUser();
    const deletedBy = user?.email || user?.user_metadata?.name || 'Onbekend';

    // 3. Maak audit trail tekst
    const now = new Date();
    const auditText = `

⚠️ BRON VERWIJDERD
────────────────────────────────────────
Notule: "${notuleTitle}"
Verwijderd op: ${now.toLocaleDateString('nl-NL')} ${now.toLocaleTimeString('nl-NL')}
Verwijderd door: ${deletedBy}`;

    // 4. Vind alle gekoppelde taken via source_meeting_minute_id
    const { data: linkedTasks, error: findError } = await supabase
      .from('tasks')
      .select('id, description')
      .eq('source_meeting_minute_id', minuteId);

    if (findError) throw findError;

    // 5. Update elke gekoppelde taak: ontkoppel en voeg audit trail toe
    if (linkedTasks && linkedTasks.length > 0) {
      for (const task of linkedTasks) {
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            source_meeting_minute_id: null,
            description: (task.description || '') + auditText
          })
          .eq('id', task.id);

        if (updateError) {
          console.warn(`Could not update task ${task.id}:`, updateError.message);
        }
      }
    }

    // 6. Delete meeting_minutes (attendees cascade automatisch via FK)
    const { error: minuteError } = await supabase
      .from('meeting_minutes')
      .delete()
      .eq('id', minuteId);

    if (minuteError) throw minuteError;

    // 7. Delete gekoppelde meeting task
    if (minute?.task_id) {
      const { error: taskError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', minute.task_id)
        .eq('category', 'meeting');

      if (taskError) {
        console.warn('Could not delete linked task:', taskError.message);
      }
    }

    // 8. Invalidate queries en toon success
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['pending-minutes-count'] }),
      queryClient.invalidateQueries({ queryKey: ['task-meeting-minutes'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }), // Ook tasks refreshen!
    ]);
    
    const linkedCount = linkedTasks?.length || 0;
    const message = linkedCount > 0 
      ? `Notulen verwijderd. ${linkedCount} ${linkedCount === 1 ? 'taak' : 'taken'} ontkoppeld.`
      : 'Notulen verwijderd';
    toast.success(message);
  } catch (error: unknown) {
    // Verbeterde error handling met meer context
    let message = 'Onbekende fout';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'object' && error !== null) {
      const pgError = error as { message?: string; code?: string; details?: string };
      message = pgError.message || pgError.details || 'Database fout';
      if (pgError.code) {
        message = `[${pgError.code}] ${message}`;
      }
    }
    toast.error("Kon notulen niet verwijderen", { description: message });
    throw error;
  } finally {
    setIsDeleting(false);
  }
};
```

---

## Audit Trail Voorbeeld

Wanneer een notule "Team Overleg 2026-01-28" wordt verwijderd, krijgt elke gekoppelde taak deze tekst onderaan de description:

```text
⚠️ BRON VERWIJDERD
────────────────────────────────────────
Notule: "Team Overleg 2026-01-28"
Verwijderd op: 28-1-2026 10:35:42
Verwijderd door: k.atashi@citozorg.nl
```

---

## Wijzigingen Samenvatting

| Onderdeel | Wijziging |
|-----------|-----------|
| Query notule | Uitgebreid met `tasks!meeting_minutes_task_id_fkey(title)` |
| User ophalen | Toegevoegd voor audit trail |
| Gekoppelde taken | Opzoeken via `source_meeting_minute_id` |
| Ontkoppeling | `source_meeting_minute_id = null` + audit tekst |
| Query invalidatie | `['tasks']` key toegevoegd |
| Success toast | Telt ontkoppelde taken |
| Error handling | Verbeterd met Postgres error code parsing |

---

## Technische Details

- **Geen database migratie nodig** - alleen applicatielogica
- **Audit trail is append-only** - komt onder bestaande description
- **Parallel updates niet nodig** - sequential is veiliger voor foutafhandeling
- **Nederlandse formatting** - `toLocaleDateString('nl-NL')` en `toLocaleTimeString('nl-NL')`

---

## Test Scenario's

1. **Notule zonder gekoppelde taken**
   - Verwacht: Direct verwijderen, toast "Notulen verwijderd"

2. **Notule met 1 gekoppelde taak**
   - Verwacht: Taak behouden, audit trail toegevoegd, toast "Notulen verwijderd. 1 taak ontkoppeld."

3. **Notule met meerdere gekoppelde taken**
   - Verwacht: Alle taken behouden, audit trail toegevoegd, toast "Notulen verwijderd. X taken ontkoppeld."

4. **RLS block**
   - Verwacht: Duidelijke foutmelding met Postgres code
