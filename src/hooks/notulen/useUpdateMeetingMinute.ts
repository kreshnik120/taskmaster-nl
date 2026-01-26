import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";

export interface UpdateMeetingMinuteInput {
  location?: string | null;
  meeting_link?: string | null;
  next_meeting_date?: string | null;
  content?: string | null;
  status?: 'draft' | 'pending_approval' | 'approved' | 'archived';
}

export function useUpdateMeetingMinute() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateMeetingMinute = async (
    minuteId: string,
    updates: UpdateMeetingMinuteInput
  ): Promise<void> => {
    setIsUpdating(true);
    try {
      const dbUpdates: Record<string, unknown> = { ...updates };

      // Als status naar approved gaat, zet approved_by en approved_at
      if (updates.status === 'approved') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          dbUpdates.approved_by = user.id;
          dbUpdates.approved_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from('meeting_minutes')
        .update(dbUpdates)
        .eq('id', minuteId);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['pending-minutes-count'] }),
        queryClient.invalidateQueries({ queryKey: ['task-meeting-minutes'] }),
      ]);
      
      if (updates.status) {
        // Enhanced status-specific messages
        if (updates.status === 'pending_approval') {
          toast.success("Notulen ingediend ter goedkeuring", {
            description: "Reviewers worden op de hoogte gesteld",
          });
        } else if (updates.status === 'approved') {
          toast.success("Notulen goedgekeurd", {
            description: "De notulen zijn nu definitief",
          });
        } else if (updates.status === 'archived') {
          toast.success("Notulen gearchiveerd");
        } else {
          const statusLabels: Record<string, string> = {
            draft: 'Concept',
            pending_approval: 'Wacht op goedkeuring',
            approved: 'Goedgekeurd',
            archived: 'Gearchiveerd',
          };
          toast.success(`Status gewijzigd naar "${statusLabels[updates.status]}"`);
        }
      } else {
        toast.success("Wijzigingen opgeslagen");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon wijzigingen niet opslaan", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateMeetingMinute, isUpdating };
}
