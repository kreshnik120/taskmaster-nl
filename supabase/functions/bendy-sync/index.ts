/**
 * BENDY SYNC ENGINE — Enterprise Edge Function
 * Synchroniseert Bendy API clients naar de abcito.io database.
 *
 * Auth: JWT + admin/eigenaar role in-code gevalideerd
 * External: OAuth2 client_credentials naar Bendy (direct, niet via proxy)
 * Protection: Sync lock, circuit breaker, max errors
 * Fase 1: Alleen clients
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

// ============================================
// CONFIGURATION
// ============================================

const FUNCTION_NAME = 'bendy-sync';
const FUNCTION_VERSION = '1.0.0';
const BENDY_REQUEST_TIMEOUT_MS = 60_000;
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const MAX_PAGES = 50;
const PAGE_SIZE = 100;

interface BendyTenantConfig {
  baseUrl: string;
  tokenUrl: string;
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
  circuitBreakerName: string;
}

const TENANT_CONFIG: Record<string, BendyTenantConfig> = {
  citozorg: {
    baseUrl: 'https://citozorg.bendy.nl',
    tokenUrl: 'https://citozorg.bendy.nl/oauth/token',
    clientIdEnvKey: 'BENDY_CLIENT_ID',
    clientSecretEnvKey: 'BENDY_CLIENT_SECRET',
    circuitBreakerName: 'bendy-citozorg',
  },
};

// ============================================
// OAUTH2 TOKEN CACHE
// ============================================

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  obtainedAt: number;
}

const tokenCache = new Map<string, CachedToken>();

async function getAccessToken(tenant: string): Promise<string> {
  const config = TENANT_CONFIG[tenant];
  if (!config) throw new Error(`Onbekende tenant: ${tenant}`);

  const cached = tokenCache.get(tenant);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  const clientId = Deno.env.get(config.clientIdEnvKey);
  const clientSecret = Deno.env.get(config.clientSecretEnvKey);

  if (!clientId || !clientSecret) {
    throw new Error(
      `Bendy credentials ontbreken voor ${tenant}. Stel ${config.clientIdEnvKey} en ${config.clientSecretEnvKey} in als Supabase Secrets.`
    );
  }

  logInfo(FUNCTION_NAME, `OAuth2 token aanvragen voor ${tenant}...`);

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'read write',
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`OAuth2 token mislukt (${tokenResponse.status}): ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('OAuth2 response bevat geen access_token');
  }

  const expiresInMs = (tokenData.expires_in || 3600) * 1000;
  const newToken: CachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + expiresInMs - TOKEN_EXPIRY_MARGIN_MS,
    obtainedAt: Date.now(),
  };

  tokenCache.set(tenant, newToken);

  logSuccess(FUNCTION_NAME, `OAuth2 token verkregen voor ${tenant}`, {
    expiresIn: tokenData.expires_in,
    tokenType: tokenData.token_type,
  });

  return newToken.accessToken;
}

// ============================================
// BENDY API HELPERS
// ============================================

async function fetchBendyApi(tenant: string, endpoint: string, params?: Record<string, string>): Promise<any> {
  const config = TENANT_CONFIG[tenant];
  const accessToken = await getAccessToken(tenant);

  let url = `${config.baseUrl}${endpoint}`;
  if (params && Object.keys(params).length > 0) {
    const qp = new URLSearchParams(params);
    url += `?${qp.toString()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BENDY_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Bendy API ${response.status}: ${errorText.substring(0, 200)}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchAllBendyRecords(tenant: string, endpoint: string): Promise<any[]> {
  const allRecords: any[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const response = await fetchBendyApi(tenant, endpoint, {
      'page[number]': String(page),
      'page[size]': String(PAGE_SIZE),
    });

    const records = response?.data || [];
    allRecords.push(...records);

    if (records.length < PAGE_SIZE) break;
    if (!response?.links?.next) break;

    page++;
  }

  return allRecords;
}

// ============================================
// SYNC LOCK MECHANISME
// ============================================

async function acquireSyncLock(
  adminClient: any,
  tenant: string,
  _entityType: string
): Promise<{ locked: boolean; configId: string; orgId: string }> {
  const { data: config } = await adminClient
    .from('bendy_sync_config')
    .select('id, org_id, sync_status, enabled')
    .eq('tenant', tenant)
    .single();

  if (!config) return { locked: false, configId: '', orgId: '' };
  if (!config.enabled) return { locked: false, configId: '', orgId: '' };
  if (config.sync_status === 'running') return { locked: false, configId: '', orgId: '' };

  await adminClient
    .from('bendy_sync_config')
    .update({ sync_status: 'running', error_message: null })
    .eq('id', config.id);

  return { locked: true, configId: config.id, orgId: config.org_id };
}

async function releaseSyncLock(
  adminClient: any,
  configId: string,
  status: 'idle' | 'error',
  errorMessage?: string
) {
  const update: Record<string, any> = { sync_status: status };

  if (status === 'idle') {
    update.last_incremental_sync_at = new Date().toISOString();
    update.error_count = 0;
    update.error_message = null;
  } else {
    update.error_message = errorMessage?.substring(0, 500) || null;
  }

  await adminClient
    .from('bendy_sync_config')
    .update(update)
    .eq('id', configId);
}

// ============================================
// CLIENT SYNC LOGICA
// ============================================

interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

async function syncClients(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: 'full' | 'incremental'
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  // 1. Alle Bendy clients ophalen
  logInfo(FUNCTION_NAME, `Ophalen Bendy clients voor ${tenant}...`);
  const bendyClients = await fetchAllBendyRecords(tenant, '/api/v2/clients');
  result.fetched = bendyClients.length;
  logInfo(FUNCTION_NAME, `${bendyClients.length} Bendy clients opgehaald`);

  // 2. Bestaande client_organizations ophalen
  const { data: existingClients } = await adminClient
    .from('client_organizations')
    .select('id, name, kvk_nummer, bendy_id, org_id')
    .eq('org_id', orgId);

  // 3. Bestaande bendy_id_mappings ophalen
  const { data: existingMappings } = await adminClient
    .from('bendy_id_mapping')
    .select('id, bendy_id, local_id')
    .eq('tenant', tenant)
    .eq('entity_type', 'client');

  // Lookup maps bouwen
  const kvkMap = new Map<string, any>();
  const bendyIdMap = new Map<string, any>();
  const mappingMap = new Map<string, any>();

  for (const client of (existingClients || [])) {
    if (client.kvk_nummer) kvkMap.set(client.kvk_nummer, client);
    if (client.bendy_id) bendyIdMap.set(client.bendy_id, client);
  }

  for (const mapping of (existingMappings || [])) {
    mappingMap.set(mapping.bendy_id, mapping);
  }

  // 4. Per Bendy client verwerken
  for (const bendyClient of bendyClients) {
    try {
      const bendyId = String(bendyClient.id);
      const attrs = bendyClient.attributes || {};
      const kvkNummer = attrs.chamber_of_commerce_number?.trim() || null;

      // 4a. Opslaan in bendy_raw_cache (altijd)
      await adminClient
        .from('bendy_raw_cache')
        .upsert({
          org_id: orgId,
          tenant,
          entity_type: 'clients',
          bendy_id: bendyId,
          raw_data: bendyClient,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'tenant,entity_type,bendy_id' });

      // 4b. Matching: eerst op bendy_id, dan op KvK-nummer
      let matchedClient = bendyIdMap.get(bendyId) || null;
      if (!matchedClient && kvkNummer) {
        matchedClient = kvkMap.get(kvkNummer) || null;
      }

      if (matchedClient) {
        // MATCH — update bendy_id als die nog niet gezet is
        if (!matchedClient.bendy_id) {
          await adminClient
            .from('client_organizations')
            .update({ bendy_id: bendyId })
            .eq('id', matchedClient.id);
        }

        // Upsert bendy_id_mapping
        await adminClient
          .from('bendy_id_mapping')
          .upsert({
            org_id: orgId,
            tenant,
            entity_type: 'client',
            bendy_id: bendyId,
            local_id: matchedClient.id,
            bendy_updated_at: attrs.updated_at || null,
            last_synced_at: new Date().toISOString(),
            sync_status: 'synced',
          }, { onConflict: 'tenant,entity_type,bendy_id' });

        result.updated++;
      } else {
        // GEEN MATCH — pending mapping (handmatige review)
        if (!mappingMap.has(bendyId)) {
          await adminClient
            .from('bendy_id_mapping')
            .upsert({
              org_id: orgId,
              tenant,
              entity_type: 'client',
              bendy_id: bendyId,
              local_id: '00000000-0000-0000-0000-000000000000',
              bendy_updated_at: attrs.updated_at || null,
              last_synced_at: new Date().toISOString(),
              sync_status: 'pending',
              conflict_data: { company_name: attrs.company_name, kvk: kvkNummer, town: attrs.town },
            }, { onConflict: 'tenant,entity_type,bendy_id' });
        }

        result.skipped++;
      }
    } catch (error) {
      result.failed++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Client ${bendyClient.id}: ${msg.substring(0, 200)}`);
      if (result.errors.length > 20) break;
    }
  }

  return result;
}

// ============================================
// REQUEST TYPES
// ============================================

interface BendySyncRequest {
  action: 'sync_clients';
  tenant?: string;
  sync_type?: 'full' | 'incremental';
}

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
      .select('id, tenant, sync_type, entity_type, started_at, completed_at, records_fetched, records_created, records_updated, records_skipped, records_failed, status, duration_ms')
      .order('started_at', { ascending: false })
      .limit(20);

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
      },
      metadata: {
        version: FUNCTION_VERSION,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(FUNCTION_NAME, `Status check gefaald: ${msg}`);
    return errorResponse(`Status check mislukt: ${msg}`, 500);
  }
}

// ============================================
// CRON SYNC (automatisch alle enabled tenants)
// ============================================

async function handleCronSync(): Promise<Response> {
  const startTime = Date.now();
  logInfo(FUNCTION_NAME, '🔄 Cron sync gestart');

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
        metadata: { trigger: 'cron', duration_ms: Date.now() - startTime },
      });
    }

    for (const config of configs) {
      const tenant = config.tenant;
      const tenantConfig = TENANT_CONFIG[tenant];

      if (!tenantConfig) {
        logWarning(FUNCTION_NAME, `Tenant ${tenant} niet in TENANT_CONFIG — skip`);
        results[tenant] = { status: 'skipped', reason: 'tenant_not_configured' };
        continue;
      }

      if (config.sync_status === 'running') {
        logWarning(FUNCTION_NAME, `Tenant ${tenant} al bezig — skip`);
        results[tenant] = { status: 'skipped', reason: 'already_running' };
        continue;
      }

      const circuitCheck = await canExecute(adminClient, tenantConfig.circuitBreakerName);
      if (!circuitCheck.allowed) {
        logWarning(FUNCTION_NAME, `Circuit breaker OPEN voor ${tenant} — skip`);
        results[tenant] = { status: 'skipped', reason: 'circuit_breaker_open' };
        continue;
      }

      const lock = await acquireSyncLock(adminClient, tenant, 'sync_clients');
      if (!lock.locked) {
        results[tenant] = { status: 'skipped', reason: 'lock_failed' };
        continue;
      }

      const { data: syncLog } = await adminClient
        .from('bendy_sync_log')
        .insert({
          org_id: lock.orgId,
          tenant,
          sync_type: 'incremental',
          entity_type: 'clients',
          status: 'running',
        })
        .select('id')
        .single();

      const logId = syncLog?.id || '';

      try {
        const syncResult = await syncClients(adminClient, tenant, lock.orgId, 'incremental');

        const duration = Date.now() - startTime;
        if (logId) {
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
            .eq('id', logId);
        }

        await releaseSyncLock(adminClient, lock.configId, 'idle');
        await recordSuccess(adminClient, tenantConfig.circuitBreakerName);

        results[tenant] = {
          status: 'success',
          fetched: syncResult.fetched,
          updated: syncResult.updated,
          skipped: syncResult.skipped,
          failed: syncResult.failed,
        };

        logSuccess(FUNCTION_NAME, `Cron sync ${tenant} voltooid`, results[tenant]);
      } catch (syncError) {
        const msg = syncError instanceof Error ? syncError.message : String(syncError);
        logError(FUNCTION_NAME, `Cron sync ${tenant} gefaald: ${msg}`);

        await releaseSyncLock(adminClient, lock.configId, 'error', msg);

        if (logId) {
          await adminClient
            .from('bendy_sync_log')
            .update({
              completed_at: new Date().toISOString(),
              status: 'failed',
              errors: [msg],
              duration_ms: Date.now() - startTime,
            })
            .eq('id', logId);
        }

        await recordFailure(adminClient, tenantConfig.circuitBreakerName, msg);
        results[tenant] = { status: 'failed', error: msg };
      }
    }

    const totalDuration = Date.now() - startTime;
    logSuccess(FUNCTION_NAME, `Cron sync voltooid`, { duration_ms: totalDuration, tenants: Object.keys(results) });

    return jsonResponse({
      success: true,
      data: { tenants: results, tenants_processed: Object.keys(results).length },
      metadata: { trigger: 'cron', duration_ms: totalDuration, version: FUNCTION_VERSION },
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

  // MODE 1: GET = Status check (geen auth nodig)
  if (req.method === 'GET') {
    return handleStatusCheck();
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Ongeldig JSON formaat', 400);
  }

  // MODE 2: Cron trigger (geen auth header, trigger === 'scheduler')
  if (body.trigger === 'scheduler') {
    logInfo(FUNCTION_NAME, 'Cron trigger ontvangen');
    return handleCronSync();
  }

  // MODE 3: Manuele trigger (admin auth vereist)
  const startTime = Date.now();
  let configId = '';
  let syncLogId = '';
  let circuitBreakerName = '';

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('Niet geautoriseerd — login vereist', 401);
    }

    const anonClient = createAnonClient(authHeader);
    const { data: { user }, error: authError } = await anonClient.auth.getUser();

    if (authError || !user) {
      return errorResponse('Ongeldige sessie — log opnieuw in', 401);
    }

    const adminClient = createAdminClient();

    const { data: userOrg } = await adminClient
      .from('user_organizations')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'eigenaar'])
      .limit(1)
      .single();

    if (!userOrg) {
      return errorResponse('Admin toegang vereist', 403);
    }

    if (body.action !== 'sync_clients') {
      return errorResponse(`Onbekende actie: ${body.action}. Beschikbaar: sync_clients`, 400);
    }

    const tenant = body.tenant || 'citozorg';
    const syncType = body.sync_type || 'incremental';

    if (!TENANT_CONFIG[tenant]) {
      return errorResponse(`Tenant "${tenant}" niet geconfigureerd`, 400);
    }

    circuitBreakerName = TENANT_CONFIG[tenant].circuitBreakerName;

    logInfo(FUNCTION_NAME, `Manuele sync gestart: ${body.action}`, { tenant, syncType, userId: user.id });

    const circuitCheck = await canExecute(adminClient, circuitBreakerName);
    if (!circuitCheck.allowed) {
      logWarning(FUNCTION_NAME, `Circuit breaker OPEN voor ${tenant}`);
      return jsonResponse({
        success: false,
        error: `Bendy API (${tenant}) tijdelijk niet beschikbaar`,
        metadata: { circuit_breaker: circuitCheck.reason },
      }, 503);
    }

    const lock = await acquireSyncLock(adminClient, tenant, body.action);
    if (!lock.locked) {
      return errorResponse('Sync niet mogelijk: disabled, al actief, of config ontbreekt', 409);
    }
    configId = lock.configId;
    const orgId = lock.orgId;

    const { data: syncLog } = await adminClient
      .from('bendy_sync_log')
      .insert({
        org_id: orgId,
        tenant,
        sync_type: syncType,
        entity_type: 'clients',
        status: 'running',
      })
      .select('id')
      .single();

    syncLogId = syncLog?.id || '';

    const result = await syncClients(adminClient, tenant, orgId, syncType);

    const duration = Date.now() - startTime;
    if (syncLogId) {
      await adminClient
        .from('bendy_sync_log')
        .update({
          completed_at: new Date().toISOString(),
          records_fetched: result.fetched,
          records_created: result.created,
          records_updated: result.updated,
          records_skipped: result.skipped,
          records_failed: result.failed,
          errors: result.errors,
          status: result.failed > 0 ? 'partial' : 'success',
          duration_ms: duration,
        })
        .eq('id', syncLogId);
    }

    await releaseSyncLock(adminClient, configId, 'idle');
    await recordSuccess(adminClient, circuitBreakerName);

    logSuccess(FUNCTION_NAME, `Manuele sync voltooid`, {
      tenant,
      fetched: result.fetched,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      duration_ms: duration,
    });

    return jsonResponse({
      success: true,
      data: {
        action: body.action,
        tenant,
        records_fetched: result.fetched,
        records_created: result.created,
        records_updated: result.updated,
        records_skipped: result.skipped,
        records_failed: result.failed,
        errors: result.errors,
      },
      metadata: {
        trigger: 'manual',
        duration_ms: duration,
        sync_log_id: syncLogId,
        sync_type: syncType,
        version: FUNCTION_VERSION,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(FUNCTION_NAME, `Manuele sync gefaald: ${msg}`, error);

    try {
      const adminClient = createAdminClient();

      if (configId) {
        await releaseSyncLock(adminClient, configId, 'error', msg);
      }

      if (syncLogId) {
        await adminClient
          .from('bendy_sync_log')
          .update({
            completed_at: new Date().toISOString(),
            status: 'failed',
            errors: [msg],
            duration_ms: Date.now() - startTime,
          })
          .eq('id', syncLogId);
      }

      if (circuitBreakerName) {
        await recordFailure(adminClient, circuitBreakerName, msg);
      }
    } catch (cleanupError) {
      logError(FUNCTION_NAME, 'Cleanup na fout ook gefaald', cleanupError);
    }

    return errorResponse(`Sync mislukt: ${msg}`, 500);
  }
});
