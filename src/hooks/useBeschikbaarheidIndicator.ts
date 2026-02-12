import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

type BeschikbaarheidStatus = "beschikbaar" | "niet_beschikbaar" | "onbekend";

const SHIFT_MAP: Record<string, string[]> = {
  dag: ["dag", "hele_dag"],
  avond: ["avond", "hele_dag"],
  nacht: ["nacht", "hele_dag"],
  weekend: ["dag", "avond", "nacht", "hele_dag"],
};

export function useBeschikbaarheidIndicator(date: string | undefined, dienstType?: string) {
  const { data: entries = [] } = useQuery({
    queryKey: ["beschikbaarheid-indicator", date],
    queryFn: async () => {
      if (!date) return [];
      const { data, error } = await supabase
        .from("professional_availability")
        .select("professional_id, shift, is_available")
        .eq("date", date);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!date,
    staleTime: 30000,
  });

  const getStatus = useCallback(
    (professionalId: string): BeschikbaarheidStatus => {
      const relevantShifts = SHIFT_MAP[dienstType ?? ""] ?? Object.values(SHIFT_MAP).flat();
      const matching = entries.filter(
        (e) => e.professional_id === professionalId && relevantShifts.includes(e.shift)
      );
      if (matching.length === 0) return "onbekend";
      if (matching.some((e) => e.is_available)) return "beschikbaar";
      return "niet_beschikbaar";
    },
    [entries, dienstType]
  );

  return { getStatus };
}
