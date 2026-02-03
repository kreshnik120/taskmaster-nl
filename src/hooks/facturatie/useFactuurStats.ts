import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FACTURATIE_QUERY_KEYS, STALE_TIME_MS } from "./constants";
import type { FactuurStats } from "@/types/facturatie";
import { startOfWeek, endOfWeek, subDays } from "date-fns";

export function useFactuurStats() {
  return useQuery({
    queryKey: FACTURATIE_QUERY_KEYS.stats,
    queryFn: async (): Promise<FactuurStats> => {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30);
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);

      // Get facturen
      const { data: facturen } = await supabase
        .from('factuur')
        .select('status, totaal, openstaand_bedrag, vervaldatum, factuurdatum')
        .is('deleted_at', null)
        .neq('status', 'CONCEPT');

      // Get betalingen deze week
      const { data: betalingen } = await supabase
        .from('betaling')
        .select('bedrag, factuur_id')
        .gte('datum', weekStart.toISOString())
        .lte('datum', weekEnd.toISOString());

      let totaal_openstaand = 0;
      let totaal_vervallen = 0;
      let aantal_vervallen = 0;
      let totaal_dit_kwartaal = 0;

      const openStatuses = ['VERZONDEN', 'HERINNERING_1', 'HERINNERING_2', 'HERINNERING_3', 'BETWIST'];

      for (const f of facturen || []) {
        if (openStatuses.includes(f.status)) {
          totaal_openstaand += f.openstaand_bedrag || 0;
        }

        if (f.vervaldatum && openStatuses.includes(f.status)) {
          if (new Date(f.vervaldatum) < thirtyDaysAgo) {
            totaal_vervallen += f.openstaand_bedrag || 0;
            aantal_vervallen++;
          }
        }

        if (f.factuurdatum && f.status !== 'AFGEBOEKT') {
          if (new Date(f.factuurdatum) >= quarterStart) {
            totaal_dit_kwartaal += f.totaal || 0;
          }
        }
      }

      const totaal_deze_week_betaald = (betalingen || []).reduce((sum, b) => sum + (b.bedrag || 0), 0);
      const aantal_deze_week_betaald = new Set((betalingen || []).map(b => b.factuur_id)).size;

      return {
        totaal_openstaand: Math.round(totaal_openstaand * 100) / 100,
        totaal_vervallen: Math.round(totaal_vervallen * 100) / 100,
        aantal_vervallen,
        totaal_deze_week_betaald: Math.round(totaal_deze_week_betaald * 100) / 100,
        aantal_deze_week_betaald,
        totaal_dit_kwartaal: Math.round(totaal_dit_kwartaal * 100) / 100,
      };
    },
    staleTime: STALE_TIME_MS,
  });
}
