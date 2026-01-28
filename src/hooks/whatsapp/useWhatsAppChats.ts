import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WhatsAppChat, WhatsAppFilter } from "@/types/whatsapp";

interface UseWhatsAppChatsReturn {
  chats: WhatsAppChat[];
  filteredChats: WhatsAppChat[];
  isLoading: boolean;
  error: Error | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filter: WhatsAppFilter;
  setFilter: (f: WhatsAppFilter) => void;
  stats: {
    totalChats: number;
    unreadChats: number;
    linkedChats: number;
  };
}

export function useWhatsAppChats(): UseWhatsAppChatsReturn {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<WhatsAppFilter>('all');

  const { data: chats = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp-chats'],
    queryFn: async () => {
      // Get user's org_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg?.org_id) return [];

      const { data, error } = await supabase
        .from('whatsapp_chats')
        .select(`
          *,
          contact:whatsapp_contacts!contact_id (*),
          linked_professional:professionals!linked_professional_id (id, full_name)
        `)
        .eq('org_id', userOrg.org_id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as WhatsAppChat[];
    },
  });

  // Apply filters and search
  const filteredChats = useMemo(() => {
    let result = [...chats];

    // Apply filter
    if (filter === 'unread') {
      result = result.filter(chat => chat.unread_count > 0);
    } else if (filter === 'linked') {
      result = result.filter(chat => chat.linked_professional_id !== null);
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

    return result;
  }, [chats, filter, searchQuery]);

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
    stats,
  };
}
