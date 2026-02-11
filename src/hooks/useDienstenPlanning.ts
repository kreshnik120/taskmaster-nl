import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { startOfWeek, endOfWeek, format, isToday } from "date-fns";
import { useMemo } from "react";

export interface DienstFilters {
  status: string;
  bureau: string;
  functieNiveau: string;
  locatie: string;
  werkvorm: string;
  weekStart: string;
}

export interface DienstData {
  id: string;
  org_id: string;
  titel: string;
  datum: string;
  start_tijd: string;
  eind_tijd: string;
  pauze_minuten: number;
  netto_uren: number;
  gevraagd_functie_niveau: string | null;
  gevraagd_aantal: number;
  werkvorm: string | null;
  dienst_type: string;
  tarief_per_uur: number | null;
  prive_opmerking: string | null;
  publieke_opmerking: string | null;
  status: string;
  accepteerbaar: boolean;
  herhaling: string;
  bron: string;
  created_at: string;
  sublocation: {
    id: string;
    naam: string;
    plaats: string | null;
    doelgroep: string | null;
    sector: string | null;
    location: {
      naam: string;
      organization: {
        name: string;
        org_id: string;
      };
    };
  };
  toewijzingen: Array<{
    id: string;
    status: string;
    reactie_op: string | null;
    reactie_door: string | null;
    toewijzing_notities: string | null;
    professional: {
      id: string;
      full_name: string;
      functie_niveau: string | null;
      telefoonnummer: string | null;
      email: string | null;
    };
  }>;
}

export interface PlanningStats {
  vandaag: number;
  dezeWeek: number;
  openDiensten: number;
  bezettingsgraad: number;
  totaalUrenWeek: number;
}

function getDefaultWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function getDefaultFilters(): DienstFilters {
  return {
    status: "all",
    bureau: "all",
    functieNiveau: "all",
    locatie: "all",
    werkvorm: "all",
    weekStart: getDefaultWeekStart(),
  };
}

export function splitByStatus(diensten: DienstData[]) {
  return {
    open: diensten.filter((d) =>
      ["open", "deels_bezet", "concept"].includes(d.status)
    ),
    ingepland: diensten.filter((d) =>
      ["volledig_bezet", "voltooid"].includes(d.status)
    ),
  };
}

export function useDienstenPlanning(filters: DienstFilters) {
  const queryClient = useQueryClient();

  const weekEnd = useMemo(() => {
    const start = new Date(filters.weekStart);
    return format(endOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }, [filters.weekStart]);

  const queryKey = ["diensten-planning", filters.weekStart, filters] as const;

  const { data: rawDiensten = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diensten")
        .select(`
          *,
          client_sublocations!diensten_sublocation_id_fkey (
            id, naam, plaats, doelgroep, sector,
            client_locations!client_sublocations_location_id_fkey (
              naam,
              client_organizations!client_locations_client_org_id_fkey (
                name, org_id
              )
            )
          ),
          dienst_toewijzingen (
            id, status, reactie_op, reactie_door, toewijzing_notities,
            professionals!dienst_toewijzingen_professional_id_fkey (
              id, full_name, functie_niveau, telefoonnummer, email
            )
          )
        `)
        .gte("datum", filters.weekStart)
        .lte("datum", weekEnd)
        .order("datum", { ascending: true })
        .order("start_tijd", { ascending: true });

      if (error) throw error;

      // Map nested structure
      return (data || []).map((d: any) => ({
        ...d,
        sublocation: {
          id: d.client_sublocations?.id,
          naam: d.client_sublocations?.naam,
          plaats: d.client_sublocations?.plaats,
          doelgroep: d.client_sublocations?.doelgroep,
          sector: d.client_sublocations?.sector,
          location: {
            naam: d.client_sublocations?.client_locations?.naam,
            organization: {
              name: d.client_sublocations?.client_locations?.client_organizations?.name,
              org_id: d.client_sublocations?.client_locations?.client_organizations?.org_id,
            },
          },
        },
        toewijzingen: (d.dienst_toewijzingen || []).map((t: any) => ({
          id: t.id,
          status: t.status,
          reactie_op: t.reactie_op,
          reactie_door: t.reactie_door,
          toewijzing_notities: t.toewijzing_notities,
          professional: {
            id: t.professionals?.id,
            full_name: t.professionals?.full_name,
            functie_niveau: t.professionals?.functie_niveau,
            telefoonnummer: t.professionals?.telefoonnummer,
            email: t.professionals?.email,
          },
        })),
      })) as DienstData[];
    },
    staleTime: 30000,
  });

  // Client-side filters
  const diensten = useMemo(() => {
    let result = rawDiensten;

    if (filters.status !== "all") {
      result = result.filter((d) => d.status === filters.status);
    }
    if (filters.bureau !== "all") {
      result = result.filter(
        (d) => d.sublocation?.location?.organization?.name === filters.bureau
      );
    }
    if (filters.functieNiveau !== "all") {
      result = result.filter(
        (d) => d.gevraagd_functie_niveau === filters.functieNiveau
      );
    }
    if (filters.locatie !== "all") {
      result = result.filter(
        (d) => d.sublocation?.location?.organization?.org_id === filters.locatie
          || d.sublocation?.id === filters.locatie
      );
    }
    if (filters.werkvorm !== "all") {
      result = result.filter((d) => d.werkvorm === filters.werkvorm);
    }

    return result;
  }, [rawDiensten, filters]);

  // Stats
  const stats: PlanningStats = useMemo(() => {
    const notCancelled = rawDiensten.filter((d) => d.status !== "geannuleerd");
    const vandaag = notCancelled.filter((d) => isToday(new Date(d.datum))).length;
    const dezeWeek = notCancelled.length;
    const openDiensten = rawDiensten.filter((d) =>
      ["open", "deels_bezet"].includes(d.status)
    ).length;

    const activeTotal = rawDiensten.filter(
      (d) => !["concept", "geannuleerd"].includes(d.status)
    ).length;
    const bezet = rawDiensten.filter(
      (d) => d.status === "volledig_bezet"
    ).length;
    const bezettingsgraad =
      activeTotal > 0 ? Math.round((bezet / activeTotal) * 100) : 0;

    const totaalUrenWeek = rawDiensten
      .filter((d) => ["volledig_bezet", "deels_bezet", "open"].includes(d.status))
      .reduce((sum, d) => sum + (d.netto_uren || 0), 0);

    return { vandaag, dezeWeek, openDiensten, bezettingsgraad, totaalUrenWeek };
  }, [rawDiensten]);

  // Realtime
  useRealtimeChannel({
    channelName: "planning-diensten",
    table: "diensten",
    onEvent: () =>
      queryClient.invalidateQueries({ queryKey: ["diensten-planning"] }),
    debounceMs: 200,
  });

  useRealtimeChannel({
    channelName: "planning-toewijzingen",
    table: "dienst_toewijzingen",
    onEvent: () =>
      queryClient.invalidateQueries({ queryKey: ["diensten-planning"] }),
    debounceMs: 200,
  });

  return {
    diensten,
    rawDiensten,
    isLoading,
    error,
    stats,
    splitByStatus: () => splitByStatus(diensten),
  };
}
