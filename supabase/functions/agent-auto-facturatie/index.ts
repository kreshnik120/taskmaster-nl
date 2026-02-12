import { corsHeaders, createAdminClient, jsonResponse, handleCors, logInfo, logSuccess, logError } from '../_shared/core.ts';

interface AutoFacturatieRequest {
  org_id: string;
  period_start: string;
  period_end: string;
  action: 'preview' | 'generate';
  selected_opdrachtgever_ids?: string[];
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const body: AutoFacturatieRequest = await req.json();
    const { org_id, period_start, period_end, action, selected_opdrachtgever_ids } = body;

    // Input validation
    if (!org_id) return jsonResponse({ success: false, error: 'org_id is verplicht' }, 400);
    if (!period_start || !period_end) return jsonResponse({ success: false, error: 'period_start en period_end zijn verplicht' }, 400);
    if (!action || !['preview', 'generate'].includes(action)) return jsonResponse({ success: false, error: 'action moet "preview" of "generate" zijn' }, 400);

    const supabase = createAdminClient();
    logInfo('auto-facturatie', `Starting ${action}`, { org_id, period_start, period_end });

    // Step 1: Query billable shifts
    const { data: diensten, error: dienstenError } = await supabase
      .from('diensten')
      .select(`
        id, titel, datum, start_tijd, eind_tijd, netto_uren, tarief_per_uur,
        sublocation_id,
        dienst_toewijzingen!inner (
          id, professional_id, status,
          professionals!inner ( id, full_name )
        ),
        client_sublocations!inner (
          id, naam, plaats,
          client_locations!inner (
            id, client_org_id,
            client_organizations!inner ( id, name )
          )
        )
      `)
      .eq('org_id', org_id)
      .eq('status', 'voltooid')
      .gte('datum', period_start)
      .lte('datum', period_end)
      .not('tarief_per_uur', 'is', null)
      .gt('tarief_per_uur', 0);

    if (dienstenError) {
      logError('auto-facturatie', 'Failed to query diensten', dienstenError);
      return jsonResponse({ success: false, error: 'Fout bij ophalen diensten' }, 500);
    }

    // Flatten to toewijzingen
    interface Toewijzing {
      toewijzing_id: string;
      dienst_id: string;
      dienst_titel: string;
      datum: string;
      start_tijd: string | null;
      eind_tijd: string | null;
      netto_uren: number;
      tarief_per_uur: number;
      professional_naam: string;
      sublocation_naam: string;
      opdrachtgever_id: string;
      opdrachtgever_naam: string;
    }

    const allToewijzingen: Toewijzing[] = [];
    for (const d of diensten || []) {
      const sub = d.client_sublocations as any;
      const loc = sub?.client_locations;
      const org = loc?.client_organizations;
      
      for (const dt of (d.dienst_toewijzingen as any[]) || []) {
        if (!['bevestigd', 'voltooid'].includes(dt.status)) continue;
        allToewijzingen.push({
          toewijzing_id: dt.id,
          dienst_id: d.id,
          dienst_titel: d.titel || 'Dienst',
          datum: d.datum,
          start_tijd: d.start_tijd,
          eind_tijd: d.eind_tijd,
          netto_uren: d.netto_uren || 0,
          tarief_per_uur: d.tarief_per_uur || 0,
          professional_naam: dt.professionals?.full_name || 'Onbekend',
          sublocation_naam: sub?.naam || 'Onbekend',
          opdrachtgever_id: loc?.client_org_id || '',
          opdrachtgever_naam: org?.name || 'Onbekend',
        });
      }
    }

    // Step 2: Exclude already invoiced toewijzingen
    const { data: invoicedRows } = await supabase
      .from('factuur_regel')
      .select('urenstaat_id, factuur!inner(tenant_id, deleted_at, status)')
      .not('urenstaat_id', 'is', null);

    const invoicedSet = new Set(
      (invoicedRows || [])
        .filter((r: any) => {
          const f = r.factuur;
          return f && f.tenant_id === org_id && !f.deleted_at && f.status !== 'AFGEBOEKT';
        })
        .map((r: any) => r.urenstaat_id)
    );

    // Step 3: Filter out already invoiced
    const billable = allToewijzingen.filter(t => !invoicedSet.has(t.toewijzing_id));

    // Step 4: Group by opdrachtgever
    const grouped = new Map<string, {
      id: string;
      naam: string;
      toewijzingen: Toewijzing[];
      dienst_ids: Set<string>;
    }>();

    for (const t of billable) {
      if (!t.opdrachtgever_id) continue;
      let group = grouped.get(t.opdrachtgever_id);
      if (!group) {
        group = { id: t.opdrachtgever_id, naam: t.opdrachtgever_naam, toewijzingen: [], dienst_ids: new Set() };
        grouped.set(t.opdrachtgever_id, group);
      }
      group.toewijzingen.push(t);
      group.dienst_ids.add(t.dienst_id);
    }

    const opdrachtgevers = Array.from(grouped.values()).map(g => ({
      id: g.id,
      naam: g.naam,
      diensten_count: g.dienst_ids.size,
      toewijzingen_count: g.toewijzingen.length,
      totaal_uren: g.toewijzingen.reduce((s, t) => s + t.netto_uren, 0),
      totaal_bedrag: g.toewijzingen.reduce((s, t) => s + t.netto_uren * t.tarief_per_uur, 0),
      toewijzingen: g.toewijzingen.map(t => ({
        toewijzing_id: t.toewijzing_id,
        dienst_titel: t.dienst_titel,
        datum: t.datum,
        professional_naam: t.professional_naam,
        uren: t.netto_uren,
        tarief: t.tarief_per_uur,
        bedrag: Math.round(t.netto_uren * t.tarief_per_uur * 100) / 100,
      })),
    }));

