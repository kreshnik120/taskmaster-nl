import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WhatsAppMessage } from "@/types/whatsapp";

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

      console.log(`[useWhatsAppSendMessage] Sending via MCP: to=${chatJid}, chatId=${chatId}`);

      // Use MCP proxy to send message via ClawdBot
      const { data, error } = await supabase.functions.invoke('mcp-proxy', {
        body: {
          tool: 'whatsapp_send_message',
          arguments: {
            to: chatJid,           // MCP expects "to" parameter (phone or JID format)
            message: text.trim(),
            chatId: chatId,        // Pass chatId for proper DB persistence
          }
        }
      });

      if (error) {
        console.error('[useWhatsAppSendMessage] MCP proxy error:', error);
        throw new Error(error.message || 'Fout bij versturen bericht');
      }

      // MCP returns { result: { success: boolean, ... } }
      const result = data?.result;
      if (!result?.success && !result?.sent) {
        console.error('[useWhatsAppSendMessage] MCP send failed:', result);
        throw new Error(result?.error || 'Fout bij versturen bericht');
      }

      console.log('[useWhatsAppSendMessage] Message sent successfully via MCP');
      return result;
    },
    onMutate: async (text: string) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['whatsapp-messages', chatId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<WhatsAppMessage[]>(['whatsapp-messages', chatId]);

      // Create optimistic message
      const optimisticMessage: WhatsAppMessage = {
        id: `optimistic_${Date.now()}`,
        org_id: orgId,
        chat_id: chatId,
        message_id: `pending_${Date.now()}`,
        message_type: 'text',
        message_body: text.trim(),
        sender_type: 'user',
        sender_phone: null,
        sent_at: new Date().toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      // Optimistically update to show the new message
      queryClient.setQueryData<WhatsAppMessage[]>(['whatsapp-messages', chatId], (old) => {
        return old ? [...old, optimisticMessage] : [optimisticMessage];
      });

      // Return context object with the snapshotted value
      return { previousMessages, optimisticMessage };
    },
    onSuccess: (_result, _text, context) => {
      // Update the optimistic message status to 'sent'
      queryClient.setQueryData<WhatsAppMessage[]>(['whatsapp-messages', chatId], (old) => {
        if (!old) return old;
        return old.map(msg => 
          msg.id === context?.optimisticMessage.id
            ? { ...msg, status: 'sent' as const }
            : msg
        );
      });
      
      // Invalidate queries to refresh with real data
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
    },
    onError: (error: Error, _text, context) => {
      console.error('[useWhatsAppSendMessage] Mutation error:', error);
      
      // Rollback to previous value or mark message as failed
      if (context?.previousMessages) {
        queryClient.setQueryData(['whatsapp-messages', chatId], context.previousMessages);
      }
      
      toast.error(error.message || 'Kon bericht niet versturen');
    }
  });

  return mutation;
}
