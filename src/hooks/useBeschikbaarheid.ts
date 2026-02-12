import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { startOfWeek, endOfWeek, format, parseISO } from "date-fns";
import { useMemo } from "react";

export interface BeschikbaarheidFilters {
  weekStart: string;
  functieNiveau: string;
  werkvorm: string;
  status: string;
  regio: string;
}

export interface AvailabilityEntry {
  id: string;
  professional_id: string;
  date: string;
  shift: string;
  is_available: boolean;
  opmerking: string | null;
}

export interface ProfessionalBeschikbaarheid {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string | null;
  status: string;
  regio: string | null;
  telefoonnummer: string | null;
  email: string | null;
  beschikbaarheidsnotities: string | null;
  availability: AvailabilityEntry[];
}

export interface BeschikbaarheidStats {
  totaalProfessionals: number;
  beschikbaarVandaag: number;
  onbekend: number;
  dekkingsgraad: number;
}

function getDefaultWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function getDefaultBeschikbaarheidFilters(): BeschikbaarheidFilters {
  return {
    weekStart: getDefaultWeekStart(),
    functieNiveau: "all",
    werkvorm: "all",
    status: "all",
    regio: "all",
  };
}

export function useBeschikbaarheid(filters: BeschikbaarheidFilters) {
  const queryClient = useQueryClient();

  const dateRange = useMemo(() => {
    const start = parseISO(filters.weekStart);
    return {
      start: filters.weekStart,
      end: format(endOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }, [filters.weekStart]);

  // 1. Haal alle professionals op (actief + beschikbaar)
  const { data: rawProfessionals = [], isLoading: loadingPros } = useQuery({
    queryKey: ["beschikbaarheid-professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, full_name, functie_niveau, werkvorm, status, regio, telefoonnummer, email, beschikbaarheidsnotities")
        .is("deleted_at", null)
        .in("status", ["actief", "beschikbaar"])
        .order("full_name");

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });

  // 2. Haal beschikbaarheid op voor de weekrange
  const { data: rawAvailability = [], isLoading: loadingAvail } = useQuery({
    queryKey: ["beschikbaarheid-entries", dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_availability")
        .select("id, professional_id, date, shift, is_available, opmerking")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30000,
  });

  // 3. Combineer professionals + availability met client-side filters
  const professionals: ProfessionalBeschikbaarheid[] = useMemo(() => {
    let result = rawProfessionals.map((p) => ({
      ...p,
      availability: rawAvailability.filter((a) => a.professional_id === p.id),
    }));

    if (filters.functieNiveau !== "all") {
      result = result.filter((p) => p.functie_niveau === filters.functieNiveau);
    }
    if (filters.werkvorm !== "all") {
      result = result.filter((p) => p.werkvorm === filters.werkvorm);
    }
    if (filters.status !== "all") {
      result = result.filter((p) => p.status === filters.status);
    }
    if (filters.regio !== "all") {
      result = result.filter((p) => p.regio === filters.regio);
    }

    return result;
  }, [rawProfessionals, rawAvailability, filters]);

  // 4. Stats
  const stats: BeschikbaarheidStats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayAvail = rawAvailability.filter((a) => a.date === today && a.is_available);
    const todayUnavail = rawAvailability.filter((a) => a.date === today && !a.is_available);

    const prosWithData = new Set([
      ...todayAvail.map((a) => a.professional_id),
      ...todayUnavail.map((a) => a.professional_id),
    ]);

    const totaal = rawProfessionals.length;
    const beschikbaar = new Set(todayAvail.map((a) => a.professional_id)).size;
    const onbekend = totaal - prosWithData.size;
    const dekkingsgraad = totaal > 0 ? Math.round(((totaal - onbekend) / totaal) * 100) : 0;

    return {
      totaalProfessionals: totaal,
      beschikbaarVandaag: beschikbaar,
      onbekend,
      dekkingsgraad,
    };
  }, [rawProfessionals, rawAvailability]);

  // 5. Realtime
  useRealtimeChannel({
    channelName: "beschikbaarheid-availability",
    table: "professional_availability",
    onEvent: () => queryClient.invalidateQueries({ queryKey: ["beschikbaarheid-entries"] }),
    debounceMs: 200,
  });

  useRealtimeChannel({
    channelName: "beschikbaarheid-professionals",
    table: "professionals",
    onEvent: () => queryClient.invalidateQueries({ queryKey: ["beschikbaarheid-professionals"] }),
    debounceMs: 200,
  });

  return {
    professionals,
    isLoading: loadingPros || loadingAvail,
    stats,
    dateRange,
  };
}
