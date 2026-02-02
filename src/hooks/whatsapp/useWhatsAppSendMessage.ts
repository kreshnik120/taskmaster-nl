import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WhatsAppMessage } from "@/types/whatsapp";
import { logger } from "@/lib/logger";

const log = logger.create('WhatsAppSendMessage');

interface SendMessageParams {
  chatId: string;
  chatJid: string;
  orgId: string;
}

// Match the InfiniteQuery structure from useWhatsAppMessages
interface PageResult {
  messages: WhatsAppMessage[];
  nextCursor: number | null;
}

interface InfiniteData {
  pages: PageResult[];
  pageParams: number[];
}

export function useWhatsAppSendMessage({ chatId, chatJid, orgId }: SendMessageParams) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      if (!text.trim()) {
        throw new Error("Bericht mag niet leeg zijn");
      }

      log.debug(`Sending via MCP: to=${chatJid}, chatId=${chatId}`);

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

      log.debug('Message sent successfully via MCP');
      return result;
    },
    onMutate: async (text: string) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['whatsapp-messages', chatId] });

      // Snapshot the previous value (InfiniteData structure)
      const previousData = queryClient.getQueryData<InfiniteData>(['whatsapp-messages', chatId]);

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

      // Optimistically update using InfiniteData structure
      queryClient.setQueryData<InfiniteData>(['whatsapp-messages', chatId], (old) => {
        if (!old?.pages?.length) {
          // If no pages exist yet, create initial structure
          return {
            pages: [{ messages: [optimisticMessage], nextCursor: null }],
            pageParams: [0]
          };
        }
        
        // Add message to the first page (most recent messages)
        const updatedPages = [...old.pages];
        updatedPages[0] = {
          ...updatedPages[0],
          messages: [...updatedPages[0].messages, optimisticMessage]
        };
        
        return { ...old, pages: updatedPages };
      });

      // Return context object with the snapshotted value
      return { previousData, optimisticMessage };
    },
    onSuccess: (_result, _text, context) => {
      // Update the optimistic message status to 'sent'
      queryClient.setQueryData<InfiniteData>(['whatsapp-messages', chatId], (old) => {
        if (!old?.pages?.length) return old;
        
        const updatedPages = old.pages.map(page => ({
          ...page,
          messages: page.messages.map(msg => 
            msg.id === context?.optimisticMessage.id
              ? { ...msg, status: 'sent' as const }
              : msg
          )
        }));
        
        return { ...old, pages: updatedPages };
      });
      
      // Invalidate queries to refresh with real data
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
    },
    onError: (error: Error, _text, context) => {
      console.error('[useWhatsAppSendMessage] Mutation error:', error);
      
      // Rollback to previous value with correct InfiniteData structure
      if (context?.previousData) {
        queryClient.setQueryData(['whatsapp-messages', chatId], context.previousData);
      }
      
      toast.error(error.message || 'Kon bericht niet versturen');
    }
  });

  return mutation;
}
