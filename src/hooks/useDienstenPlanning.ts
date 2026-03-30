import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { startOfWeek, endOfWeek, startOfMonth, addWeeks, format, isToday, parseISO } from "date-fns";
import { useMemo } from "react";

export interface DienstFilters {
  status: string;
  bureau: string;
  functieNiveau: string;
  locatie: string;
  werkvorm: string;
  certificering: string;
  spoed: string;
  weekStart: string;
  viewMode?: "kalender" | "lijst" | "maand";
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
  gevraagd_functie_niveau: string[];
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
  is_slaapdienst: boolean;
  slaap_start_tijd: string | null;
  slaap_eind_tijd: string | null;
  flexwerker_opmerking: string | null;
  vereiste_certificeringen: string[];
  is_spoed: boolean;
  kleur: string | null;
  lock_version: number;
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
    positie_nr: number;
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
    certificering: "all",
    spoed: "all",
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
    geannuleerd: diensten.filter((d) => d.status === "geannuleerd"),
  };
}

export function useDienstenPlanning(filters: DienstFilters) {
  const queryClient = useQueryClient();

  const dateRange = useMemo(() => {
    const start = parseISO(filters.weekStart);
    if (filters.viewMode === "maand") {
      const monthStart = startOfMonth(start);
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const gridEnd = endOfWeek(addWeeks(gridStart, 5), { weekStartsOn: 1 });
      return {
        start: format(gridStart, "yyyy-MM-dd"),
        end: format(gridEnd, "yyyy-MM-dd"),
      };
    }
    return {
      start: filters.weekStart,
      end: format(endOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }, [filters.weekStart, filters.viewMode]);

  const queryKey = ["diensten-planning", dateRange.start, dateRange.end, filters] as const;

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
            id, status, positie_nr, reactie_op, reactie_door, toewijzing_notities,
            professionals!dienst_toewijzingen_professional_id_fkey (
              id, full_name, functie_niveau, telefoonnummer, email
            )
          )
        `)
        .gte("datum", dateRange.start)
        .lte("datum", dateRange.end)
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
          positie_nr: t.positie_nr || 1,
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
    return rawDiensten.filter((d) => {
      if (filters.status !== "all" && d.status !== filters.status) return false;
      if (filters.bureau !== "all" && d.sublocation?.location?.organization?.name !== filters.bureau) return false;
      if (filters.functieNiveau !== "all" && !d.gevraagd_functie_niveau?.includes(filters.functieNiveau)) return false;
      if (filters.locatie !== "all" && d.sublocation?.location?.organization?.org_id !== filters.locatie && d.sublocation?.id !== filters.locatie) return false;
      if (filters.werkvorm !== "all" && d.werkvorm !== filters.werkvorm) return false;
      if (filters.certificering !== "all" && !d.vereiste_certificeringen?.includes(filters.certificering)) return false;
      if (filters.spoed !== "all" && d.is_spoed !== (filters.spoed === "ja")) return false;
      return true;
    });
  }, [rawDiensten, filters]);

  // Stats
  const stats: PlanningStats = useMemo(() => {
    const notCancelled = rawDiensten.filter((d) => d.status !== "geannuleerd");
    const vandaag = notCancelled.filter((d) => isToday(parseISO(d.datum))).length;
    const dezeWeek = notCancelled.length;
    const openDiensten = rawDiensten.filter((d) =>
      ["open", "deels_bezet", "concept"].includes(d.status)
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
      .reduce((sum, d) => sum + (d.netto_uren || 0) * (d.gevraagd_aantal || 1), 0);

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
