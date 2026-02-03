import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FACTURATIE_QUERY_KEYS, STALE_TIME_MS } from "./constants";
import type { Betaling } from "@/types/facturatie";

interface UseBetalingenOptions {
  factuurId?: string;
  enabled?: boolean;
}

export function useBetalingen(options: UseBetalingenOptions = {}) {
  const { factuurId, enabled = true } = options;

  return useQuery({
    queryKey: ['betalingen', factuurId],
    queryFn: async (): Promise<Betaling[]> => {
      let query = supabase
        .from('betaling')
        .select('*')
        .order('datum', { ascending: false });

      if (factuurId) {
        query = query.eq('factuur_id', factuurId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data as Betaling[];
    },
    staleTime: STALE_TIME_MS,
    enabled: enabled && !!factuurId,
  });
}

export function useDeleteBetaling() {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteBetaling = async (betalingId: string, factuurId: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('betaling')
        .delete()
        .eq('id', betalingId);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(factuurId) }),
        queryClient.invalidateQueries({ queryKey: ['betalingen', factuurId] }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.stats }),
      ]);

      toast.success('Betaling verwijderd');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Verwijderen mislukt', { description: msg });
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteBetaling, isDeleting };
}

export function useUpdateBetaling() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateBetaling = async (
    betalingId: string,
    factuurId: string,
    updates: Partial<Pick<Betaling, 'bedrag' | 'datum' | 'methode' | 'referentie' | 'opmerking'>>
  ) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('betaling')
        .update(updates)
        .eq('id', betalingId);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(factuurId) }),
        queryClient.invalidateQueries({ queryKey: ['betalingen', factuurId] }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.stats }),
      ]);

      toast.success('Betaling bijgewerkt');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Bijwerken mislukt', { description: msg });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateBetaling, isUpdating };
}
