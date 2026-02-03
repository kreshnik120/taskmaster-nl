import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FACTURATIE_QUERY_KEYS } from "./constants";

export function useDeleteFactuur() {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteFactuur = async (id: string) => {
    setIsDeleting(true);
    try {
      // Check status first
      const { data: factuur } = await supabase
        .from('factuur')
        .select('status, factuur_nummer')
        .eq('id', id)
        .single();

      if (factuur?.status !== 'CONCEPT') {
        throw new Error('Alleen concept facturen kunnen verwijderd worden');
      }

      // Soft delete
      const { error } = await supabase
        .from('factuur')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen }),
        queryClient.removeQueries({ queryKey: FACTURATIE_QUERY_KEYS.factuur(id) }),
      ]);

      toast.success('Factuur verwijderd', {
        description: `${factuur.factuur_nummer} is verwijderd`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error('Verwijderen mislukt', { description: msg });
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteFactuur, isDeleting };
}
