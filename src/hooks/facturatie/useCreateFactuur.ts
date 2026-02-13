import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FACTURATIE_QUERY_KEYS } from "./constants";
import type { CreateFactuurInput, Factuur } from "@/types/facturatie";

export function useCreateFactuur() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const createFactuur = async (input: CreateFactuurInput): Promise<Factuur> => {
    setIsCreating(true);

    try {
      // Validatie
      if (!input.regels || input.regels.length === 0) {
        throw new Error('Minstens 1 factuurregel is verplicht');
      }

      // Get user org
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .limit(1)
        .maybeSingle();

      if (!userOrg?.org_id) throw new Error('Geen organisatie gevonden');

      // Calculate totals
      const regelsMetTotals = input.regels.map((regel, idx) => {
        const btw = regel.btw_percentage ?? 21;
        return {
          ...regel,
          btw_percentage: btw,
          eenheid: regel.eenheid ?? 'uur',
          volgorde: idx + 1,
        };
      });

      const round2 = (n: number) => Math.round(n * 100) / 100;

      const totals = regelsMetTotals.reduce((acc, r) => {
        const sub = round2(r.aantal * r.prijs);
        const btw = round2(sub * (r.btw_percentage / 100));
        return {
          subtotaal: round2(acc.subtotaal + sub),
          btw_bedrag: round2(acc.btw_bedrag + btw),
          totaal: round2(acc.totaal + sub + btw),
        };
      }, { subtotaal: 0, btw_bedrag: 0, totaal: 0 });

      const vervaldatum = input.vervaldatum
        ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: user } = await supabase.auth.getUser();

      // Create factuur
      const { data: factuur, error: factuurError } = await supabase
        .from('factuur')
        .insert({
          tenant_id: userOrg.org_id,
          opdrachtgever_id: input.opdrachtgever_id,
          flexwerker_id: input.flexwerker_id ?? null,
          type: input.type ?? 'VERKOOP',
          status: 'CONCEPT',
          factuurdatum: input.factuurdatum ?? new Date().toISOString().split('T')[0],
          vervaldatum,
          urenstaat_ids: input.urenstaat_ids ?? [],
          subtotaal: Math.round(totals.subtotaal * 100) / 100,
          btw_percentage: input.btw_percentage ?? 21,
          btw_bedrag: Math.round(totals.btw_bedrag * 100) / 100,
          totaal: Math.round(totals.totaal * 100) / 100,
          openstaand_bedrag: Math.round(totals.totaal * 100) / 100,
          referentie: input.referentie ?? null,
          notities: input.notities ?? null,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (factuurError) throw factuurError;

      // Create regels
      const { error: regelsError } = await supabase
        .from('factuur_regel')
        .insert(regelsMetTotals.map(r => ({
          factuur_id: factuur.id,
          urenstaat_id: r.urenstaat_id ?? null,
          omschrijving: r.omschrijving,
          aantal: r.aantal,
          eenheid: r.eenheid,
          prijs: r.prijs,
          btw_percentage: r.btw_percentage,
          volgorde: r.volgorde,
        })));

      if (regelsError) {
        await supabase.from('factuur').delete().eq('id', factuur.id);
        throw regelsError;
      }

      await queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen });

      toast.success('Factuur aangemaakt', {
        description: `Factuurnummer: ${factuur.factuur_nummer}`,
      });

      return factuur as unknown as Factuur;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Factuur aanmaken mislukt', { description: msg });
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return { createFactuur, isCreating };
}
