import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WhatsAppGroupMember } from "@/types/whatsapp";

/**
 * Hook om groepsleden op te halen voor een specifieke chat.
 * Retourneert alleen actieve leden (left_at is null).
 */
export function useWhatsAppGroupMembers(chatId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-group-members', chatId],
    queryFn: async (): Promise<WhatsAppGroupMember[]> => {
      if (!chatId) return [];

      const { data, error } = await supabase
        .from('whatsapp_group_members')
        .select(`
          id,
          chat_id,
          member_jid,
          display_name,
          contact_id,
          role,
          is_self,
          joined_at,
          left_at,
          created_at,
          updated_at
        `)
        .eq('chat_id', chatId)
        .is('left_at', null)
        .order('display_name', { ascending: true, nullsFirst: false });

      if (error) {
        console.error('Error fetching group members:', error);
        throw error;
      }

      // Cast de data naar het juiste type
      return (data || []) as WhatsAppGroupMember[];
    },
    enabled: !!chatId,
    staleTime: 30000, // 30 seconden cache
  });
}
