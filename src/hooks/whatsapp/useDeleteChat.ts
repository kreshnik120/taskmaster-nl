import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useDeleteChat() {
  const queryClient = useQueryClient();

  const undoMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ 
          is_archived: false, 
          deleted_at: null 
        })
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      toast.success('Chat hersteld');
    },
    onError: (error) => {
      console.error('Failed to restore chat:', error);
      toast.error('Kon chat niet herstellen');
    },
  });

  return useMutation({
    mutationFn: async (chatId: string) => {
      // Soft delete: set is_archived = true, deleted_at = now()
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ 
          is_archived: true, 
          deleted_at: new Date().toISOString() 
        })
        .eq('id', chatId);

      if (error) throw error;
      return chatId;
    },
    onSuccess: (chatId) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      
      // Toast met undo actie (5 seconden)
      toast.success('Chat gearchiveerd', {
        duration: 5000,
        action: {
          label: 'Ongedaan maken',
          onClick: () => undoMutation.mutate(chatId),
        },
      });
    },
    onError: (error) => {
      console.error('Failed to archive chat:', error);
      toast.error('Kon chat niet archiveren');
    },
  });
}
