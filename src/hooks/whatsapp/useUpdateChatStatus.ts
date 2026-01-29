import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateChatStatusParams {
  chatId: string;
  field: 'is_pinned' | 'is_muted' | 'is_archived';
  value: boolean;
}

export function useUpdateChatStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, field, value }: UpdateChatStatusParams) => {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ [field]: value })
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: (_, { field, value }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      
      const messages: Record<typeof field, string> = {
        is_pinned: value ? 'Chat gepind' : 'Chat losgemaakt',
        is_muted: value ? 'Chat gedempt' : 'Demping opgeheven',
        is_archived: 'Chat gearchiveerd',
      };
      toast.success(messages[field]);
    },
    onError: (error) => {
      console.error('Failed to update chat status:', error);
      toast.error('Kon chat status niet bijwerken');
    },
  });
}
