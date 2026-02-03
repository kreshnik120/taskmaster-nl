import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FACTURATIE_QUERY_KEYS } from "./constants";
import type { UpdateFactuurInput, FactuurStatus } from "@/types/facturatie";

export function useUpdateFactuur() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateFactuur = async (id: string, updates: UpdateFactuurInput) => {
    setIsUpdating(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('factuur')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: user.user?.id,
        })
        .eq('id', id);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(id) }),
      ]);

      toast.success('Factuur bijgewerkt');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Bijwerken mislukt', { description: msg });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const updateStatus = async (id: string, newStatus: FactuurStatus) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('factuur')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(id) }),
      ]);

      toast.success(`Status gewijzigd naar ${newStatus}`);
    } catch (error) {
      toast.error('Status wijzigen mislukt');
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateFactuur, updateStatus, isUpdating };
}
