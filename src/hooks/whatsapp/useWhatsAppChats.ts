import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WhatsAppChat, WhatsAppFilter, WhatsAppContact } from "@/types/whatsapp";

interface UseWhatsAppChatsReturn {
  chats: WhatsAppChat[];
  filteredChats: WhatsAppChat[];
  isLoading: boolean;
  error: Error | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filter: WhatsAppFilter;
  setFilter: (f: WhatsAppFilter) => void;
  tagFilter: string | null;
  setTagFilter: (tag: string | null) => void;
  availableTags: string[];
  stats: {
    totalChats: number;
    unreadChats: number;
    linkedChats: number;
  };
}

// Transform MCP chat response to WhatsAppChat interface
function mapMCPChatToWhatsAppChat(mcpChat: Record<string, unknown>): WhatsAppChat {
  const contact = mcpChat.contact as Record<string, unknown> | undefined;
  
  return {
    id: mcpChat.id as string,
    org_id: mcpChat.orgId as string || mcpChat.org_id as string,
    session_id: mcpChat.sessionId as string || mcpChat.session_id as string,
    contact_id: mcpChat.contactId as string || mcpChat.contact_id as string || null,
    chat_jid: mcpChat.jid as string || mcpChat.chat_jid as string,
    chat_type: (mcpChat.isGroup ? 'group' : (mcpChat.chat_type === 'group' ? 'group' : 'direct')) as 'direct' | 'group',
    unread_count: (mcpChat.unread as number) || (mcpChat.unread_count as number) || 0,
    last_message_at: mcpChat.lastMessageAt as string || mcpChat.last_message_at as string || null,
    last_message_preview: mcpChat.lastMessage as string || mcpChat.last_message_preview as string || null,
    linked_professional_id: mcpChat.linkedProfessionalId as string || mcpChat.linked_professional_id as string || null,
    is_pinned: (mcpChat.isPinned as boolean) ?? (mcpChat.is_pinned as boolean) ?? false,
    is_muted: (mcpChat.isMuted as boolean) ?? (mcpChat.is_muted as boolean) ?? false,
    is_archived: (mcpChat.isArchived as boolean) ?? (mcpChat.is_archived as boolean) ?? false,
    deleted_at: mcpChat.deleted_at as string || null,
    created_at: mcpChat.createdAt as string || mcpChat.created_at as string || new Date().toISOString(),
    updated_at: mcpChat.updatedAt as string || mcpChat.updated_at as string || new Date().toISOString(),
    contact: contact ? {
      id: contact.id as string,
      org_id: mcpChat.orgId as string || mcpChat.org_id as string,
      session_id: mcpChat.sessionId as string || mcpChat.session_id as string,
      phone_number: contact.phone as string || contact.phone_number as string || mcpChat.phone as string,
      display_name: contact.name as string || contact.display_name as string || mcpChat.name as string || null,
      push_name: contact.pushName as string || contact.push_name as string || null,
      profile_picture_url: contact.profilePicture as string || contact.profile_picture_url as string || null,
      professional_id: contact.professional_id as string || null,
      created_at: contact.createdAt as string || contact.created_at as string || new Date().toISOString(),
      updated_at: contact.updatedAt as string || contact.updated_at as string || new Date().toISOString(),
      tags: (contact.tags as string[]) || [],
      contact_notes: contact.notes as string || contact.contact_notes as string || null,
      is_business_account: (contact.isBusiness as boolean) ?? (contact.is_business_account as boolean) ?? false,
    } as WhatsAppContact : null,
    linked_professional: mcpChat.linked_professional as { id: string; full_name: string } || null,
  };
}

export function useWhatsAppChats(): UseWhatsAppChatsReturn {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<WhatsAppFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const { data: chats = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp-chats'],
    queryFn: async () => {
      // Call MCP proxy to get chats from ClawdBot
      const { data, error } = await supabase.functions.invoke('mcp-proxy', {
        body: {
          tool: 'whatsapp_get_chats',
          arguments: {
            limit: 100,
            offset: 0,
            unread_only: false
          }
        }
      });

      if (error) {
        console.error('[useWhatsAppChats] MCP proxy error:', error);
        throw new Error(error.message || 'Failed to fetch chats from MCP');
      }

      // MCP returns { result: [...chats] } or { result: { chats: [...] } }
      const chatsArray = Array.isArray(data?.result) 
        ? data.result 
        : (data?.result?.chats || []);
      
      console.log(`[useWhatsAppChats] Received ${chatsArray.length} chats from MCP`);
      
      return chatsArray.map(mapMCPChatToWhatsAppChat) as WhatsAppChat[];
    },
  });

  // Apply filters and search
  const filteredChats = useMemo(() => {
    let result = [...chats];

    // Filter archived chats (unless specifically viewing archived)
    result = result.filter(chat => !chat.is_archived);

    // Apply filter
    if (filter === 'unread') {
      result = result.filter(chat => chat.unread_count > 0);
    } else if (filter === 'linked') {
      result = result.filter(chat => chat.linked_professional_id !== null);
    }

    // Apply tag filter
    if (tagFilter) {
      result = result.filter(chat => 
        chat.contact?.tags?.includes(tagFilter)
      );
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(chat => {
        const contactName = chat.contact?.display_name?.toLowerCase() ?? '';
        const phoneNumber = chat.contact?.phone_number?.toLowerCase() ?? '';
        const preview = chat.last_message_preview?.toLowerCase() ?? '';
        return contactName.includes(query) || phoneNumber.includes(query) || preview.includes(query);
      });
    }

    // Sort: pinned chats first, then by last_message_at
    result.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return 0; // Maintain DB order (last_message_at) for same pin status
    });

    return result;
  }, [chats, filter, tagFilter, searchQuery]);

  // Get all unique tags used across contacts
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    chats.forEach(chat => {
      chat.contact?.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet);
  }, [chats]);

  // Calculate stats
  const stats = useMemo(() => ({
    totalChats: chats.length,
    unreadChats: chats.filter(c => c.unread_count > 0).length,
    linkedChats: chats.filter(c => c.linked_professional_id !== null).length,
  }), [chats]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-chats-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_chats',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    chats,
    filteredChats,
    isLoading,
    error: error as Error | null,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    tagFilter,
    setTagFilter,
    availableTags,
    stats,
  };
}
