import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FACTURATIE_QUERY_KEYS, STALE_TIME_MS } from "./constants";
import type { FactuurWithDetails, FactuurRegel, Betaling, FactuurHerinnering } from "@/types/facturatie";

export function useFactuur(id: string | undefined | null) {
  return useQuery({
    queryKey: FACTURATIE_QUERY_KEYS.factuur(id ?? ''),
    queryFn: async (): Promise<FactuurWithDetails | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('factuur')
        .select(`
          *,
          opdrachtgever:client_organizations(
            id, name, centrale_facturatie_email, kvk_nummer, btw_nummer, website
          ),
          flexwerker:professionals(id, full_name, email),
          regels:factuur_regel(*),
          betalingen:betaling(*),
          herinneringen:factuur_herinnering(*)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Type assertion with proper nested types
      const factuurData = data as unknown as FactuurWithDetails & {
        regels: FactuurRegel[];
      };

      // Client-side sortering van regels op volgorde
      if (factuurData.regels) {
        factuurData.regels.sort((a, b) => (a.volgorde || 0) - (b.volgorde || 0));
      }

      return factuurData;
    },
    staleTime: STALE_TIME_MS,
    enabled: !!id,
  });
}
