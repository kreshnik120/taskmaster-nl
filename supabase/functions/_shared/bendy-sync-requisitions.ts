/**
 * BENDY SYNC — Requisitions (diensten) sync logic
 * SYNC-FIX-1: Datumfiltering (A), source tagging (C), catch-up toewijzingen (B)
 */

import { logInfo, logWarning } from './core.ts';
import {
  FUNCTION_NAME,
  fetchAllBendyRecords,
  fetchDeltaBendyRecords,
  batchUpsert,
  parallelUpdates,
  type SyncResult,
  type FetchResult,
} from './bendy-helpers.ts';

export async function syncRequisitions(
  adminClient: any,
  tenant: string,
  orgId: string,
  syncType: string,
  syncLogId?: string,
  lastSyncAt?: string | null,
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

  // ═══ FIX A: Datumvenster berekenen ═══
  const now = new Date();
  const dateFrom = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = new Date(now.getTime() + 56 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateFilterExtraParams: Record<string, string> = {
    'filter[start_date_from]': dateFrom,
    'filter[start_date_to]': dateTo,
  };
  logInfo(FUNCTION_NAME, `Datumvenster: ${dateFrom} → ${dateTo}`);

  // ═══ STAP 1: Haal data op (PARALLEL) ═══
  const isDelta = syncType === 'incremental' && lastSyncAt;
  const cutoffDate = isDelta
    ? new Date(new Date(lastSyncAt).getTime() - 60_000).toISOString()
    : null;

  let openResult: FetchResult;
  let assignedResult: FetchResult;

  if (isDelta && cutoffDate) {
    logInfo(FUNCTION_NAME, `Delta requisition sync: cutoff=${cutoffDate}, dateFilter=${dateFilterParams}`);
    const [deltaOpen, deltaAssigned] = await Promise.all([
      fetchDeltaBendyRecords(tenant, `/api/v2/requisitions/open?${dateFilterParams}`, cutoffDate, adminClient),
      fetchDeltaBendyRecords(tenant, `/api/v2/requisitions/assigned?${dateFilterParams}`, cutoffDate, adminClient, { include: 'flex_user_company' }),
    ]);
    openResult = deltaOpen;
    assignedResult = deltaAssigned;
  } else {
    logInfo(FUNCTION_NAME, `Full requisition sync, dateFilter=${dateFilterParams}`);
    const [fullOpen, fullAssigned] = await Promise.all([
      fetchAllBendyRecords(tenant, `/api/v2/requisitions/open?${dateFilterParams}`),
      fetchAllBendyRecords(tenant, `/api/v2/requisitions/assigned?${dateFilterParams}`, { include: 'flex_user_company' }),
    ]);
    openResult = fullOpen;
    assignedResult = fullAssigned;
  }

  let openRecords = openResult.records;
  let assignedRecords = assignedResult.records;

  // ═══ FIX C: Tag records met bron-endpoint ═══
  for (const r of openRecords) (r as any)._source = 'open';
  for (const r of assignedRecords) (r as any)._source = 'assigned';

  // ═══ FIX A fallback: In-memory datumfilter ═══
  const beforeOpen = openRecords.length;
  const beforeAssigned = assignedRecords.length;
  openRecords = openRecords.filter((r: any) => {
    const d = r.attributes?.date;
    return !d || (d >= dateFrom && d <= dateTo);
  });
  assignedRecords = assignedRecords.filter((r: any) => {
    const d = r.attributes?.date;
    return !d || (d >= dateFrom && d <= dateTo);
  });
  if (beforeOpen !== openRecords.length || beforeAssigned !== assignedRecords.length) {
    logInfo(FUNCTION_NAME, `In-memory datumfilter: open ${beforeOpen}→${openRecords.length}, assigned ${beforeAssigned}→${assignedRecords.length}`);
  }

  const allRecords = [...openRecords, ...assignedRecords];
  result.fetched = allRecords.length;

  await logProgress('1-FETCH', { open: openRecords.length, assigned: assignedRecords.length, total: allRecords.length, dateFrom, dateTo });

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
    .eq('is_active', true)
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

  const skipDiag = {
    sublocation_miss: 0,
    datum_ontbreekt: 0,
    tijd_ontbreekt: 0,
    missing_client_ids: [] as string[],
    bendy_status_verdeling: {} as Record<string, number>,
  };

  // ═══ FIX C: mapStatus met source parameter ═══
  const mapStatus = (bendyStatus: string, source: string): string => {
    if (source === 'assigned') return 'volledig_bezet';
    if (bendyStatus === 'closed') return 'volledig_bezet';
    return 'open';
  };

  const CHECKPOINT_INTERVAL = 500;
  for (let idx = 0; idx < allRecords.length; idx++) {
    const record = allRecords[idx];
    try {
        const bendyId = String(record.id);
        const attrs = record.attributes || {};
        const rels = record.relationships || {};
        const source = (record as any)._source || 'unknown';

        const rawStatus = String(attrs.status || 'unknown');
        skipDiag.bendy_status_verdeling[rawStatus] = (skipDiag.bendy_status_verdeling[rawStatus] || 0) + 1;

      cacheWrites.push({
        org_id: orgId, tenant, entity_type: 'requisitions',
        bendy_id: bendyId, raw_data: record,
        fetched_at: new Date().toISOString(),
      });

      const clientBendyId = rels.client?.data?.id ? String(rels.client.data.id) : null;
      const sublocationId = clientBendyId ? subMap.get(clientBendyId) : null;

      if (!sublocationId) {
          result.skipped++;
          skipDiag.sublocation_miss++;
          if (clientBendyId && skipDiag.missing_client_ids.length < 50) {
            skipDiag.missing_client_ids.push(`${clientBendyId}|${attrs.name || ''}|${attrs.date || ''}`);
          }
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
          if (!attrs.date) skipDiag.datum_ontbreekt++;
          if (!startTijd || !eindTijd) skipDiag.tijd_ontbreekt++;
          result.errors.push(`Req ${bendyId}: datum/tijd ontbreekt (date=${attrs.date}, start=${attrs.start_time}, end=${attrs.end_time})`);
          continue;
        }

      const existingDienst = dienstMap.get(bendyId);

      if (existingDienst) {
        const updateData: Record<string, any> = {};
        const newStatus = mapStatus(attrs.status, source);
        // FIX C: Sta herstel toe van geannuleerd → volledig_bezet (assigned endpoint)
        if (existingDienst.status !== newStatus &&
            existingDienst.status !== 'voltooid') {
          // Allow geannuleerd → volledig_bezet if source is assigned
          if (existingDienst.status === 'geannuleerd' && source === 'assigned') {
            updateData.status = newStatus;
          } else if (existingDienst.status !== 'geannuleerd') {
            updateData.status = newStatus;
          }
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
          pauze_minuten: pauzeMinuten, status: mapStatus(attrs.status, source),
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

    if ((idx + 1) % CHECKPOINT_INTERVAL === 0) {
      await logProgress('3-BATCH', {
        progress: `${idx + 1}/${allRecords.length}`,
        inserts: dienstInserts.length,
        updates: dienstUpdates.length,
        skipped: result.skipped,
        failed: result.failed,
      });
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
  const twStats = { created: 0, skipped: 0, noMatch: 0, overlapError: 0, catchupCreated: 0, catchupNoMatch: 0 };

  // 5A: flex_user_company → user bendy_id map (via cache)
  const fucMap = new Map<string, string>();
  const metadata_fuc: any = { debug_fuc_map_source: 'none', debug_cache_users_checked: 0, debug_cache_users_with_company: 0, debug_duplicate_companies: 0 };

  const fucIds = new Set<string>();
  for (const req of allRecords) {
    const fucId = req.relationships?.flex_user_company?.data?.id;
    if (fucId) fucIds.add(String(fucId));
  }
  logInfo(FUNCTION_NAME, `${fucIds.size} unieke flex_user_company IDs gevonden in requisitions`);

  // Build fucMap: company ID → user bendy_id
  if (fucIds.size > 0) {
    const cachedUsers: any[] = [];
    let cacheOffset = 0;
    const CACHE_PAGE = 1000;
    while (true) {
      const { data: chunk } = await adminClient
        .from('bendy_raw_cache')
        .select('bendy_id, raw_data')
        .eq('org_id', orgId)
        .eq('entity_type', 'users')
        .range(cacheOffset, cacheOffset + CACHE_PAGE - 1);
      if (!chunk || chunk.length === 0) break;
      cachedUsers.push(...chunk);
      if (chunk.length < CACHE_PAGE) break;
      cacheOffset += CACHE_PAGE;
    }

    let cacheChecked = 0, cacheWithCompany = 0, duplicateCompanies = 0;
    for (const cu of (cachedUsers || [])) {
      cacheChecked++;
      const companyId = (cu.raw_data as any)?.relationships?.company?.data?.id;
      if (companyId) {
        cacheWithCompany++;
        if (fucMap.has(String(companyId))) duplicateCompanies++;
        fucMap.set(String(companyId), String(cu.bendy_id));
      }
    }
    metadata_fuc.debug_fuc_map_source = fucMap.size > 0 ? 'company_match' : 'none';
    metadata_fuc.debug_cache_users_checked = cacheChecked;
    metadata_fuc.debug_cache_users_with_company = cacheWithCompany;
    metadata_fuc.debug_duplicate_companies = duplicateCompanies;
    logInfo(FUNCTION_NAME, `Company match: ${cacheChecked} users checked, ${cacheWithCompany} with company, fucMap: ${fucMap.size}`);
  }

  await logProgress('2B-FUC-MAP', { fucIdsFromReqs: fucIds.size, fucMapSize: fucMap.size, ...metadata_fuc });

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
  const dienstenMetToewijzing = new Set<string>(); // track dienst_ids that have any toewijzing
  const TW_CHUNK = 500;
  for (let i = 0; i < allDienstIds.length; i += TW_CHUNK) {
    const chunk = allDienstIds.slice(i, i + TW_CHUNK);
    const { data: twData } = await adminClient
      .from('dienst_toewijzingen')
      .select('dienst_id, professional_id')
      .in('dienst_id', chunk);
    (twData || []).forEach((tw: any) => {
      existingToewijzingen.add(`${tw.dienst_id}|${tw.professional_id}`);
      dienstenMetToewijzing.add(tw.dienst_id);
    });
  }
  await logProgress('2D-EXISTING-TW', { existingCount: existingToewijzingen.size });

  // 5D: Verzamel toewijzingen uit huidige sync-run
  const toewijzingenToInsert: any[] = [];
  for (const req of allRecords) {
    const bendyId = String(req.id);
    const dienst = dienstMap.get(bendyId);
    if (!dienst?.id) continue;

    const fucId = req.relationships?.flex_user_company?.data?.id;
    if (!fucId) continue;

    const userBendyId = fucMap.get(String(fucId));
    if (!userBendyId) {
      twStats.noMatch++;
      continue;
    }

    const prof = profMap.get(userBendyId);
    if (!prof) {
      twStats.noMatch++;
      continue;
    }

    const key = `${dienst.id}|${prof.id}`;
    if (existingToewijzingen.has(key)) {
      twStats.skipped++;
      continue;
    }
    existingToewijzingen.add(key);
    dienstenMetToewijzing.add(dienst.id);
    toewijzingenToInsert.push({
      dienst_id: dienst.id,
      professional_id: prof.id,
      status: 'bevestigd',
      positie_nr: 1,
      toewijzing_notities: `Bendy sync: flex_user_company ${fucId}`,
    });
  }

  // 5E: Batch insert in chunks van 50
  const TW_INSERT_CHUNK = 50;
  for (let i = 0; i < toewijzingenToInsert.length; i += TW_INSERT_CHUNK) {
    const chunk = toewijzingenToInsert.slice(i, i + TW_INSERT_CHUNK);
    const { error } = await adminClient.from('dienst_toewijzingen').insert(chunk);
    if (error) {
      const results = await Promise.allSettled(
        chunk.map(tw => adminClient.from('dienst_toewijzingen').insert(tw))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) {
          twStats.created++;
        } else {
          twStats.overlapError++;
        }
      }
    } else {
      twStats.created += chunk.length;
    }
    if (twStats.created > 0 && twStats.created % 500 < TW_INSERT_CHUNK) {
      await logProgress('5-TW-PROGRESS', { created: twStats.created, total: toewijzingenToInsert.length });
    }
  }

  // ═══ FIX B: STAP 5F — Catch-up toewijzingen voor bestaande diensten ═══
  logInfo(FUNCTION_NAME, `STAP 5F: Catch-up toewijzingen starten...`);
  const catchupInserts: any[] = [];

  // Zoek diensten met status volledig_bezet, datum in sync-venster, ZONDER toewijzing
  const dienstenZonderTw: { id: string; bendy_id: string }[] = [];
  for (const [bendyId, dienst] of dienstMap.entries()) {
    if (!dienst.id) continue;
    if (dienst.status !== 'volledig_bezet') continue;
    if (dienst.datum < dateFrom || dienst.datum > dateTo) continue;
    if (dienstenMetToewijzing.has(dienst.id)) continue;
    // Also skip if already in toewijzingenToInsert
    if (toewijzingenToInsert.some((t: any) => t.dienst_id === dienst.id)) continue;
    dienstenZonderTw.push({ id: dienst.id, bendy_id: bendyId });
  }

  logInfo(FUNCTION_NAME, `STAP 5F: ${dienstenZonderTw.length} diensten zonder toewijzing gevonden`);

  if (dienstenZonderTw.length > 0) {
    // Fetch bendy_raw_cache records for these diensten
    const bendyIdsToLookup = dienstenZonderTw.map(d => d.bendy_id);
    const cacheRecords = new Map<string, any>();
    const CACHE_LOOKUP_CHUNK = 200;
    for (let i = 0; i < bendyIdsToLookup.length; i += CACHE_LOOKUP_CHUNK) {
      const chunk = bendyIdsToLookup.slice(i, i + CACHE_LOOKUP_CHUNK);
      const { data: cacheData } = await adminClient
        .from('bendy_raw_cache')
        .select('bendy_id, raw_data')
        .eq('org_id', orgId)
        .eq('entity_type', 'requisitions')
        .in('bendy_id', chunk);
      (cacheData || []).forEach((c: any) => cacheRecords.set(c.bendy_id, c.raw_data));
    }

    for (const dienst of dienstenZonderTw) {
      const cachedReq = cacheRecords.get(dienst.bendy_id);
      if (!cachedReq) { twStats.catchupNoMatch++; continue; }

      const fucId = cachedReq?.relationships?.flex_user_company?.data?.id;
      if (!fucId) { twStats.catchupNoMatch++; continue; }

      const userBendyId = fucMap.get(String(fucId));
      if (!userBendyId) { twStats.catchupNoMatch++; continue; }

      const prof = profMap.get(userBendyId);
      if (!prof) { twStats.catchupNoMatch++; continue; }

      const key = `${dienst.id}|${prof.id}`;
      if (existingToewijzingen.has(key)) continue;
      existingToewijzingen.add(key);

      catchupInserts.push({
        dienst_id: dienst.id,
        professional_id: prof.id,
        status: 'bevestigd',
        positie_nr: 1,
        toewijzing_notities: `SYNC-FIX-1 catch-up: fuc ${fucId}`,
      });
    }

    // Insert catch-up toewijzingen with individual error handling
    for (let i = 0; i < catchupInserts.length; i += TW_INSERT_CHUNK) {
      const chunk = catchupInserts.slice(i, i + TW_INSERT_CHUNK);
      const { error } = await adminClient.from('dienst_toewijzingen').insert(chunk);
      if (error) {
        const results = await Promise.allSettled(
          chunk.map(tw => adminClient.from('dienst_toewijzingen').insert(tw))
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && !r.value.error) {
            twStats.catchupCreated++;
          } else {
            twStats.overlapError++;
          }
        }
      } else {
        twStats.catchupCreated += chunk.length;
      }
    }
  }

  logInfo(FUNCTION_NAME, `STAP 5F: ${twStats.catchupCreated} catch-up toewijzingen aangemaakt, ${twStats.catchupNoMatch} geen match`);
  await logProgress('5F-CATCHUP', { dienstenZonderTw: dienstenZonderTw.length, created: twStats.catchupCreated, noMatch: twStats.catchupNoMatch });

  await logProgress('5-TOEWIJZINGEN', twStats);

  // ═══ STAP 6: Stale requisitions cleanup (alleen bij full sync) ═══
  const staleStats = { marked: 0, skipped_old: 0, skipped_status: 0 };

  if (!isDelta) {
    const seenBendyIds = new Set<string>();
    for (const record of allRecords) {
      seenBendyIds.add(String(record.id));
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cutoffDateStr = yesterday.toISOString().split('T')[0];

    for (const [bendyId, dienst] of dienstMap.entries()) {
      if (seenBendyIds.has(bendyId)) continue;
      if (dienst.datum < cutoffDateStr) { staleStats.skipped_old++; continue; }
      if (['geannuleerd', 'voltooid'].includes(dienst.status)) { staleStats.skipped_status++; continue; }
      const { error } = await adminClient
        .from('diensten')
        .update({ status: 'geannuleerd', updated_at: new Date().toISOString() })
        .eq('id', dienst.id);
      if (!error) staleStats.marked++;
    }
  } else {
    logInfo(FUNCTION_NAME, 'Stale cleanup overgeslagen (delta sync)');
  }
  await logProgress('6-STALE-CLEANUP', staleStats);

  // Metadata opslaan
  result.errors.push(`SKIP_DIAG:${JSON.stringify(skipDiag)}`);

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
            toewijzingen_catchup_created: twStats.catchupCreated,
            toewijzingen_catchup_no_match: twStats.catchupNoMatch,
            debug_fuc_ids_from_reqs: fucIds.size,
            debug_fuc_map_size: fucMap.size,
            debug_prof_map_size: profMap.size,
            debug_existing_tw: existingToewijzingen.size,
            debug_stale_marked: staleStats.marked,
            debug_stale_skipped_old: staleStats.skipped_old,
            debug_stale_skipped_status: staleStats.skipped_status,
            debug_date_filter: { from: dateFrom, to: dateTo },
            skip_diagnostiek: skipDiag,
            ...metadata_fuc,
          },
        })
        .eq('id', syncLogId);
    } catch (_e) { /* ignore */ }
  }

  logInfo(FUNCTION_NAME, `Requisition sync voltooid: ${result.fetched} opgehaald, ${result.created} nieuw, ${result.updated} bijgewerkt, ${result.failed} gefaald, toewijzingen: ${twStats.created} + ${twStats.catchupCreated} catch-up`);
  return result;
}
