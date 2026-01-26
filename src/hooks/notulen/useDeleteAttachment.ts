import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_ATTACHMENTS_QUERY_KEY } from "./useAttachments";
import { toast } from "sonner";

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteAttachment = useCallback(async (
    attachmentId: string, 
    filePath: string,
    meetingMinuteId?: string
  ): Promise<void> => {
    setIsDeleting(true);
    try {
      // Get meeting_minute_id if not provided
      let minuteId = meetingMinuteId;
      if (!minuteId) {
        const { data: attachment, error: fetchError } = await supabase
          .from('meeting_minute_attachments')
          .select('meeting_minute_id')
          .eq('id', attachmentId)
          .single();

        if (fetchError) throw fetchError;
        minuteId = attachment?.meeting_minute_id;
      }

      // Delete from database first
      const { error: dbError } = await supabase
        .from('meeting_minute_attachments')
        .delete()
        .eq('id', attachmentId);

      if (dbError) throw dbError;

      // Delete from storage (don't fail if storage cleanup fails)
      const { error: storageError } = await supabase.storage
        .from('meeting-attachments')
        .remove([filePath]);

      if (storageError) {
        console.error('Storage cleanup failed:', storageError);
        // Don't throw, database record is already deleted
      }

      // Invalidate query
      if (minuteId) {
        await queryClient.invalidateQueries({ 
          queryKey: [...MEETING_ATTACHMENTS_QUERY_KEY, minuteId] 
        });
      }

      toast.success("Bijlage verwijderd");
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon bijlage niet verwijderen", { description: message });
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, [queryClient]);

  return { deleteAttachment, isDeleting };
}
