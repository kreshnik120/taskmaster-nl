import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import type { WhatsAppMessage, MessageGroup } from "@/types/whatsapp";
import { logger } from "@/lib/logger";

const log = logger.create('WhatsAppMessages');

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

      // Map database records to WhatsAppMessage type
      const messages: WhatsAppMessage[] = (data ?? []).map((msg) => ({
        id: msg.id,
        org_id: msg.org_id,
        chat_id: msg.chat_id,
        message_id: msg.message_id,
        message_type: msg.message_type as WhatsAppMessage['message_type'],
        message_body: msg.message_body,
        sender_type: msg.sender_type as WhatsAppMessage['sender_type'],
        sender_phone: msg.sender_phone,
        sent_at: msg.sent_at,
        status: msg.status as WhatsAppMessage['status'],
        created_at: msg.created_at,
        // Nieuwe velden voor groepsberichten en quotes
        sender_jid: msg.sender_jid,
        sender_name: msg.sender_name,
        quoted_message_id: msg.quoted_message_id,
        quoted_message_preview: msg.quoted_message_preview,
        // Map media with required fields
        media: msg.media?.map((m: { id: string; file_name: string; file_type: string; mime_type: string; storage_url: string }) => ({
          id: m.id,
          org_id: msg.org_id,
          message_id: msg.id,
          file_name: m.file_name,
          file_type: m.file_type,
          file_size_bytes: null,
          mime_type: m.mime_type,
          storage_bucket: 'whatsapp-media',
          storage_path: '',
          storage_url: m.storage_url,
          created_at: msg.created_at,
        })),
      }));
      
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

  // Realtime subscription for new messages AND status updates
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
            
            // DEDUPLICATION: Check if this message already exists in the cache
            // This handles both:
            // 1. Exact duplicates (same ID)
            // 2. Optimistic messages that need to be replaced with real data
            let optimisticFound = false;
            let exactDuplicate = false;
            
            for (const page of old.pages) {
              for (const msg of page.messages) {
                // Exact duplicate by ID or message_id
                if (msg.id === newMessage.id || msg.message_id === newMessage.message_id) {
                  exactDuplicate = true;
                  break;
                }
                // Optimistic message match (same body and chat)
                if (msg.id.startsWith('optimistic_') && 
                    msg.message_body === newMessage.message_body &&
                    msg.chat_id === newMessage.chat_id) {
                  optimisticFound = true;
                  break;
                }
              }
              if (exactDuplicate || optimisticFound) break;
            }
            
            // Skip exact duplicates
            if (exactDuplicate) {
              log.debug('Skipping exact duplicate:', newMessage.id);
              return old;
            }
            
            // Replace optimistic message with real data
            if (optimisticFound) {
              log.debug('Replacing optimistic message with real data:', newMessage.id);
              const updatedPages = old.pages.map(page => ({
                ...page,
                messages: page.messages.map(msg => {
                  if (msg.id.startsWith('optimistic_') && 
                      msg.message_body === newMessage.message_body &&
                      msg.chat_id === newMessage.chat_id) {
                    return newMessage; // Replace with real data
                  }
                  return msg;
                })
              }));
              return { ...old, pages: updatedPages };
            }
            
            // New message - add to first page
            const updatedPages = [...old.pages];
            if (updatedPages.length > 0) {
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
      // Listen for status updates (read receipts)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const updatedMessage = payload.new as WhatsAppMessage;
        
        // Update message status in cache
        queryClient.setQueryData<{ pages: PageResult[]; pageParams: number[] }>(
          ['whatsapp-messages', chatId],
          (old) => {
            if (!old) return old;
            
            const updatedPages = old.pages.map(page => ({
              ...page,
              messages: page.messages.map(msg => {
                if (msg.id === updatedMessage.id) {
                  return { ...msg, status: updatedMessage.status };
                }
                return msg;
              })
            }));
            
            return { ...old, pages: updatedPages };
          }
        );
        
        log.debug('Message status updated:', updatedMessage.id, '->', updatedMessage.status);
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
