import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import type { WhatsAppMessage, MessageGroup } from "@/types/whatsapp";

function groupMessagesByDate(messages: WhatsAppMessage[]): MessageGroup[] {
  const groups: Map<string, MessageGroup> = new Map();

  messages.forEach(message => {
    const date = parseISO(message.sent_at);
    const dateKey = format(date, 'yyyy-MM-dd');

    if (!groups.has(dateKey)) {
      let label: string;
      if (isToday(date)) {
        label = 'Vandaag';
      } else if (isYesterday(date)) {
        label = 'Gisteren';
      } else {
        label = format(date, 'd MMMM', { locale: nl });
      }

      groups.set(dateKey, {
        date,
        label,
        messages: [],
      });
    }

    groups.get(dateKey)!.messages.push(message);
  });

  return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

interface UseWhatsAppMessagesReturn {
  messages: WhatsAppMessage[];
  groupedByDate: MessageGroup[];
  isLoading: boolean;
  error: Error | null;
}

export function useWhatsAppMessages(chatId: string | null): UseWhatsAppMessagesReturn {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp-messages', chatId],
    queryFn: async () => {
      if (!chatId) return [];

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(`
          *,
          media:whatsapp_media(
            id,
            file_name,
            file_type,
            mime_type,
            storage_url
          )
        `)
        .eq('chat_id', chatId)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as WhatsAppMessage[];
    },
    enabled: !!chatId,
  });

  // Group messages by date
  const groupedByDate = useMemo(() => {
    return groupMessagesByDate(messages);
  }, [messages]);

  // Auto mark-as-read when chat is opened
  useEffect(() => {
    if (!chatId) return;

    // Update unread_count to 0
    supabase
      .from('whatsapp_chats')
      .update({ unread_count: 0 })
      .eq('id', chatId)
      .then(() => {
        // Invalidate unread count queries
        queryClient.invalidateQueries({ queryKey: ['whatsapp-unread-total'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      });
  }, [chatId, queryClient]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`whatsapp-messages-${chatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        queryClient.setQueryData<WhatsAppMessage[]>(
          ['whatsapp-messages', chatId],
          (old) => old ? [...old, payload.new as WhatsAppMessage] : [payload.new as WhatsAppMessage]
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  return {
    messages,
    groupedByDate,
    isLoading,
    error: error as Error | null,
  };
}
