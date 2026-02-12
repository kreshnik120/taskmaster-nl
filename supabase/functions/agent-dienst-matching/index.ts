/**
 * Agent Dienst Matching v1.0.0
 * Server-side professional matching engine met historie scoring.
 */
import { corsHeaders, createAdminClient, jsonResponse, handleCors, logInfo, logSuccess, logError } from '../_shared/core.ts';

const SHIFT_MAP: Record<string, string[]> = {
  dag: ["dag", "hele_dag"],
  avond: ["avond", "hele_dag"],
  nacht: ["nacht", "hele_dag"],
  weekend: ["dag", "avond", "nacht", "hele_dag"],
};

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const { dienst_id, org_id, action = "suggest", exclude_professional_id } = body;

    logInfo("agent-dienst-matching", `v1.0.0 Processing: action=${action}, dienst=${dienst_id}`);

    if (!dienst_id || !org_id) {
      return jsonResponse({ success: false, error: "dienst_id en org_id zijn verplicht" }, 400);
    }

    // Query 1: Dienst met sublocation/location
    const { data: dienst, error: dienstError } = await supabase
      .from("diensten")
      .select(`
        id, datum, start_tijd, eind_tijd, dienst_type, status,
        gevraagd_functie_niveau, vereiste_certificeringen,
        sublocation:client_sublocations!inner(
          id, naam, plaats,
          location:client_locations!inner(
            id, naam, client_org_id
          )
        )
      `)
      .eq("id", dienst_id)
      .single();

    if (dienstError || !dienst) {
      return jsonResponse({ success: false, error: "Dienst niet gevonden" }, 404);
    }

    if (["geannuleerd", "voltooid"].includes(dienst.status)) {
      return jsonResponse({ success: true, matches: [], reason: "Dienst is afgelopen" });
    }

    // Query 2: Actieve professionals
    const { data: professionals = [] } = await supabase
      .from("professionals")
      .select("id, full_name, functie_niveau, regio, regio_voorkeur, certificaten, status")
      .eq("org_id", org_id)
      .in("status", ["actief", "beschikbaar"])
      .is("deleted_at", null)
      .limit(200);

    // Query 3: Beschikbaarheid op datum
    const { data: availability = [] } = await supabase
      .from("professional_availability")
      .select("professional_id, shift, is_available")
      .eq("date", dienst.datum);

    // Query 4: Dag-toewijzingen (overlap check)
    const { data: dagToewijzingen = [] } = await supabase
      .from("dienst_toewijzingen")
      .select(`
        professional_id, status,
        dienst:diensten!inner(id, datum, start_tijd, eind_tijd)
      `)
      .eq("dienst.datum", dienst.datum)
      .in("status", ["bevestigd", "positief", "voorgesteld"]);

    // Query 5: Huidige toewijzingen aan deze dienst (skip)
    const { data: huidigeToewijzingen = [] } = await supabase
      .from("dienst_toewijzingen")
      .select("professional_id")
      .eq("dienst_id", dienst_id);

    const alToegewezen = new Set(huidigeToewijzingen.map((t: any) => t.professional_id));

    // Query 6: HISTORIE — eerdere toewijzingen bij dezelfde opdrachtgever
    const opdrachtgeverId = (dienst.sublocation as any)?.location?.client_org_id;
    const historieMap: Record<string, number> = {};

    if (opdrachtgeverId) {
      const { data: historie = [] } = await supabase
        .from("dienst_toewijzingen")
        .select(`
          professional_id,
          dienst:diensten!inner(
            id,
            sublocation:client_sublocations!inner(
              location:client_locations!inner(client_org_id)
            )
          )
        `)
        .in("status", ["bevestigd", "voltooid"])
        .neq("dienst_id", dienst_id);

      for (const t of historie) {
        const tClientOrg = (t.dienst as any)?.sublocation?.location?.client_org_id;
        if (tClientOrg === opdrachtgeverId) {
          historieMap[t.professional_id] = (historieMap[t.professional_id] || 0) + 1;
        }
      }
    }

    // Scoring
    const relevantShifts = SHIFT_MAP[dienst.dienst_type ?? "dag"] ?? SHIFT_MAP.dag;
    const gevraagdNiveaus: string[] = (dienst.gevraagd_functie_niveau as string[]) ?? [];
    const vereisteCerts: string[] = (dienst.vereiste_certificeringen as string[]) ?? [];

    const matches = professionals
      .filter((p: any) => !alToegewezen.has(p.id))
      .filter((p: any) => !exclude_professional_id || p.id !== exclude_professional_id)
      .map((p: any) => {
        const reasons: string[] = [];
        let isDisqualified = false;

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
          (a: any) => a.professional_id === p.id && relevantShifts.includes(a.shift)
        );
        if (proAvail.length === 0) {
          beschikbaarheidScore = 10;
          reasons.push("? Beschikbaarheid onbekend");
        } else if (proAvail.some((a: any) => a.is_available)) {
          beschikbaarheidScore = 25;
          reasons.push("✓ Beschikbaar");
        } else {
          isDisqualified = true;
        }

        // Certificeringen (0-20)
        let certScore = 0;
        if (vereisteCerts.length === 0) {
          certScore = 10;
        } else {
          const proCerts: string[] = p.certificaten ?? [];
          const matched = vereisteCerts.filter((c: string) => proCerts.includes(c));
          certScore = Math.round((matched.length / vereisteCerts.length) * 20);
          if (matched.length === vereisteCerts.length) {
            reasons.push("✓ Alle certificeringen");
          } else if (matched.length > 0) {
            reasons.push(`${matched.length}/${vereisteCerts.length} cert.`);
          }
        }

        // Regio (0-15)
        let regioScore = 5;
        const dienstPlaats = (dienst.sublocation as any)?.plaats?.toLowerCase();
        if (dienstPlaats && p.regio) {
          if (p.regio.toLowerCase().includes(dienstPlaats)) {
            regioScore = 15;
            reasons.push("✓ Zelfde regio");
          } else if ((p.regio_voorkeur ?? []).some((r: string) => r.toLowerCase().includes(dienstPlaats))) {
            regioScore = 12;
            reasons.push("✓ In regiovoorkeur");
          }
        }

        // HISTORIE (0-10)
        let historieScore = 0;
        const aantalEerder = historieMap[p.id] || 0;
        if (aantalEerder >= 5) {
          historieScore = 10;
          reasons.push(`✓ ${aantalEerder}× eerder gewerkt`);
        } else if (aantalEerder >= 2) {
          historieScore = 7;
          reasons.push(`${aantalEerder}× eerder gewerkt`);
        } else if (aantalEerder === 1) {
          historieScore = 4;
          reasons.push("1× eerder gewerkt");
        }

        // Overlap check
        const proToewijzingen = dagToewijzingen.filter(
          (t: any) => t.professional_id === p.id && (t.dienst as any)?.id !== dienst.id
        );
        const heeftOverlap = proToewijzingen.some((t: any) => {
          if (!t.dienst) return false;
          return (t.dienst as any).start_tijd < dienst.eind_tijd && (t.dienst as any).eind_tijd > dienst.start_tijd;
        });
        if (heeftOverlap) isDisqualified = true;

        const totalScore = functieScore + beschikbaarheidScore + certScore + regioScore + historieScore;

        return {
          professional_id: p.id,
          full_name: p.full_name,
          functie_niveau: p.functie_niveau,
          regio: p.regio,
          total_score: totalScore,
          breakdown: {
            functie_niveau: functieScore,
            beschikbaarheid: beschikbaarheidScore,
            certificeringen: certScore,
            regio: regioScore,
            historie: historieScore,
          },
          reasons,
          _disqualified: isDisqualified,
        };
      })
      .filter((m: any) => !m._disqualified)
      .map(({ _disqualified, ...rest }: any) => rest)
      .sort((a: any, b: any) => b.total_score - a.total_score)
      .slice(0, 10);

    const executionTime = Date.now() - startTime;

    // Logging
    await supabase.from("function_call_logs").insert({
      function_name: "agent-dienst-matching",
      org_id,
      execution_time_ms: executionTime,
      success: true,
      metadata: {
        dienst_id,
        action,
        matches_count: matches.length,
        professionals_evaluated: professionals.length,
        historie_entries: Object.keys(historieMap).length,
      },
    }).catch(() => {});

    logSuccess("agent-dienst-matching", `✅ ${matches.length} matches in ${executionTime}ms`);

    return jsonResponse({
      success: true,
      action,
      matches,
      meta: {
        professionals_evaluated: professionals.length,
        disqualified: professionals.length - matches.length - alToegewezen.size,
        execution_time_ms: executionTime,
      },
    });
  } catch (error) {
    logError("agent-dienst-matching", "Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});