    const totalen = {
      opdrachtgevers: opdrachtgevers.length,
      diensten: new Set(billable.map(t => t.dienst_id)).size,
      toewijzingen: billable.length,
      uren: billable.reduce((s, t) => s + t.netto_uren, 0),
      bedrag: Math.round(billable.reduce((s, t) => s + t.netto_uren * t.tarief_per_uur, 0) * 100) / 100,
    };

    const executionTime = Date.now() - startTime;

    // Step 5a: Preview
    if (action === 'preview') {
      logSuccess('auto-facturatie', 'Preview complete', { opdrachtgevers: totalen.opdrachtgevers, toewijzingen: totalen.toewijzingen });
      
      await supabase.from('function_call_logs').insert({
        function_name: 'agent-auto-facturatie',
        org_id,
        execution_time_ms: executionTime,
        success: true,
        metadata: { action, period_start, period_end, opdrachtgevers_count: totalen.opdrachtgevers, toewijzingen_count: totalen.toewijzingen },
      }).catch(() => {});

      return jsonResponse({
        success: true,
        action: 'preview',
        opdrachtgevers,
        totalen,
        meta: { period_start, period_end, execution_time_ms: executionTime },
      });
    }

    // Step 5b: Generate
    const selectedOpdrs = selected_opdrachtgever_ids?.length
      ? opdrachtgevers.filter(o => selected_opdrachtgever_ids.includes(o.id))
      : opdrachtgevers;

    if (selectedOpdrs.length === 0) {
      return jsonResponse({
        success: true,
        action: 'generate',
        created_facturen: [],
        totalen: { facturen: 0, regels: 0, bedrag: 0 },
        meta: { period_start, period_end, execution_time_ms: executionTime },
      });
    }

    const createdFacturen: { id: string; factuur_nummer: string; opdrachtgever_naam: string; regels_count: number; totaal: number }[] = [];

    for (const opdr of selectedOpdrs) {
      const regels = opdr.toewijzingen.map((t, idx) => ({
        omschrijving: `${t.dienst_titel} - ${t.professional_naam} (${t.datum})`,
        aantal: t.uren,
        eenheid: 'uur',
        prijs: t.tarief,
        btw_percentage: 21,
        volgorde: idx + 1,
        urenstaat_id: t.toewijzing_id,
      }));

      const subtotaal = regels.reduce((sum, r) => sum + r.aantal * r.prijs, 0);
      const btw_bedrag = subtotaal * 0.21;
      const ftotaal = subtotaal + btw_bedrag;

      const today = new Date().toISOString().split('T')[0];
      const vervaldatum = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: factuur, error: factuurError } = await supabase
        .from('factuur')
        .insert({
          tenant_id: org_id,
          opdrachtgever_id: opdr.id,
          type: 'VERKOOP',
          status: 'CONCEPT',
          factuurdatum: today,
          vervaldatum,
          urenstaat_ids: opdr.toewijzingen.map(t => t.toewijzing_id),
          subtotaal: Math.round(subtotaal * 100) / 100,
          btw_percentage: 21,
          btw_bedrag: Math.round(btw_bedrag * 100) / 100,
          totaal: Math.round(ftotaal * 100) / 100,
          openstaand_bedrag: Math.round(ftotaal * 100) / 100,
          referentie: `Auto-facturatie ${period_start} t/m ${period_end}`,
        })
        .select('id, factuur_nummer')
        .single();

      if (factuurError) {
        logError('auto-facturatie', `Failed to create factuur for ${opdr.naam}`, factuurError);
        continue;
      }

      const { error: regelsError } = await supabase.from('factuur_regel').insert(
        regels.map(r => ({
          factuur_id: factuur.id,
          urenstaat_id: r.urenstaat_id,
          omschrijving: r.omschrijving,
          aantal: r.aantal,
          eenheid: r.eenheid,
          prijs: r.prijs,
          btw_percentage: r.btw_percentage,
          volgorde: r.volgorde,
        }))
      );

      if (regelsError) {
        logError('auto-facturatie', `Failed to create regels for factuur ${factuur.id}`, regelsError);
      }

      createdFacturen.push({
        id: factuur.id,
        factuur_nummer: factuur.factuur_nummer || '',
        opdrachtgever_naam: opdr.naam,
        regels_count: regels.length,
        totaal: Math.round(ftotaal * 100) / 100,
      });
    }

    const generateExecutionTime = Date.now() - startTime;
    logSuccess('auto-facturatie', 'Generate complete', { facturen: createdFacturen.length });

    await supabase.from('function_call_logs').insert({
      function_name: 'agent-auto-facturatie',
      org_id,
      execution_time_ms: generateExecutionTime,
      success: true,
      metadata: {
        action, period_start, period_end,
        facturen_count: createdFacturen.length,
        regels_count: createdFacturen.reduce((s, f) => s + f.regels_count, 0),
      },
    }).catch(() => {});

    return jsonResponse({
      success: true,
      action: 'generate',
      created_facturen: createdFacturen,
      totalen: {
        facturen: createdFacturen.length,
        regels: createdFacturen.reduce((s, f) => s + f.regels_count, 0),
        bedrag: Math.round(createdFacturen.reduce((s, f) => s + f.totaal, 0) * 100) / 100,
      },
      meta: { period_start, period_end, execution_time_ms: generateExecutionTime },
    });
  } catch (err) {
    logError('auto-facturatie', 'Unexpected error', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Onverwachte fout' }, 500);
  }
});
