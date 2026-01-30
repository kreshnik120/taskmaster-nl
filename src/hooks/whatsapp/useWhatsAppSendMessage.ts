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

      console.log(`[useWhatsAppSendMessage] Sending via MCP: to=${chatJid}`);

      // Use MCP proxy to send message via ClawdBot
      const { data, error } = await supabase.functions.invoke('mcp-proxy', {
        body: {
          tool: 'whatsapp_send_message',
          arguments: {
            to: chatJid,           // MCP expects "to" parameter (phone or JID format)
            message: text.trim()
          }
        }
      });

      if (error) {
        console.error('[useWhatsAppSendMessage] MCP proxy error:', error);
        throw new Error(error.message || 'Fout bij versturen bericht');
      }

      // MCP returns { result: { success: boolean, ... } }
      const result = data?.result;
      if (!result?.success) {
        console.error('[useWhatsAppSendMessage] MCP send failed:', result);
        throw new Error(result?.error || 'Fout bij versturen bericht');
      }

      console.log('[useWhatsAppSendMessage] Message sent successfully via MCP');
      return result;
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
