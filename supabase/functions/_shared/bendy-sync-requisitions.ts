/**
 * BENDY SYNC — Requisitions (diensten) sync logic
 */

import { logInfo, logWarning } from './core.ts';
import {
  FUNCTION_NAME,
  fetchAllBendyRecords,
  fetchBendyApi,
  batchUpsert,
  parallelUpdates,
  type SyncResult,
} from './bendy-helpers.ts';

export async function syncRequisitions(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: string,
  syncLogId?: string,
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  const logProgress = async (step: string, data: Record<string, any> = {}) => {
    if (!syncLogId) return;
    try {
      await adminClient
        .from('bendy_sync_log')
        .update({ errors: [`STAP: ${step}`, JSON.stringify(data).substring(0, 500)] })
        .eq('id', syncLogId);
    } catch (_e) { /* ignore */ }
  };

  // ═══ STAP 1: Haal data op (PARALLEL) ═══
  const [openResult, assignedResult] = await Promise.all([
    fetchAllBendyRecords(tenant, '/api/v2/requisitions/open'),
    fetchAllBendyRecords(tenant, '/api/v2/requisitions/assigned'),
  ]);
  const openRecords = openResult.records;
  const assignedRecords = assignedResult.records;
  const allRecords = [...openRecords, ...assignedRecords];
  result.fetched = allRecords.length;

  await logProgress('1-FETCH', { open: openRecords.length, assigned: assignedRecords.length, total: allRecords.length });

  if (allRecords.length === 0) return result;

  // ═══ STAP 2: Pre-fetch lokale data ═══
  const { data: existingDiensten } = await adminClient
    .from('diensten')
    .select('id, bendy_id, status, datum, start_tijd, eind_tijd, sublocation_id')
    .eq('org_id', orgId)
    .not('bendy_id', 'is', null)
    .limit(50000);

  const dienstMap = new Map<string, any>();
  (existingDiensten || []).forEach((d: any) => dienstMap.set(d.bendy_id, d));

  const { data: sublocations } = await adminClient
    .from('client_sublocations')
    .select('id, bendy_id')
    .not('bendy_id', 'is', null)
    .limit(5000);

  const subMap = new Map<string, string>();
  (sublocations || []).forEach((s: any) => subMap.set(String(s.bendy_id), s.id));

  await logProgress('2-PREFETCH', { existingDiensten: dienstMap.size, sublocations: subMap.size });

  // ═══ STAP 3: Verwerk in-memory ═══
  const cacheWrites: any[] = [];
  const dienstInserts: any[] = [];
  const dienstUpdates: any[] = [];
  const mappingWrites: any[] = [];

  for (const record of allRecords) {
    try {
      const bendyId = String(record.id);
      const attrs = record.attributes || {};
      const rels = record.relationships || {};

      cacheWrites.push({
        org_id: orgId, tenant, entity_type: 'requisitions',
        bendy_id: bendyId, raw_data: record,
        fetched_at: new Date().toISOString(),
      });

      const clientBendyId = rels.client?.data?.id ? String(rels.client.data.id) : null;
      const sublocationId = clientBendyId ? subMap.get(clientBendyId) : null;

      if (!sublocationId) {
        result.skipped++;
        mappingWrites.push({
          org_id: orgId, tenant, entity_type: 'dienst',
          bendy_id: bendyId, local_id: '00000000-0000-0000-0000-000000000000',
          sync_status: 'pending',
          conflict_data: { reason: 'sublocation_not_found', client_bendy_id: clientBendyId, name: attrs.name, date: attrs.date },
          last_synced_at: new Date().toISOString(),
        });
        continue;
      }

      const extractTime = (dt: string | null): string | null => {
        if (!dt) return null;
        const match = dt.match(/T(\d{2}:\d{2})/);
        return match ? match[1] + ':00' : null;
      };

      let pauzeMinuten = 0;
      if (attrs.pauze_required && attrs.pauze_start_time && attrs.pauze_end_time) {
        const ps = new Date(attrs.pauze_start_time).getTime();
        const pe = new Date(attrs.pauze_end_time).getTime();
        pauzeMinuten = Math.round((pe - ps) / 60000);
        if (pauzeMinuten < 0) pauzeMinuten = 0;
        if (pauzeMinuten > 480) pauzeMinuten = 480;
      }

      const mapStatus = (bendyStatus: string): string => {
        if (bendyStatus === 'open') return 'open';
        if (bendyStatus === 'closed') return 'volledig_bezet';
        return 'open';
      };

      const deriveDienstType = (startTime: string | null): string => {
        if (!startTime) return 'dag';
        const hour = parseInt(startTime.split(':')[0], 10);
        if (hour >= 22 || hour < 7) return 'nacht';
        if (hour >= 17) return 'avond';
        return 'dag';
      };

      const deriveNiveau = (comment: string | null): string[] => {
        if (!comment) return [];
        const c = comment.toLowerCase().trim();
        if (c.includes('begeleider') && !c.includes('assistent')) return ['Begeleider'];
        if (c.includes('assistent begeleider') || c.includes('assistent-begeleider')) return ['Assistent begeleider'];
        if (c.includes('verpleegkundige')) return ['Verpleegkundige'];
        if (c.includes('verzorgende')) return ['Verzorgende'];
        return [];
      };

      const startTijd = extractTime(attrs.start_time);
      const eindTijd = extractTime(attrs.end_time);

      if (!attrs.date || !startTijd || !eindTijd) {
        result.failed++;
        result.errors.push(`Req ${bendyId}: datum/tijd ontbreekt`);
        continue;
      }

      const existingDienst = dienstMap.get(bendyId);

      if (existingDienst) {
        const updateData: Record<string, any> = {};
        const newStatus = mapStatus(attrs.status);
        if (existingDienst.status !== newStatus &&
            existingDienst.status !== 'geannuleerd' &&
            existingDienst.status !== 'voltooid') {
          updateData.status = newStatus;
        }
        if (existingDienst.datum !== attrs.date) updateData.datum = attrs.date;
        if (existingDienst.start_tijd !== startTijd) updateData.start_tijd = startTijd;
        if (existingDienst.eind_tijd !== eindTijd) updateData.eind_tijd = eindTijd;

        if (Object.keys(updateData).length > 0) {
          dienstUpdates.push({ id: existingDienst.id, data: updateData });
          result.updated++;
        } else {
          result.skipped++;
        }
        existingDienst.bendy_id = bendyId;
      } else {
        dienstInserts.push({
          org_id: orgId, sublocation_id: sublocationId, bendy_id: bendyId,
          titel: attrs.name || 'Bendy dienst', datum: attrs.date,
          start_tijd: startTijd, eind_tijd: eindTijd,
          pauze_minuten: pauzeMinuten, status: mapStatus(attrs.status),
          dienst_type: deriveDienstType(startTijd),
          gevraagd_functie_niveau: deriveNiveau(attrs.comment),
          gevraagd_aantal: 1, publieke_opmerking: attrs.comment || null,
          prive_opmerking: attrs.private_comment || null,
          flexwerker_opmerking: attrs.flexwerker_comment || null,
          is_slaapdienst: attrs.sleep_duty || false,
          slaap_start_tijd: extractTime(attrs.sleep_duty_start_time),
          slaap_eind_tijd: extractTime(attrs.sleep_duty_end_time),
          bron: 'geimporteerd', accepteerbaar: true,
        });
        result.created++;
      }

      mappingWrites.push({
        org_id: orgId, tenant, entity_type: 'dienst',
        bendy_id: bendyId,
        local_id: existingDienst?.id || '00000000-0000-0000-0000-000000000000',
        sync_status: 'synced', bendy_updated_at: attrs.updated_at,
        last_synced_at: new Date().toISOString(),
      });
    } catch (error) {
      result.failed++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Req ${record.id}: ${msg.substring(0, 200)}`);
      if (result.errors.length > 20) break;
    }
  }

  const nullBendyCount = dienstInserts.filter((d: any) => !d.bendy_id).length;
  const nullOrgCount = dienstInserts.filter((d: any) => !d.org_id).length;
  await logProgress('3B-NULL-CHECK', {
    msg: `Inserts met bendy_id=NULL: ${nullBendyCount}, org_id=NULL: ${nullOrgCount}, totaal inserts: ${dienstInserts.length}`,
  });
  if (dienstInserts.length > 0) {
    await logProgress('3C-SAMPLE', {
      sample: dienstInserts.slice(0, 5).map((d: any) => ({
        bendy_id: d.bendy_id, org_id: d.org_id, datum: d.datum, locatie: d.sublocation_id,
      })),
    });
  }

  await logProgress('3-VERWERKT', {
    inserts: dienstInserts.length, updates: dienstUpdates.length,
    skipped: result.skipped, failed: result.failed, cache: cacheWrites.length,
  });

  // ═══ STAP 4: Batch DB writes ═══
  if (cacheWrites.length > 0) await batchUpsert(adminClient, 'bendy_raw_cache', cacheWrites, 'tenant,entity_type,bendy_id');
  if (dienstUpdates.length > 0) await parallelUpdates(adminClient, 'diensten', dienstUpdates);
  if (dienstInserts.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < dienstInserts.length; i += CHUNK) {
      const chunk = dienstInserts.slice(i, i + CHUNK);
      const { data: upserted, error } = await adminClient
        .from('diensten')
        .upsert(chunk, { onConflict: 'org_id,bendy_id' })
        .select('id, bendy_id');
      if (error) logWarning(FUNCTION_NAME, `Diensten upsert chunk ${i}/${dienstInserts.length} fout: ${error.message}`);
      if (upserted) {
        for (const row of upserted) {
          const mapping = mappingWrites.find((m: any) => m.bendy_id === row.bendy_id && m.sync_status === 'synced');
          if (mapping && row.id) mapping.local_id = row.id;
        }
      }
    }
  }
  if (mappingWrites.length > 0) await batchUpsert(adminClient, 'bendy_id_mapping', mappingWrites, 'tenant,entity_type,bendy_id');

  await logProgress('4-GESCHREVEN', { created: result.created, updated: result.updated });

  // ═══ STAP 4B: dienstMap bijwerken ═══
  if (dienstInserts.length > 0) {
    const { data: refreshedDiensten } = await adminClient
      .from('diensten')
      .select('id, bendy_id')
      .eq('org_id', orgId)
      .not('bendy_id', 'is', null)
      .limit(50000);
    (refreshedDiensten || []).forEach((d: any) => {
      if (!dienstMap.has(d.bendy_id)) {
        dienstMap.set(d.bendy_id, d);
      } else {
        const existing = dienstMap.get(d.bendy_id);
        if (existing && !existing.id) existing.id = d.id;
      }
    });
  }

  // ═══ STAP 5: Toewijzingen ═══
  const twStats = { created: 0, skipped: 0, noMatch: 0, overlapError: 0 };

  // 5A: flex_user_company → user bendy_id map (individuele fetches)
  const fucMap = new Map<string, string>();
  let debugFucData: any = {};

  const fucIds = new Set<string>();
  for (const req of allRecords) {
    const fucId = req.relationships?.flex_user_company?.data?.id;
    if (fucId) fucIds.add(String(fucId));
  }
  logInfo(FUNCTION_NAME, `${fucIds.size} unieke flex_user_company IDs gevonden in requisitions`);

  if (fucIds.size > 0) {
    let fucSuccess = 0;
    let fucFailed = 0;
    let fucApiError = '';
    const fucIdArray = [...fucIds];
    const BATCH_SIZE = 5;

    for (let i = 0; i < fucIdArray.length; i += BATCH_SIZE) {
      const batch = fucIdArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (fucId) => {
          try {
            const response = await fetchBendyApi(tenant, `/api/v2/flex_user_companies/${fucId}`, { include: 'user' });
            const record = response?.data;
            if (record) {
              const userId = record.relationships?.user?.data?.id
                          || record.relationships?.flex_user?.data?.id;
              if (userId) {
                fucMap.set(String(fucId), String(userId));
                return { fucId, userId, status: 'ok' };
              }
              return { fucId, status: 'no_user_rel', keys: Object.keys(record.relationships || {}) };
            }
            return { fucId, status: 'no_data' };
          } catch (err: any) {
            if (!fucApiError) fucApiError = err.message;
            throw err;
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') fucSuccess++;
        else fucFailed++;
      }
    }

    debugFucData = {
      debug_fuc_individual_success: fucSuccess,
      debug_fuc_individual_failed: fucFailed,
      debug_fuc_api_error: fucApiError || null,
      debug_fuc_map_size_after_individual: fucMap.size,
    };
    logInfo(FUNCTION_NAME, `Individuele FUC fetch: ${fucSuccess} succes, ${fucFailed} gefaald, fucMap: ${fucMap.size}`);
  }

  // Fallback via bendy_raw_cache
  if (fucMap.size === 0 && fucIds.size > 0) {
    logWarning(FUNCTION_NAME, 'flex_user_companies API leverde geen user mappings, probeer cache fallback');
    const { data: cachedUsers } = await adminClient
      .from('bendy_raw_cache')
      .select('bendy_id, raw_data')
      .eq('org_id', orgId)
      .eq('entity_type', 'users')
      .limit(50000);
    for (const cu of (cachedUsers || [])) {
      const raw = cu.raw_data as any;
      const fucs = raw?.relationships?.flex_user_companies?.data;
      if (Array.isArray(fucs)) {
        for (const fuc of fucs) {
          if (fuc.id) fucMap.set(String(fuc.id), String(cu.bendy_id));
        }
      }
    }
    logInfo(FUNCTION_NAME, `Cache fallback: fucMap ${fucMap.size} mappings`);
  }

  await logProgress('2B-FUC-MAP', { fucIdsFromReqs: fucIds.size, fucMapSize: fucMap.size, method: fucMap.size > 0 ? 'api_fetch' : 'none' });

  // 5B: professionals bendy_id → professional_id map (chunked fetch)
  let profsWithBendy: any[] = [];
  let profOffset = 0;
  const PROF_PAGE = 1000;
  while (true) {
    const { data: chunk } = await adminClient
      .from('professionals')
      .select('id, bendy_id, full_name')
      .eq('org_id', orgId)
      .not('bendy_id', 'is', null)
      .range(profOffset, profOffset + PROF_PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    profsWithBendy.push(...chunk);
    if (chunk.length < PROF_PAGE) break;
    profOffset += PROF_PAGE;
  }
  const profMap = new Map<string, { id: string; name: string }>();
  (profsWithBendy || []).forEach((p: any) => {
    profMap.set(String(p.bendy_id), { id: p.id, name: p.full_name });
  });
  await logProgress('2C-PROF-MAP', { profMapSize: profMap.size });

  // 5C: bestaande toewijzingen pre-fetch
  const allDienstIds = [...dienstMap.values()].filter((d: any) => d.id).map((d: any) => d.id);
  const existingToewijzingen = new Set<string>();
  const TW_CHUNK = 500;
  for (let i = 0; i < allDienstIds.length; i += TW_CHUNK) {
    const chunk = allDienstIds.slice(i, i + TW_CHUNK);
    const { data: twData } = await adminClient
      .from('dienst_toewijzingen')
      .select('dienst_id, professional_id')
      .in('dienst_id', chunk);
    (twData || []).forEach((tw: any) => {
      existingToewijzingen.add(`${tw.dienst_id}|${tw.professional_id}`);
    });
  }
  await logProgress('2D-EXISTING-TW', { existingCount: existingToewijzingen.size });

  // 5D: Loop door records en maak toewijzingen
  let noMatchSamples = 0;
  for (const req of allRecords) {
    const bendyId = String(req.id);
    const dienst = dienstMap.get(bendyId);
    if (!dienst?.id) continue;

    const fucId = req.relationships?.flex_user_company?.data?.id;
    if (!fucId) continue;

    const userBendyId = fucMap.get(String(fucId));
    if (!userBendyId) {
      twStats.noMatch++;
      if (noMatchSamples < 3) {
        logInfo(FUNCTION_NAME, `No-match sample: fucId=${fucId}, userBendyId=undefined (niet in fucMap)`);
        noMatchSamples++;
      }
      continue;
    }

    const prof = profMap.get(userBendyId);
    if (!prof) {
      twStats.noMatch++;
      if (noMatchSamples < 3) {
        logInfo(FUNCTION_NAME, `No-match sample: fucId=${fucId}, userBendyId=${userBendyId}, prof niet gevonden in profMap`);
        noMatchSamples++;
      }
      continue;
    }

    const key = `${dienst.id}|${prof.id}`;
    if (existingToewijzingen.has(key)) {
      twStats.skipped++;
      continue;
    }

    const { error: twError } = await adminClient
      .from('dienst_toewijzingen')
      .insert({
        dienst_id: dienst.id,
        professional_id: prof.id,
        status: 'bevestigd',
        positie_nr: 1,
        toewijzing_notities: `Bendy sync: flex_user_company ${fucId}`,
      });

    if (twError) {
      twStats.overlapError++;
      logWarning(FUNCTION_NAME, `Toewijzing fout voor ${prof.name} op dienst ${dienst.id}: ${twError.message}`);
    } else {
      twStats.created++;
      existingToewijzingen.add(key);
    }
  }

  await logProgress('5-TOEWIJZINGEN', twStats);

  // Metadata opslaan
  if (syncLogId) {
    try {
      await adminClient
        .from('bendy_sync_log')
        .update({
          metadata: {
            toewijzingen_created: twStats.created,
            toewijzingen_skipped: twStats.skipped,
            toewijzingen_no_match: twStats.noMatch,
            toewijzingen_overlap: twStats.overlapError,
            debug_fuc_ids_from_reqs: fucIds.size,
            debug_fuc_map_size: fucMap.size,
            debug_prof_map_size: profMap.size,
            debug_existing_tw: existingToewijzingen.size,
            debug_method: fucMap.size > 0 ? 'api_fetch' : 'fallback_or_none',
            ...debugFucData,
          },
        })
        .eq('id', syncLogId);
    } catch (_e) { /* ignore */ }
  }

  logInfo(FUNCTION_NAME, `Requisition sync voltooid: ${result.fetched} opgehaald, ${result.created} nieuw, ${result.updated} bijgewerkt, ${result.failed} gefaald, toewijzingen: ${twStats.created} aangemaakt`);
  return result;
}
