import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import type { DienstData } from "@/hooks/useDienstenPlanning";

const SHIFT_MAP: Record<string, string[]> = {
  dag: ["dag", "hele_dag"],
  avond: ["avond", "hele_dag"],
  nacht: ["nacht", "hele_dag"],
  weekend: ["dag", "avond", "nacht", "hele_dag"],
};

export interface MatchResult {
  professional: {
    id: string;
    full_name: string;
    functie_niveau: string;
    regio: string | null;
    certificaten: string[] | null;
    telefoonnummer: string | null;
    email: string | null;
  };
  totalScore: number;
  breakdown: {
    functieNiveau: number;
    beschikbaarheid: number;
    certificeringen: number;
    regio: number;
    historie: number;
  };
  reasons: string[];
  isDisqualified: boolean;
  disqualifyReason?: string;
}

export function useDienstMatching(dienst: DienstData | null) {
  const { data: professionals = [] } = useQuery({
    queryKey: ["matching-professionals", dienst?.org_id],
    queryFn: async () => {
      if (!dienst) return [];
      const { data, error } = await supabase
        .from("professionals")
        .select("id, full_name, functie_niveau, regio, regio_voorkeur, certificaten, telefoonnummer, email, status")
        .eq("org_id", dienst.org_id)
        .in("status", ["actief", "beschikbaar"])
        .is("deleted_at", null)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dienst && dienst.status !== "geannuleerd" && dienst.status !== "voltooid",
    staleTime: 30000,
  });

  const { data: availability = [] } = useQuery({
    queryKey: ["matching-availability", dienst?.datum],
    queryFn: async () => {
      if (!dienst) return [];
      const { data, error } = await supabase
        .from("professional_availability")
        .select("professional_id, shift, is_available")
        .eq("date", dienst.datum);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dienst?.datum,
    staleTime: 30000,
  });

  const { data: bestaandeToewijzingen = [] } = useQuery({
    queryKey: ["matching-toewijzingen", dienst?.datum],
    queryFn: async () => {
      if (!dienst) return [];
      const { data, error } = await supabase
        .from("dienst_toewijzingen")
        .select(`
          professional_id,
          status,
          dienst:diensten!inner(id, datum, start_tijd, eind_tijd)
        `)
        .eq("dienst.datum", dienst.datum)
        .in("status", ["bevestigd", "positief", "voorgesteld"]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dienst?.datum,
    staleTime: 15000,
  });

  const matches: MatchResult[] = useMemo(() => {
    if (!dienst || professionals.length === 0) return [];

    const relevantShifts = SHIFT_MAP[dienst.dienst_type ?? "dag"] ?? SHIFT_MAP.dag;
    const gevraagdNiveaus = dienst.gevraagd_functie_niveau ?? [];
    const vereisteCerts = dienst.vereiste_certificeringen ?? [];

    const alToegewezen = new Set(
      dienst.toewijzingen.map((t) => t.professional.id)
    );

    return professionals
      .filter((p) => !alToegewezen.has(p.id))
      .map((p) => {
        const reasons: string[] = [];
        let isDisqualified = false;
        let disqualifyReason: string | undefined;

        // Functie Niveau (0-30)
        let functieScore = 0;
        if (gevraagdNiveaus.length === 0) {
          functieScore = 15;
        } else if (gevraagdNiveaus.includes(p.functie_niveau)) {
          functieScore = 30;
          reasons.push(`✓ ${p.functie_niveau}`);
        }

        // Beschikbaarheid (0-25)
        let beschikbaarheidScore = 0;
        const proAvail = availability.filter(
          (a) => a.professional_id === p.id && relevantShifts.includes(a.shift)
        );
        if (proAvail.length === 0) {
          beschikbaarheidScore = 10;
          reasons.push("? Beschikbaarheid onbekend");
        } else if (proAvail.some((a) => a.is_available)) {
          beschikbaarheidScore = 25;
          reasons.push("✓ Beschikbaar");
        } else {
          isDisqualified = true;
          disqualifyReason = "Niet beschikbaar op deze datum/shift";
        }

        // Certificeringen (0-20)
        let certScore = 0;
        if (vereisteCerts.length === 0) {
          certScore = 10;
        } else {
          const proCerts = p.certificaten ?? [];
          const matched = vereisteCerts.filter((c: string) => proCerts.includes(c));
          certScore = Math.round((matched.length / vereisteCerts.length) * 20);
          if (matched.length === vereisteCerts.length) {
            reasons.push("✓ Alle certificeringen");
          } else if (matched.length > 0) {
            reasons.push(`${matched.length}/${vereisteCerts.length} certificeringen`);
          }
        }

        // Regio (0-15)
        let regioScore = 5;
        const dienstPlaats = dienst.sublocation?.plaats?.toLowerCase();
        if (dienstPlaats && p.regio) {
          if (p.regio.toLowerCase().includes(dienstPlaats)) {
            regioScore = 15;
            reasons.push("✓ Zelfde regio");
          } else if ((p.regio_voorkeur ?? []).some((r: string) => r.toLowerCase().includes(dienstPlaats))) {
            regioScore = 12;
            reasons.push("✓ In regiovoorkeur");
          }
        }

        // Overlap check
        const historieScore = 0;
        const proToewijzingen = bestaandeToewijzingen.filter(
          (t: any) => t.professional_id === p.id && t.dienst?.id !== dienst.id
        );
        const heeftOverlap = proToewijzingen.some((t: any) => {
          if (!t.dienst) return false;
          return t.dienst.start_tijd < dienst.eind_tijd && t.dienst.eind_tijd > dienst.start_tijd;
        });
        if (heeftOverlap) {
          isDisqualified = true;
          disqualifyReason = "Overlappende dienst op deze datum";
        }

        const totalScore = functieScore + beschikbaarheidScore + certScore + regioScore + historieScore;

        return {
          professional: {
            id: p.id,
            full_name: p.full_name,
            functie_niveau: p.functie_niveau,
            regio: p.regio,
            certificaten: p.certificaten,
            telefoonnummer: p.telefoonnummer,
            email: p.email,
          },
          totalScore,
          breakdown: {
            functieNiveau: functieScore,
            beschikbaarheid: beschikbaarheidScore,
            certificeringen: certScore,
            regio: regioScore,
            historie: historieScore,
          },
          reasons,
          isDisqualified,
          disqualifyReason,
        } satisfies MatchResult;
      })
      .filter((m) => !m.isDisqualified)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
  }, [dienst, professionals, availability, bestaandeToewijzingen]);

  const isLoading = !dienst;

  return { matches, isLoading };
}
