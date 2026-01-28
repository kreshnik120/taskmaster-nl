import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useWhatsAppUnreadCount() {
  const queryClient = useQueryClient();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['whatsapp-unread-total'],
    queryFn: async () => {
      // Get user's org_id first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg?.org_id) return 0;

      // Sum all unread counts for the org
      const { data: chats } = await supabase
        .from('whatsapp_chats')
        .select('unread_count')
        .eq('org_id', userOrg.org_id)
        .gt('unread_count', 0);

      return chats?.reduce((sum, chat) => sum + (chat.unread_count || 0), 0) ?? 0;
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Realtime subscription for chat updates
  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-unread-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_chats',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-unread-total'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return unreadCount;
}
