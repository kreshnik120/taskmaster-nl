import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FACTURATIE_QUERY_KEYS, STALE_TIME_MS } from "./constants";
import type { FactuurHerinnering, HerinneringNiveau, FactuurStatus } from "@/types/facturatie";

interface UseHerinneringenOptions {
  factuurId?: string;
  enabled?: boolean;
}

export function useHerinneringen(options: UseHerinneringenOptions = {}) {
  const { factuurId, enabled = true } = options;

  return useQuery({
    queryKey: ['herinneringen', factuurId],
    queryFn: async (): Promise<FactuurHerinnering[]> => {
      if (!factuurId) return [];

      const { data, error } = await supabase
        .from('factuur_herinnering')
        .select('*')
        .eq('factuur_id', factuurId)
        .order('niveau', { ascending: true });

      if (error) throw error;
      return data as FactuurHerinnering[];
    },
    staleTime: STALE_TIME_MS,
    enabled: enabled && !!factuurId,
  });
}

interface SendHerinneringInput {
  factuurId: string;
  niveau: HerinneringNiveau;
  email: string;
  openstaandBedrag: number;
}

export function useSendHerinnering() {
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);

  const sendHerinnering = async (input: SendHerinneringInput) => {
    setIsSending(true);
    try {
      if (input.niveau < 1 || input.niveau > 3) {
        throw new Error('Ongeldig herinneringsniveau');
      }

      // Check if this level was already sent
      const { data: existing } = await supabase
        .from('factuur_herinnering')
        .select('id')
        .eq('factuur_id', input.factuurId)
        .eq('niveau', input.niveau)
        .maybeSingle();

      if (existing) {
        throw new Error(`Herinnering niveau ${input.niveau} is al verstuurd`);
      }

      // Insert the reminder
      const { data: herinnering, error: herinneringError } = await supabase
        .from('factuur_herinnering')
        .insert({
          factuur_id: input.factuurId,
          niveau: input.niveau,
          verzonden_op: new Date().toISOString(),
          verzonden_naar: input.email,
          openstaand_bedrag: input.openstaandBedrag,
          email_log: `Herinnering niveau ${input.niveau} verstuurd naar ${input.email}`,
        })
        .select()
        .single();

      if (herinneringError) throw herinneringError;

      // Update invoice status
      const statusMap: Record<HerinneringNiveau, FactuurStatus> = {
        1: 'HERINNERING_1',
        2: 'HERINNERING_2',
        3: 'HERINNERING_3',
      };

      const { error: statusError } = await supabase
        .from('factuur')
        .update({
          status: statusMap[input.niveau],
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.factuurId);

      if (statusError) throw statusError;

      // Invalidate caches
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(input.factuurId) }),
        queryClient.invalidateQueries({ queryKey: ['herinneringen', input.factuurId] }),
      ]);

      toast.success(`Herinnering ${input.niveau} verstuurd`, {
        description: `Verzonden naar ${input.email}`,
      });

      return herinnering as FactuurHerinnering;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Herinnering versturen mislukt', { description: msg });
      throw error;
    } finally {
      setIsSending(false);
    }
  };

  return { sendHerinnering, isSending };
}
