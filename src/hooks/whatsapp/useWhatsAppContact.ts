import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WhatsAppContact } from "@/types/whatsapp";

export function useWhatsAppContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-contact', contactId],
    queryFn: async (): Promise<WhatsAppContact | null> => {
      if (!contactId) return null;

      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', contactId)
        .maybeSingle();

      if (error) {
        console.error('[useWhatsAppContact] Fetch error:', error);
        throw error;
      }

      return data;
    },
    enabled: !!contactId,
    staleTime: 30000, // 30 seconds
  });
}
