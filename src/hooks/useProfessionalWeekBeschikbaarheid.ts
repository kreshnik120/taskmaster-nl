import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { format, addDays, parseISO } from "date-fns";
import { useMemo } from "react";
import type { AvailabilityEntry } from "@/hooks/useBeschikbaarheid";

export function useProfessionalWeekBeschikbaarheid(professionalId: string, weekStart: string) {
  const queryClient = useQueryClient();

  const weekEnd = useMemo(() => {
    return format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
  }, [weekStart]);

  const { data: availability = [], isLoading } = useQuery({
    queryKey: ["professional-week-beschikbaarheid", professionalId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_availability")
        .select("id, professional_id, date, shift, is_available, opmerking")
        .eq("professional_id", professionalId)
        .gte("date", weekStart)
        .lte("date", weekEnd);
      if (error) throw error;
      return (data ?? []) as AvailabilityEntry[];
    },
    enabled: !!professionalId && !!weekStart,
    staleTime: 30000,
  });

  useRealtimeChannel({
    channelName: `prof-beschikbaarheid-${professionalId}`,
    table: "professional_availability",
    filter: `professional_id=eq.${professionalId}`,
    onEvent: () =>
      queryClient.invalidateQueries({
        queryKey: ["professional-week-beschikbaarheid", professionalId],
      }),
    debounceMs: 200,
    enabled: !!professionalId,
  });

  return { availability, isLoading };
}
