import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpsertParams {
  professional_id: string;
  date: string;
  shift: string;
  is_available: boolean;
  opmerking?: string | null;
}

interface DeleteParams {
  professional_id: string;
  date: string;
  shift: string;
}

export function useBeschikbaarheidMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["beschikbaarheid-entries"] });
  };

  const upsertMutation = useMutation({
    mutationFn: async (params: UpsertParams) => {
      const { data: existing } = await supabase
        .from("professional_availability")
        .select("id")
        .eq("professional_id", params.professional_id)
        .eq("date", params.date)
        .eq("shift", params.shift)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("professional_availability")
          .update({ is_available: params.is_available, opmerking: params.opmerking ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("professional_availability")
          .insert({
            professional_id: params.professional_id,
            date: params.date,
            shift: params.shift,
            is_available: params.is_available,
            opmerking: params.opmerking ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error("Beschikbaarheid opslaan mislukt"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (params: DeleteParams) => {
      const { error } = await supabase
        .from("professional_availability")
        .delete()
        .eq("professional_id", params.professional_id)
        .eq("date", params.date)
        .eq("shift", params.shift);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error("Beschikbaarheid verwijderen mislukt"),
  });

  return {
    upsertBeschikbaarheid: upsertMutation.mutate,
    deleteBeschikbaarheid: deleteMutation.mutate,
    isUpdating: upsertMutation.isPending || deleteMutation.isPending,
  };
}
