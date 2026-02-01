import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { WhatsAppContact } from "@/types/whatsapp";

interface UseSearchContactsOptions {
  query: string;
  enabled?: boolean;
}

export function useSearchContacts({ query, enabled = true }: UseSearchContactsOptions) {
  // Debounce de query met 300ms
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  
  // Alleen zoeken als query >= 2 karakters
  const shouldSearch = enabled && debouncedQuery.length >= 2;

  return useQuery({
    queryKey: ['whatsapp-contact-search', debouncedQuery],
    queryFn: async (): Promise<WhatsAppContact[]> => {
      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .or(`display_name.ilike.%${debouncedQuery}%,phone_number.ilike.%${debouncedQuery}%`)
        .order('display_name', { ascending: true, nullsFirst: false })
        .limit(20);

      if (error) {
        console.error('[useSearchContacts] Error:', error);
        throw error;
      }

      return data || [];
    },
    enabled: shouldSearch,
    staleTime: 60000, // 1 minuut cache
  });
}
