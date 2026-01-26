import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";

export function useDeleteMeetingMinute() {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMeetingMinute = async (minuteId: string): Promise<void> => {
    setIsDeleting(true);
    try {
      // 1. Haal task_id op voordat we deleten
      const { data: minute, error: fetchError } = await supabase
        .from('meeting_minutes')
        .select('task_id')
        .eq('id', minuteId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // 2. Delete meeting_minutes (attendees cascade automatisch via FK)
      const { error: minuteError } = await supabase
        .from('meeting_minutes')
        .delete()
        .eq('id', minuteId);

      if (minuteError) throw minuteError;

      // 3. Delete gekoppelde task (meeting task heeft geen andere purpose)
      if (minute?.task_id) {
        const { error: taskError } = await supabase
          .from('tasks')
          .delete()
          .eq('id', minute.task_id)
          .eq('category', 'meeting'); // Safety check - only delete meeting tasks

        // Don't throw on task delete error - minute is already deleted
        if (taskError) {
          console.warn('Could not delete linked task:', taskError.message);
        }
      }

      // Invalidate all relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['pending-minutes-count'] }),
        queryClient.invalidateQueries({ queryKey: ['task-meeting-minutes'] }),
      ]);
      
      toast.success("Notulen verwijderd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon notulen niet verwijderen", { description: message });
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteMeetingMinute, isDeleting };
}
