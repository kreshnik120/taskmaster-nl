import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      // Delete messages first (cascade niet automatisch)
      await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('chat_id', chatId);
        
      // Delete chat
      const { error } = await supabase
        .from('whatsapp_chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      toast.success('Chat verwijderd');
    },
    onError: (error) => {
      console.error('Failed to delete chat:', error);
      toast.error('Kon chat niet verwijderen');
    },
  });
}
