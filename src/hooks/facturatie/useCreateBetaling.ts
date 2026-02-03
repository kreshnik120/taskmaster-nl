import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FACTURATIE_QUERY_KEYS } from "./constants";
import type { CreateBetalingInput, Betaling } from "@/types/facturatie";

export function useCreateBetaling() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const createBetaling = async (input: CreateBetalingInput): Promise<Betaling> => {
    setIsCreating(true);
    try {
      if (!input.bedrag || input.bedrag <= 0) {
        throw new Error('Bedrag moet groter zijn dan 0');
      }

      const { data: factuur } = await supabase
        .from('factuur')
        .select('status, factuur_nummer, openstaand_bedrag')
        .eq('id', input.factuur_id)
        .single();

      if (factuur?.status === 'CONCEPT') {
        throw new Error('Kan geen betaling registreren voor concept factuur');
      }

      const { data: user } = await supabase.auth.getUser();

      const { data: betaling, error } = await supabase
        .from('betaling')
        .insert({
          factuur_id: input.factuur_id,
          bedrag: Math.round(input.bedrag * 100) / 100,
          datum: input.datum ?? new Date().toISOString().split('T')[0],
          methode: input.methode ?? 'BANK',
          referentie: input.referentie ?? null,
          opmerking: input.opmerking ?? null,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(input.factuur_id) }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.stats }),
      ]);

      const nieuwOpenstaand = (factuur?.openstaand_bedrag ?? 0) - input.bedrag;
      if (nieuwOpenstaand <= 0) {
        toast.success('Factuur volledig betaald!');
      } else {
        toast.success('Betaling geregistreerd', {
          description: `Nog openstaand: €${nieuwOpenstaand.toFixed(2)}`,
        });
      }

      return betaling as unknown as Betaling;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Betaling registreren mislukt', { description: msg });
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return { createBetaling, isCreating };
}
