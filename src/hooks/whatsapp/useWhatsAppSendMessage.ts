import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SendMessageParams {
  chatId: string;
  chatJid: string;
  orgId: string;
}

export function useWhatsAppSendMessage({ chatId, chatJid, orgId }: SendMessageParams) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      if (!text.trim()) {
        throw new Error("Bericht mag niet leeg zijn");
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-bridge', {
        body: {
          event: 'message.send',
          sessionId: 'internal', // Will use server-side secret
          orgId,
          data: {
            chatJid,
            body: text.trim(),
            chatId
          }
        }
      });

      if (error) {
        console.error('[useWhatsAppSendMessage] Error:', error);
        throw new Error(error.message || 'Fout bij versturen bericht');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Fout bij versturen bericht');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh message list and chat list
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
    },
    onError: (error: Error) => {
      console.error('[useWhatsAppSendMessage] Mutation error:', error);
      toast.error(error.message || 'Kon bericht niet versturen');
    }
  });

  return mutation;
}
