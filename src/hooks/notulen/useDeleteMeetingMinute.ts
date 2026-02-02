import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const log = logger.create('DeleteMeetingMinute');

export function useDeleteMeetingMinute() {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

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

      const notuleTitle = (minute?.tasks as { title?: string } | null)?.title || 'Onbekende notule';

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
            log.warn(`Could not update task ${task.id}:`, updateError.message);
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
          log.warn('Could not delete linked task:', taskError.message);
        }
      }

      // 8. Invalidate queries en toon success
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['pending-minutes-count'] }),
        queryClient.invalidateQueries({ queryKey: ['task-meeting-minutes'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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

  return { deleteMeetingMinute, isDeleting };
}
