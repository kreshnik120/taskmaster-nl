import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import type { WhatsAppMessage, MessageGroup } from "@/types/whatsapp";

const PAGE_SIZE = 50;

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

interface PageResult {
  messages: WhatsAppMessage[];
  nextCursor: number | null;
}

interface UseWhatsAppMessagesReturn {
  messages: WhatsAppMessage[];
  groupedByDate: MessageGroup[];
  isLoading: boolean;
  error: Error | null;
  loadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

export function useWhatsAppMessages(chatId: string | null): UseWhatsAppMessagesReturn {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery<PageResult, Error>({
    queryKey: ['whatsapp-messages', chatId],
    queryFn: async ({ pageParam }) => {
      if (!chatId) return { messages: [], nextCursor: null };

      const offset = pageParam as number;
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
        .order('sent_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      const messages = (data ?? []) as WhatsAppMessage[];
      
      return {
        // Reverse to get chronological order within the page
        messages: messages.reverse(),
        nextCursor: messages.length === PAGE_SIZE ? offset + PAGE_SIZE : null
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    enabled: !!chatId,
  });

  // Flatten pages into a single messages array
  // Pages are in reverse chronological order, so we need to reverse the order of pages
  const messages = useMemo(() => {
    if (!data?.pages) return [];
    
    const allMessages: WhatsAppMessage[] = [];
    // Iterate pages in reverse (oldest first)
    for (let i = data.pages.length - 1; i >= 0; i--) {
      allMessages.push(...data.pages[i].messages);
    }
    return allMessages;
  }, [data?.pages]);

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
        // Add new message to the first page (most recent)
        queryClient.setQueryData<{ pages: PageResult[]; pageParams: number[] }>(
          ['whatsapp-messages', chatId],
          (old) => {
            if (!old) return old;
            
            const newMessage = payload.new as WhatsAppMessage;
            const updatedPages = [...old.pages];
            
            if (updatedPages.length > 0) {
              // Add to the end of the first page (which is the most recent after flattening)
              updatedPages[0] = {
                ...updatedPages[0],
                messages: [...updatedPages[0].messages, newMessage]
              };
            }
            
            return {
              ...old,
              pages: updatedPages
            };
          }
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return {
    messages,
    groupedByDate,
    isLoading,
    error: error as Error | null,
    loadMore,
    hasMore: !!hasNextPage,
    isLoadingMore: isFetchingNextPage,
  };
}
