/**
 * BENDY SYNC ENGINE — Enterprise Edge Function
 * Main handler: status check, cron sync, manual sync triggers
 */

import {
  corsHeaders,
  handleCors,
  createAdminClient,
  createAnonClient,
  jsonResponse,
  errorResponse,
  logInfo,
  logSuccess,
  logWarning,
  logError,
} from '../_shared/core.ts';

import {
  canExecute,
  recordSuccess,
  recordFailure,
} from '../_shared/circuit-breaker.ts';

import {
  FUNCTION_NAME,
  FUNCTION_VERSION,
  TENANT_CONFIG,
  acquireSyncLock,
  releaseSyncLock,
  analyzeFieldFillRates,
  type SyncResult,
} from '../_shared/bendy-helpers.ts';

import { syncClients } from '../_shared/bendy-sync-clients.ts';
import { syncUsers } from '../_shared/bendy-sync-users.ts';
import { syncDocuments } from '../_shared/bendy-sync-documents.ts';
import { syncRequisitions } from '../_shared/bendy-sync-requisitions.ts';

// ============================================
// STATUS CHECK (GET endpoint)
// ============================================

async function handleStatusCheck(): Promise<Response> {
  try {
    const adminClient = createAdminClient();

    const { data: configs } = await adminClient
      .from('bendy_sync_config')
      .select('id, tenant, enabled, sync_status, sync_interval_minutes, last_full_sync_at, last_incremental_sync_at, error_message, error_count, updated_at');

    const { data: recentLogs } = await adminClient
      .from('bendy_sync_log')
      .select('id, tenant, sync_type, entity_type, started_at, completed_at, records_fetched, records_created, records_updated, records_skipped, records_failed, status, duration_ms, metadata, errors')
      .order('started_at', { ascending: false })
      .limit(20);

    // Auto-cleanup: markeer vastgelopen syncs als failed (running > 30 min)
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const stuckLogs = (recentLogs || []).filter((log: any) =>
      log.status === 'running' &&
      log.started_at &&
      (Date.now() - new Date(log.started_at).getTime()) > THIRTY_MINUTES_MS
    );
    if (stuckLogs.length > 0) {
      for (const stuck of stuckLogs) {
        await adminClient
          .from('bendy_sync_log')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            errors: ['Auto-cleanup: sync langer dan 30 minuten zonder resultaat'],
          })
          .eq('id', stuck.id);
      }
    }

    const { count: pendingCount } = await adminClient
      .from('bendy_id_mapping')
      .select('id', { count: 'exact', head: true })
      .eq('sync_status', 'pending');

    const { count: syncedCount } = await adminClient
      .from('bendy_id_mapping')
      .select('id', { count: 'exact', head: true })
      .eq('sync_status', 'synced');

    const { count: cacheCount } = await adminClient
      .from('bendy_raw_cache')
      .select('id', { count: 'exact', head: true });

    const configOrgData = configs?.[0]?.id
      ? (await adminClient
          .from('bendy_sync_config')
          .select('org_id, organizations!inner(name)')
          .eq('tenant', 'citozorg')
          .single()
        ).data
      : null;

    const orgId = (configOrgData as any)?.org_id;

    const { count: totalClients } = await adminClient
      .from('client_organizations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId || '');

    const { count: clientsWithKvk } = await adminClient
      .from('client_organizations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId || '')
      .not('kvk_nummer', 'is', null)
      .neq('kvk_nummer', '');

    const { data: pendingMappings } = await adminClient
      .from('bendy_id_mapping')
      .select('id, bendy_id, conflict_data, sync_status, created_at')
      .eq('sync_status', 'pending')
      .eq('entity_type', 'sublocation')
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: rawCacheRecords } = await adminClient
      .from('bendy_raw_cache')
      .select('bendy_id, raw_data')
      .eq('tenant', 'citozorg')
      .eq('entity_type', 'clients');

    const totalBendyRecords = (rawCacheRecords || []).length;
    const bendyWithKvk = (rawCacheRecords || []).filter(
      (r: any) => {
        const kvk = r.raw_data?.attributes?.chamber_of_commerce_number?.trim();
        return kvk && kvk !== '';
      }
    ).length;

    const kvkBreakdown: Array<{
      kvk_nummer: string; org_name: string | null; org_found: boolean;
      bendy_count: number; bendy_examples: string[]; local_sublocations: number;
    }> = [];

    const kvkGroups = new Map<string, { count: number; names: string[] }>();
    for (const record of (rawCacheRecords || [])) {
      const kvk = (record.raw_data as any)?.attributes?.chamber_of_commerce_number?.trim();
      if (!kvk) continue;
      const existing = kvkGroups.get(kvk) || { count: 0, names: [] };
      existing.count++;
      const name = (record.raw_data as any)?.attributes?.company_name;
      if (name && existing.names.length < 3) existing.names.push(name);
      kvkGroups.set(kvk, existing);
    }

    for (const [kvk, group] of kvkGroups) {
      const { data: matchedOrg } = await adminClient
        .from('client_organizations')
        .select('id, name')
        .eq('kvk_nummer', kvk)
        .eq('org_id', orgId || '')
        .maybeSingle();

      let sublocationCount = 0;
      if (matchedOrg) {
        const { data: locations } = await adminClient
          .from('client_locations')
          .select('id')
          .eq('client_org_id', matchedOrg.id);

        if (locations && locations.length > 0) {
          const locationIds = locations.map((l: any) => l.id);
          const { count } = await adminClient
            .from('client_sublocations')
            .select('id', { count: 'exact', head: true })
            .in('location_id', locationIds);
          sublocationCount = count || 0;
        }
      }

      kvkBreakdown.push({
        kvk_nummer: kvk, org_name: matchedOrg?.name || null,
        org_found: !!matchedOrg, bendy_count: group.count,
        bendy_examples: group.names, local_sublocations: sublocationCount,
      });
    }

    kvkBreakdown.sort((a, b) => b.bendy_count - a.bendy_count);

    const fieldFillRates = analyzeFieldFillRates(rawCacheRecords);

    const sampleRecord = (rawCacheRecords && rawCacheRecords.length > 0) ? rawCacheRecords[0].raw_data : null;
    const sampleAttributes = sampleRecord?.attributes ? Object.keys(sampleRecord.attributes) : [];

    const { data: userCacheRecords } = await adminClient
      .from('bendy_raw_cache')
      .select('raw_data')
      .eq('tenant', 'citozorg')
      .eq('entity_type', 'users');

    const userFieldFillRates = analyzeFieldFillRates(userCacheRecords);

    const { count: userSyncedCount } = await adminClient
      .from('bendy_id_mapping')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'professional')
      .eq('sync_status', 'synced');

    const { count: userPendingCount } = await adminClient
      .from('bendy_id_mapping')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'professional')
      .eq('sync_status', 'pending');

    const { count: userCacheCount } = await adminClient
      .from('bendy_raw_cache')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'users');

    const { data: allProsWithBendyId } = await adminClient
      .from('professionals')
      .select('id, bendy_id, full_name, email')
      .eq('org_id', orgId || '')
      .is('deleted_at', null)
      .not('bendy_id', 'is', null)
      .limit(5000);

    const bendyIdCounts = new Map<string, any[]>();
    for (const pro of (allProsWithBendyId || [])) {
      const existing = bendyIdCounts.get(pro.bendy_id) || [];
      existing.push({ id: pro.id, full_name: pro.full_name, email: pro.email });
      bendyIdCounts.set(pro.bendy_id, existing);
    }
    const duplicateBendyIds = Array.from(bendyIdCounts.entries())
      .filter(([_, pros]) => pros.length > 1)
      .map(([bendyId, pros]) => ({ bendy_id: bendyId, count: pros.length, professionals: pros }));

    const { data: allProsWithEmail } = await adminClient
      .from('professionals')
      .select('id, bendy_id, full_name, email')
      .eq('org_id', orgId || '')
      .is('deleted_at', null)
      .not('email', 'is', null)
      .limit(5000);

    const emailCounts = new Map<string, any[]>();
    for (const pro of (allProsWithEmail || [])) {
      const normalizedEmail = (pro.email || '').trim().toLowerCase();
      if (!normalizedEmail) continue;
      const existing = emailCounts.get(normalizedEmail) || [];
      existing.push({ id: pro.id, full_name: pro.full_name, bendy_id: pro.bendy_id });
      emailCounts.set(normalizedEmail, existing);
    }
    const duplicateEmails = Array.from(emailCounts.entries())
      .filter(([_, pros]) => pros.length > 1)
      .map(([email, pros]) => ({ email, count: pros.length, professionals: pros }));

    const { count: totalProfessionals } = await adminClient
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId || '')
      .is('deleted_at', null);

    const { count: prosWithBendyId } = await adminClient
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId || '')
      .is('deleted_at', null)
      .not('bendy_id', 'is', null);

    const { count: prosWithoutBendyId } = await adminClient
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId || '')
      .is('deleted_at', null)
      .is('bendy_id', null);

    return jsonResponse({
      success: true,
      data: {
        configs: configs || [],
        recent_logs: recentLogs || [],
        statistics: {
          total_synced: syncedCount || 0,
          total_pending: pendingCount || 0,
          total_cached: cacheCount || 0,
        },
        diagnostics: {
          config_org_id: orgId || null,
          config_org_name: (configOrgData as any)?.organizations?.name || null,
          local_clients_total: totalClients || 0,
          local_clients_with_kvk: clientsWithKvk || 0,
          bendy_clients_with_kvk: bendyWithKvk,
          bendy_clients_without_kvk: totalBendyRecords - bendyWithKvk,
          kvk_breakdown: kvkBreakdown,
          sample_attributes: sampleAttributes,
          sample_record: sampleRecord,
          field_fill_rates: fieldFillRates,
          user_statistics: {
            total_synced: userSyncedCount || 0,
            total_pending: userPendingCount || 0,
            total_cached: userCacheCount || 0,
          },
          user_field_fill_rates: userFieldFillRates,
          data_quality: {
            total_professionals: totalProfessionals || 0,
            with_bendy_id: prosWithBendyId || 0,
            without_bendy_id: prosWithoutBendyId || 0,
            duplicate_bendy_ids: duplicateBendyIds,
            duplicate_emails: duplicateEmails,
            has_duplicates: duplicateBendyIds.length > 0 || duplicateEmails.length > 0,
          },
        },
        pending_mappings: (pendingMappings || []).map((m: any) => ({
          id: m.id, bendy_id: m.bendy_id,
          company_name: m.conflict_data?.company_name || '—',
          kvk: m.conflict_data?.kvk || null,
          town: m.conflict_data?.town || '—',
          created_at: m.created_at,
        })),
      },
      metadata: { version: FUNCTION_VERSION, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(FUNCTION_NAME, `Status check gefaald: ${msg}`);
    return errorResponse(`Status check mislukt: ${msg}`, 500);
  }
}

// ============================================
// CRON SYNC
// ============================================

async function handleCronSync(syncType: string = 'incremental'): Promise<Response> {
  const startTime = Date.now();
  const isFull = syncType === 'full';
  logInfo(FUNCTION_NAME, `🔄 Cron sync gestart (${syncType})`);

  try {
    const adminClient = createAdminClient();
    const results: Record<string, any> = {};

    const { data: configs } = await adminClient
      .from('bendy_sync_config')
      .select('id, org_id, tenant, enabled, sync_status')
      .eq('enabled', true);

    if (!configs || configs.length === 0) {
      logInfo(FUNCTION_NAME, 'Geen enabled tenants gevonden — cron skip');
      return jsonResponse({
        success: true,
        data: { message: 'Geen enabled tenants', tenants_processed: 0 },
        metadata: { trigger: 'cron', sync_type: syncType, duration_ms: Date.now() - startTime },
      });
    }

    for (const config of configs) {
      const tenant = config.tenant;
      const tenantConfig = TENANT_CONFIG[tenant];

      if (!tenantConfig) {
        results[tenant] = { status: 'skipped', reason: 'tenant_not_configured' };
        continue;
      }

      if (config.sync_status === 'running') {
        results[tenant] = { status: 'skipped', reason: 'already_running' };
        continue;
      }

      const circuitCheck = await canExecute(adminClient, tenantConfig.circuitBreakerName);
      if (!circuitCheck.allowed) {
        results[tenant] = { status: 'skipped', reason: 'circuit_breaker_open' };
        continue;
      }

      const lock = await acquireSyncLock(adminClient, tenant, 'cron');
      if (!lock.locked) {
        results[tenant] = { status: 'skipped', reason: 'lock_failed' };
        continue;
      }

      const tenantResults: Record<string, any> = {};

      // Helper: sync entity met eigen log entry
      const runSync = async (
        entityType: string,
        syncFn: (syncLogId?: string) => Promise<SyncResult>
      ) => {
        const entityStart = Date.now();
        const { data: syncLog } = await adminClient
          .from('bendy_sync_log')
          .insert({
            org_id: lock.orgId,
            tenant,
            sync_type: syncType,
            entity_type: entityType,
            status: 'running',
          })
          .select('id')
          .single();

        try {
          const syncResult = await syncFn(syncLog?.id);
          const duration = Date.now() - entityStart;

          if (syncLog?.id) {
            await adminClient
              .from('bendy_sync_log')
              .update({
                completed_at: new Date().toISOString(),
                records_fetched: syncResult.fetched,
                records_created: syncResult.created,
                records_updated: syncResult.updated,
                records_skipped: syncResult.skipped,
                records_failed: syncResult.failed,
                errors: syncResult.errors,
                status: syncResult.failed > 0 ? 'partial' : 'success',
                duration_ms: duration,
              })
              .eq('id', syncLog.id);
          }

          tenantResults[entityType] = {
            status: 'success',
            fetched: syncResult.fetched,
            updated: syncResult.updated,
            duration_ms: duration,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logError(FUNCTION_NAME, `Cron ${entityType} ${tenant} gefaald: ${msg}`);

          if (syncLog?.id) {
            await adminClient
              .from('bendy_sync_log')
              .update({
                completed_at: new Date().toISOString(),
                status: 'failed',
                errors: [msg],
                duration_ms: Date.now() - entityStart,
              })
              .eq('id', syncLog.id);
          }

          tenantResults[entityType] = { status: 'failed', error: msg };
        }
      };

      try {
        if (isFull) {
          // Nachtelijke full sync: alle 4 entities
          await runSync('clients', () => syncClients(adminClient, tenant, lock.orgId, 'full'));
          await runSync('users', () => syncUsers(adminClient, tenant, lock.orgId, 'full'));
          await runSync('documents', () => syncDocuments(adminClient, tenant, lock.orgId, 'full'));
          await runSync('requisitions_open', () => syncRequisitions(adminClient, tenant, lock.orgId, 'full'));
        } else {
          // Delta sync: alleen requisitions + users (snel)
          await runSync('requisitions_open', () =>
            syncRequisitions(adminClient, tenant, lock.orgId, 'incremental', undefined, lock.lastIncrementalSyncAt)
          );
          await runSync('users', () =>
            syncUsers(adminClient, tenant, lock.orgId, 'incremental', lock.lastIncrementalSyncAt)
          );
        }

        await releaseSyncLock(adminClient, lock.configId, 'idle');
        await recordSuccess(adminClient, tenantConfig.circuitBreakerName);
        results[tenant] = { status: 'success', entities: tenantResults };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await releaseSyncLock(adminClient, lock.configId, 'error', msg);
        await recordFailure(adminClient, tenantConfig.circuitBreakerName, msg);
        results[tenant] = { status: 'failed', error: msg, entities: tenantResults };
      }
    }

    const totalDuration = Date.now() - startTime;
    logSuccess(FUNCTION_NAME, `Cron sync voltooid (${syncType})`, {
      duration_ms: totalDuration,
      tenants: Object.keys(results),
    });

    return jsonResponse({
      success: true,
      data: { tenants: results, tenants_processed: Object.keys(results).length },
      metadata: { trigger: 'cron', sync_type: syncType, duration_ms: totalDuration, version: FUNCTION_VERSION },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(FUNCTION_NAME, `Cron sync gefaald: ${msg}`, error);
    return errorResponse(`Cron sync mislukt: ${msg}`, 500);
  }
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method === 'GET') {
    return handleStatusCheck();
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Ongeldig JSON formaat', 400);
  }

  if (body.trigger === 'scheduler') {
    const cronSyncType = body.sync_type || 'incremental';
    logInfo(FUNCTION_NAME, `Cron trigger ontvangen: ${cronSyncType}`);
    return handleCronSync(cronSyncType);
  }

  const startTime = Date.now();
  let configId = '';
  let syncLogId = '';
  let circuitBreakerName = '';

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return errorResponse('Niet geautoriseerd — login vereist', 401);

    const anonClient = createAnonClient(authHeader);
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return errorResponse('Ongeldige sessie — log opnieuw in', 401);

    const adminClient = createAdminClient();
    const { data: isAdmin } = await adminClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return errorResponse('Admin toegang vereist', 403);

    if (body.action === 'update_config') {
      const toggleTenant = body.tenant || 'citozorg';
      const { data: config, error: configError } = await adminClient
        .from('bendy_sync_config')
        .select('id, enabled, tenant')
        .eq('tenant', toggleTenant)
        .single();
      if (configError || !config) return errorResponse(`Config voor tenant "${toggleTenant}" niet gevonden`, 404);
      const newEnabled = body.enabled !== undefined ? Boolean(body.enabled) : !config.enabled;
      await adminClient.from('bendy_sync_config').update({ enabled: newEnabled }).eq('id', config.id);
      logInfo(FUNCTION_NAME, `Config ${toggleTenant} bijgewerkt: enabled=${newEnabled}`, { userId: user.id });
      return jsonResponse({ success: true, data: { tenant: toggleTenant, enabled: newEnabled }, metadata: { action: 'update_config', version: FUNCTION_VERSION } });
    }

    if (body.action === 'reset_lock') {
      const resetTenant = body.tenant || 'citozorg';
      const { data: config } = await adminClient
        .from('bendy_sync_config')
        .select('id, sync_status')
        .eq('tenant', resetTenant)
        .single();
      if (!config) return errorResponse(`Config voor tenant "${resetTenant}" niet gevonden`, 404);
      const previousStatus = config.sync_status;
      await adminClient.from('bendy_sync_config').update({ sync_status: 'idle', error_message: null, updated_at: new Date().toISOString() }).eq('id', config.id);
      logInfo(FUNCTION_NAME, `Lock gereset voor ${resetTenant}: ${previousStatus} → idle`, { userId: user.id });
      return jsonResponse({ success: true, data: { tenant: resetTenant, previous_status: previousStatus, new_status: 'idle' }, metadata: { action: 'reset_lock', version: FUNCTION_VERSION } });
    }

    if (body.action === 'cleanup_diensten') {
      const rpcStart = Date.now();
      const { data, error } = await adminClient.rpc('cleanup_diensten_duplicates', { batch_size: 200 });
      const rpcDuration = Date.now() - rpcStart;
      logInfo(FUNCTION_NAME, `[cleanup_diensten] RPC duration: ${rpcDuration}ms, result: ${JSON.stringify(data)}, error: ${error?.message || 'none'}`);
      if (error) {
        logError(FUNCTION_NAME, `[cleanup_diensten] RPC failed after ${rpcDuration}ms: ${error.message}`);
        return jsonResponse({ success: false, error: error.message, metadata: { action: 'cleanup_diensten', rpc_duration_ms: rpcDuration } });
      }
      return jsonResponse({ success: true, result: data, metadata: { action: 'cleanup_diensten', version: FUNCTION_VERSION, rpc_duration_ms: rpcDuration } });
    }

    if (body.action !== 'sync_clients' && body.action !== 'sync_users' && body.action !== 'sync_documents' && body.action !== 'sync_requisitions') {
      return errorResponse(`Onbekende actie: ${body.action}. Beschikbaar: sync_clients, sync_users, sync_documents, sync_requisitions, update_config, reset_lock, cleanup_diensten`, 400);
    }

    const tenant = body.tenant || 'citozorg';
    const syncType = body.sync_type || 'incremental';

    if (!TENANT_CONFIG[tenant]) return errorResponse(`Tenant "${tenant}" niet geconfigureerd`, 400);

    circuitBreakerName = TENANT_CONFIG[tenant].circuitBreakerName;
    logInfo(FUNCTION_NAME, `Manuele sync gestart: ${body.action}`, { tenant, syncType, userId: user.id });

    const circuitCheck = await canExecute(adminClient, circuitBreakerName);
    if (!circuitCheck.allowed) {
      logWarning(FUNCTION_NAME, `Circuit breaker OPEN voor ${tenant}`);
      return jsonResponse({ success: false, error: `Bendy API (${tenant}) tijdelijk niet beschikbaar`, metadata: { circuit_breaker: circuitCheck.reason } }, 503);
    }

    const lock = await acquireSyncLock(adminClient, tenant, body.action);
    if (!lock.locked) return errorResponse('Sync niet mogelijk: disabled, al actief, of config ontbreekt', 409);
    configId = lock.configId;
    const orgId = lock.orgId;

    const { data: syncLog } = await adminClient
      .from('bendy_sync_log')
      .insert({
        org_id: orgId, tenant, sync_type: syncType,
        entity_type: body.action === 'sync_users' ? 'users' : body.action === 'sync_documents' ? 'documents' : body.action === 'sync_requisitions' ? 'requisitions_open' : 'clients',
        status: 'running',
      })
      .select('id')
      .single();

    syncLogId = syncLog?.id || '';

    const capturedAction = body.action;
    const capturedConfigId = configId;
    const capturedSyncLogId = syncLogId;
    const capturedCircuitBreakerName = circuitBreakerName;
    const capturedStartTime = startTime;
    const capturedLastSyncAt = lock.lastIncrementalSyncAt;

    // @ts-ignore — EdgeRuntime.waitUntil is Supabase-specifiek
    EdgeRuntime.waitUntil((async () => {
      try {
        const bgAdminClient = createAdminClient();
        let result: SyncResult;
        if (capturedAction === 'sync_users') {
          result = await syncUsers(bgAdminClient, tenant, orgId, syncType, capturedLastSyncAt);
        } else if (capturedAction === 'sync_documents') {
          result = await syncDocuments(bgAdminClient, tenant, orgId, syncType);
        } else if (capturedAction === 'sync_requisitions') {
          result = await syncRequisitions(bgAdminClient, tenant, orgId, syncType, capturedSyncLogId, capturedLastSyncAt);
        } else {
          result = await syncClients(bgAdminClient, tenant, orgId, syncType);
        }

        const duration = Date.now() - capturedStartTime;
        if (capturedSyncLogId) {
          await bgAdminClient.from('bendy_sync_log').update({
            completed_at: new Date().toISOString(),
            records_fetched: result.fetched, records_created: result.created,
            records_updated: result.updated, records_skipped: result.skipped,
            records_failed: result.failed, errors: result.errors,
            status: result.failed > 0 ? 'partial' : 'success', duration_ms: duration,
          }).eq('id', capturedSyncLogId);
        }

        await releaseSyncLock(bgAdminClient, capturedConfigId, 'idle');
        await recordSuccess(bgAdminClient, capturedCircuitBreakerName);
        logSuccess(FUNCTION_NAME, `Background sync voltooid`, {
          tenant, action: capturedAction, fetched: result.fetched,
          created: result.created, updated: result.updated,
          failed: result.failed, duration_ms: duration,
        });
      } catch (bgError) {
        const msg = bgError instanceof Error ? bgError.message : String(bgError);
        logError(FUNCTION_NAME, `Background sync gefaald: ${msg}`, bgError);
        try {
          const cleanupClient = createAdminClient();
          if (capturedConfigId) await releaseSyncLock(cleanupClient, capturedConfigId, 'error', msg);
          if (capturedSyncLogId) {
            await cleanupClient.from('bendy_sync_log').update({
              completed_at: new Date().toISOString(), status: 'failed',
              errors: [msg], duration_ms: Date.now() - capturedStartTime,
            }).eq('id', capturedSyncLogId);
          }
          if (capturedCircuitBreakerName) await recordFailure(cleanupClient, capturedCircuitBreakerName, msg);
        } catch (cleanupError) {
          logError(FUNCTION_NAME, 'Background cleanup ook gefaald', cleanupError);
        }
      }
    })());

    return jsonResponse({
      success: true,
      data: {
        action: body.action, tenant, status: 'accepted',
        message: 'Sync gestart op de achtergrond. Gebruik GET /bendy-sync voor status.',
        sync_log_id: syncLogId,
      },
      metadata: { trigger: 'manual', sync_type: syncType, version: FUNCTION_VERSION },
    }, 202);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(FUNCTION_NAME, `Manuele sync setup gefaald: ${msg}`, error);
    try {
      const adminClient = createAdminClient();
      if (configId) await releaseSyncLock(adminClient, configId, 'error', msg);
      if (syncLogId) {
        await adminClient.from('bendy_sync_log').update({
          completed_at: new Date().toISOString(), status: 'failed',
          errors: [msg], duration_ms: Date.now() - startTime,
        }).eq('id', syncLogId);
      }
      if (circuitBreakerName) await recordFailure(adminClient, circuitBreakerName, msg);
    } catch (cleanupError) {
      logError(FUNCTION_NAME, 'Cleanup na fout ook gefaald', cleanupError);
    }
    return errorResponse(`Sync mislukt: ${msg}`, 500);
  }
});
