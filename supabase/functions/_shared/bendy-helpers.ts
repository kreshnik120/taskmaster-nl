/**
 * BENDY SYNC HELPERS — Shared utilities for Bendy sync functions
 * Config, OAuth2, API helpers, batch operations, sync lock, utility functions
 */

import {
  logInfo,
  logSuccess,
  logWarning,
} from './core.ts';

// ============================================
// CONFIGURATION
// ============================================

export const FUNCTION_NAME = 'bendy-sync';
export const FUNCTION_VERSION = '1.0.0';
export const BENDY_REQUEST_TIMEOUT_MS = 25_000;
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const MAX_PAGES = 50;
const PAGE_SIZE = 100;
const DELTA_PAGE_SIZE = 100;
const DELTA_MAX_PAGES = 200;
// Per-window cap: max records per date-window chunk (veiligheid)
const MAX_RECORDS_PER_WINDOW = 5000;

export interface BendyTenantConfig {
  baseUrl: string;
  tokenUrl: string;
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
  circuitBreakerName: string;
}

export const TENANT_CONFIG: Record<string, BendyTenantConfig> = {
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

export async function getAccessToken(tenant: string): Promise<string> {
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

export async function fetchBendyApi(tenant: string, endpoint: string, params?: Record<string, string>): Promise<any> {
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

export interface FetchResult {
  records: any[];
  included: any[];
  hitCap: boolean;
}

/**
 * Date-windowed fetch: splits het datumvenster in wekelijkse blokken
 * zodat elk blok ruim onder de API-limiet blijft.
 * Retourneert altijd hitCap=false omdat alle data wordt opgehaald.
 */
export async function fetchAllBendyRecords(tenant: string, endpoint: string, extraParams?: Record<string, string>): Promise<FetchResult> {
  const dateFrom = extraParams?.['filter[start_date_from]'];
  const dateTo = extraParams?.['filter[start_date_to]'];

  // Als er geen datumfilter is, gebruik oude single-window methode
  if (!dateFrom || !dateTo) {
    return fetchAllBendyRecordsSingleWindow(tenant, endpoint, extraParams);
  }

  // Splits in wekelijkse blokken
  const allRecords: any[] = [];
  const allIncluded: any[] = [];
  const seenIds = new Set<string>();
  
  const startDate = new Date(dateFrom);
  const endDate = new Date(dateTo);
  let windowStart = new Date(startDate);
  let windowIndex = 0;

  while (windowStart <= endDate) {
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 6); // 7-daags venster
    if (windowEnd > endDate) windowEnd.setTime(endDate.getTime());

    const windowFromStr = windowStart.toISOString().split('T')[0];
    const windowToStr = windowEnd.toISOString().split('T')[0];

    const windowParams = {
      ...(extraParams || {}),
      'filter[start_date_from]': windowFromStr,
      'filter[start_date_to]': windowToStr,
    };

    logInfo(FUNCTION_NAME, `Window ${windowIndex}: ${windowFromStr} → ${windowToStr}`);

    const windowResult = await fetchAllBendyRecordsSingleWindow(tenant, endpoint, windowParams);

    // Dedup op ID (overlap tussen vensters)
    for (const r of windowResult.records) {
      const id = String(r.id);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allRecords.push(r);
      }
    }
    allIncluded.push(...windowResult.included);

    if (windowResult.hitCap) {
      logWarning(FUNCTION_NAME, `Window ${windowIndex} (${windowFromStr}→${windowToStr}) raakte cap van ${MAX_RECORDS_PER_WINDOW} — overweeg kleiner venster`);
    }

    logInfo(FUNCTION_NAME, `Window ${windowIndex}: ${windowResult.records.length} opgehaald, totaal nu: ${allRecords.length}`);

    windowStart.setDate(windowStart.getDate() + 7);
    windowIndex++;
  }

  logInfo(FUNCTION_NAME, `fetchAllBendyRecords ${endpoint}: ${allRecords.length} totaal via ${windowIndex} windows, hitCap=false`);
  return { records: allRecords, included: allIncluded, hitCap: false };
}

async function fetchAllBendyRecordsSingleWindow(tenant: string, endpoint: string, extraParams?: Record<string, string>): Promise<FetchResult> {
  const allRecords: any[] = [];
  const allIncluded: any[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const offset = (page - 1) * PAGE_SIZE;
    const response = await fetchBendyApi(tenant, endpoint, {
      ...(extraParams || {}),
      'limit': String(PAGE_SIZE),
      'offset': String(offset),
    });

    const records = response?.data || [];
    allRecords.push(...records);

    const included = response?.included || [];
    allIncluded.push(...included);

    const totalFromMeta = response?.meta?.record_count || response?.meta?.total || null;
    if (page === 1 && totalFromMeta) {
      logInfo(FUNCTION_NAME, `API meldt ${totalFromMeta} totaal records voor ${endpoint}`);
    }
    logInfo(FUNCTION_NAME, `Pagina ${page} (offset ${offset}): ${records.length} records opgehaald (totaal: ${allRecords.length})${totalFromMeta ? ` van ${totalFromMeta}` : ''}`);

    if (records.length < PAGE_SIZE) break;
    if (allRecords.length >= MAX_RECORDS_PER_WINDOW) {
      logInfo(FUNCTION_NAME, `Window cap bereikt: ${allRecords.length} records >= ${MAX_RECORDS_PER_WINDOW}, stop pagineren voor ${endpoint}`);
      break;
    }
    page++;
  }

  const hitCap = allRecords.length >= MAX_RECORDS_PER_WINDOW;
  logInfo(FUNCTION_NAME, `fetchSingleWindow ${endpoint}: ${allRecords.length} totaal na ${page} pagina('s), hitCap=${hitCap}`);
  return { records: allRecords, included: allIncluded, hitCap };
}

/**
 * Delta fetch met cache-vergelijking: haalt pagina's op en vergelijkt elk record
 * met bendy_raw_cache. Stopt zodra een volledige pagina alleen ongewijzigde records bevat.
 * Werkt onafhankelijk van API-sortering.
 */
export async function fetchDeltaBendyRecords(
  tenant: string,
  endpoint: string,
  cutoffDate: string,
  adminClient: any,
  extraParams?: Record<string, string>,
): Promise<FetchResult & { earlyStop: boolean; pagesScanned: number }> {
  const allRecords: any[] = [];
  const allIncluded: any[] = [];
  let page = 1;
  let earlyStop = false;
  let totalChanged = 0;

  // Determine entity_type for cache lookup based on endpoint
  const entityType = endpoint.includes('/users') ? 'users' : 'requisitions';

  while (page <= DELTA_MAX_PAGES) {
    const offset = (page - 1) * DELTA_PAGE_SIZE;
    const response = await fetchBendyApi(tenant, endpoint, {
      ...(extraParams || {}),
      'limit': String(DELTA_PAGE_SIZE),
      'offset': String(offset),
    });

    const records = response?.data || [];
    const included = response?.included || [];

    if (page === 1) {
      const totalFromMeta = response?.meta?.record_count || response?.meta?.total || null;
      if (totalFromMeta) {
        logInfo(FUNCTION_NAME, `Delta ${endpoint}: ${totalFromMeta} totaal in Bendy, cutoff: ${cutoffDate}`);
      }
    }

    if (records.length === 0) break;

    // Verzamel bendy_id's van deze pagina
    const pageIds = records.map((r: any) => String(r.id));

    // Query cache voor deze id's
    let cacheMap = new Map<string, string | null>();
    try {
      const { data: cacheRows } = await adminClient
        .from('bendy_raw_cache')
        .select('bendy_id, raw_data')
        .eq('entity_type', entityType)
        .eq('tenant', tenant)
        .in('bendy_id', pageIds);

      for (const row of (cacheRows || [])) {
        const cachedUpdatedAt = row.raw_data?.attributes?.updated_at || null;
        cacheMap.set(row.bendy_id, cachedUpdatedAt);
      }
    } catch (err) {
      // Cache query failed — treat all as changed (safe fallback)
      logWarning(FUNCTION_NAME, `Cache query failed pagina ${page}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Vergelijk: tel gewijzigde records
    let changedOnPage = 0;
    const changedRecords: any[] = [];
    for (const record of records) {
      const bendyId = String(record.id);
      const apiUpdatedAt = record.attributes?.updated_at || null;
      const cachedUpdatedAt = cacheMap.get(bendyId);

      // Record is "gewijzigd" als:
      // 1. Niet in cache (nieuw record)
      // 2. Cache heeft andere updated_at
      // 3. Cache query failed (cacheMap leeg → alles is changed)
      const isNew = cachedUpdatedAt === undefined;
      const isChanged = !isNew && apiUpdatedAt !== cachedUpdatedAt;

      if (isNew || isChanged) {
        changedOnPage++;
        changedRecords.push(record);
      }
    }

    // Voeg ALLE records toe (niet alleen gewijzigde) — de callers verwachten volledige data
    // voor matching en status-updates
    allRecords.push(...records);
    allIncluded.push(...included);
    totalChanged += changedOnPage;

    logInfo(FUNCTION_NAME, `Delta pagina ${page}: ${records.length} records, ${changedOnPage} gewijzigd/nieuw`);

    // Stop als GEEN records op deze pagina gewijzigd zijn t.o.v. cache
    if (changedOnPage === 0) {
      earlyStop = true;
      logInfo(FUNCTION_NAME, `Delta early stop na pagina ${page}: 0 gewijzigde records (alle ${records.length} ongewijzigd in cache)`);
      break;
    }

    if (records.length < DELTA_PAGE_SIZE) break;
    // Hard cap: voorkom CPU timeout bij grote datasets
    if (allRecords.length >= MAX_TOTAL_RECORDS) {
      logInfo(FUNCTION_NAME, `Delta hard cap bereikt: ${allRecords.length} records >= ${MAX_TOTAL_RECORDS}, stop pagineren voor ${endpoint}`);
      break;
    }
    page++;
  }

  logInfo(FUNCTION_NAME, `fetchDeltaBendyRecords ${endpoint}: ${allRecords.length} opgehaald in ${page} pagina('s), ${totalChanged} gewijzigd, earlyStop: ${earlyStop}`);
  return { records: allRecords, included: allIncluded, hitCap: false, earlyStop, pagesScanned: page };
}

// ============================================
// BATCH HELPERS
// ============================================

export const BATCH_CHUNK_SIZE = 200;
export const PARALLEL_CHUNK_SIZE = 50;

export async function batchUpsert(
  adminClient: any,
  table: string,
  records: any[],
  onConflict: string,
): Promise<void> {
  if (records.length === 0) return;
  for (let i = 0; i < records.length; i += BATCH_CHUNK_SIZE) {
    const chunk = records.slice(i, i + BATCH_CHUNK_SIZE);
    const { error } = await adminClient
      .from(table)
      .upsert(chunk, { onConflict });
    if (error) {
      logWarning(FUNCTION_NAME, `Batch upsert ${table} chunk ${i}/${records.length} fout: ${error.message}`);
    }
  }
}

export async function batchInsert(
  adminClient: any,
  table: string,
  records: any[],
): Promise<any[]> {
  if (records.length === 0) return [];
  const allInserted: any[] = [];
  for (let i = 0; i < records.length; i += BATCH_CHUNK_SIZE) {
    const chunk = records.slice(i, i + BATCH_CHUNK_SIZE);
    const { data, error } = await adminClient
      .from(table)
      .insert(chunk)
      .select('id');
    if (error) {
      logWarning(FUNCTION_NAME, `Batch insert ${table} chunk ${i}/${records.length} fout: ${error.message}`);
    }
    if (data) allInserted.push(...data);
  }
  return allInserted;
}

export async function parallelUpdates(
  adminClient: any,
  table: string,
  updates: Array<{ id: string; data: Record<string, any> }>,
): Promise<void> {
  if (updates.length === 0) return;
  for (let i = 0; i < updates.length; i += PARALLEL_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + PARALLEL_CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(u =>
        adminClient.from(table).update(u.data).eq('id', u.id)
      )
    );
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[bendy-sync] ${failures.length}/${chunk.length} updates mislukt in ${table}`);
    }
  }
}

// ============================================
// SYNC LOCK MECHANISME
// ============================================

const STALE_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

export async function acquireSyncLock(
  adminClient: any,
  tenant: string,
  _entityType: string
): Promise<{ locked: boolean; configId: string; orgId: string; lastIncrementalSyncAt: string | null }> {
  const { data: config } = await adminClient
    .from('bendy_sync_config')
    .select('id, org_id, sync_status, enabled, updated_at, last_incremental_sync_at')
    .eq('tenant', tenant)
    .single();

  if (!config) return { locked: false, configId: '', orgId: '', lastIncrementalSyncAt: null };
  if (!config.enabled) return { locked: false, configId: '', orgId: '', lastIncrementalSyncAt: null };

  if (config.sync_status === 'running') {
    const updatedAt = new Date(config.updated_at).getTime();
    const staleDuration = Date.now() - updatedAt;
    if (staleDuration < STALE_LOCK_TIMEOUT_MS) {
      return { locked: false, configId: '', orgId: '', lastIncrementalSyncAt: null };
    }
    logWarning(FUNCTION_NAME, `Stale lock gedetecteerd voor ${tenant} (${Math.round(staleDuration / 1000)}s oud) — automatisch gereset`);
  }

  await adminClient
    .from('bendy_sync_config')
    .update({ sync_status: 'running', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', config.id);

  return { locked: true, configId: config.id, orgId: config.org_id, lastIncrementalSyncAt: config.last_incremental_sync_at || null };
}

export async function releaseSyncLock(
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
// SYNC RESULT INTERFACE
// ============================================

export interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ============================================
// UTILITY HELPERS
// ============================================

export function deriveOrgName(clients: any[]): string {
  const names = clients
    .map((c: any) => (c.attributes?.company_name || '').trim())
    .filter(Boolean);
  if (names.length === 0) return 'Onbekend';
  const first = names[0];
  let prefixLen = first.length;
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefixLen && i < name.length && first[i] === name[i]) i++;
    prefixLen = i;
  }
  const prefix = first.substring(0, prefixLen).trim();
  return prefix.length >= 3 ? prefix : names[0];
}

export function normalizeForMatch(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function buildContactName(attrs: any): string | null {
  const parts = [
    (attrs.firstname || '').trim(),
    (attrs.middlename || '').trim(),
    (attrs.surname || '').trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function buildFullName(attrs: any): string {
  const parts = [
    (attrs.firstname || '').trim(),
    (attrs.middlename || '').trim(),
    (attrs.lastname || '').trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Onbekend';
}

export const NIVEAU_RANK: Record<string, number> = {
  'Helpende': 1,
  'Begeleider': 2,
  'VIG': 3,
  'Persoonlijk begeleider': 4,
  'Verpleegkundige (MBO)': 5,
  'GGZ-agoog': 6,
  'HBO-V': 7,
  'HBO': 7,
  'WO': 8,
};

export function matchNiveauFromText(text: string): string | null {
  if (/\bWO\b|Universitair/i.test(text)) return 'WO';
  if (/HBO.?V|hbo\s*verpleeg/i.test(text)) return 'HBO-V';
  if (/\bHBO\b(?!.?V)/i.test(text)) return 'HBO';
  if (/Persoonlijk\s*begeleider|\bPB\b/i.test(text)) return 'Persoonlijk begeleider';
  if (/Verpleegkundige|\bVP\b/i.test(text)) return 'Verpleegkundige (MBO)';
  if (/GGZ/i.test(text)) return 'GGZ-agoog';
  if (/VIG/i.test(text)) return 'VIG';
  if (/Begeleider|BGL/i.test(text)) return 'Begeleider';
  if (/Helpende|ADL/i.test(text)) return 'Helpende';
  return null;
}

export function deriveFunctieNiveau(groupNames: string[], functionType?: string | null, level?: string | null, diplomaNiveau?: string | null): string | null {
  let bestNiveau: string | null = null;
  let bestRank = 0;

  for (const name of groupNames) {
    const niveau = matchNiveauFromText(name);
    if (niveau && (NIVEAU_RANK[niveau] || 0) > bestRank) {
      bestRank = NIVEAU_RANK[niveau] || 0;
      bestNiveau = niveau;
    }
  }

  if (level) {
    const niveau = matchNiveauFromText(level.trim());
    if (niveau && (NIVEAU_RANK[niveau] || 0) > bestRank) {
      bestRank = NIVEAU_RANK[niveau] || 0;
      bestNiveau = niveau;
    }
  }

  if (functionType) {
    const niveau = matchNiveauFromText(functionType.trim());
    if (niveau && (NIVEAU_RANK[niveau] || 0) > bestRank) {
      bestRank = NIVEAU_RANK[niveau] || 0;
      bestNiveau = niveau;
    }
  }

  if (diplomaNiveau && (NIVEAU_RANK[diplomaNiveau] || 0) > bestRank) {
    bestRank = NIVEAU_RANK[diplomaNiveau] || 0;
    bestNiveau = diplomaNiveau;
  }

  return bestNiveau;
}

export function deriveFunctieNiveauFromDiplomas(documents: Array<{ document_name: string; document_type: string | null }>): string | null {
  if (!documents || documents.length === 0) return null;

  const diplomas = documents.filter(d => {
    const name = (d.document_name || '').toLowerCase();
    const type = (d.document_type || '').toLowerCase();
    return type.includes('diploma') || type.includes('certificaat') ||
           name.includes('diploma') || name.includes('certificaat') ||
           name.includes('verpleegkunde') || name.includes('verzorgende') ||
           name.includes('begeleider') || name.includes('helpende') ||
           name.includes('vig') || name.includes('hbo-v') || name.includes('hbo v') ||
           name.includes('ggz') || name.includes('nursing') ||
           name.includes('sociaal werker') || name.includes('social') || name.includes('spw') ||
           name.includes('maatschappelijke zorg') || name.includes('pedagogisch') ||
           name.includes('persoonlijk begeleider') ||
           name.includes('sociaal-maatschappelijk') || name.includes('sociaal-cultureel') ||
           name.includes('bachelor') || name.includes('associate') ||
           name.includes('wo ') || name.includes('propedeuse');
  });

  if (diplomas.length === 0) return null;

  let highest: string | null = null;
  let highestRank = 0;

  for (const d of diplomas) {
    const name = (d.document_name || '').toLowerCase();
    let rank = 0;
    let niveau = '';

    if (/wo\s|^wo$/i.test(name)) { rank = 8; niveau = 'WO'; }
    else if (/hbo.?v|hbo\s*verpleeg|nursing/i.test(name)) { rank = 7; niveau = 'HBO-V'; }
    else if (/hbo|bachelor|associate\s*degree/i.test(name)) { rank = 7; niveau = 'HBO'; }
    else if (/verpleegkunde|verpleegkundige/i.test(name)) { rank = 5; niveau = 'Verpleegkundige (MBO)'; }
    else if (/ggz/i.test(name)) { rank = 6; niveau = 'GGZ-agoog'; }
    else if (/persoonlijk\s*begeleider|evc.*begeleider/i.test(name)) { rank = 4; niveau = 'Persoonlijk begeleider'; }
    else if (/verzorgend.*ig|vig/i.test(name)) { rank = 3; niveau = 'VIG'; }
    else if (/socia(al|l)?.*werker\s*4|spw\s*4|pedagogisch.*4|dienstverlener.*4|scw\)?\s*4|mbo\s*4\s|niveau\s*4/i.test(name)) { rank = 4; niveau = 'Persoonlijk begeleider'; }
    else if (/begeleider|socia(al|l)?.*werker|spw|maatschappelijke.*zorg|pedagogisch|socia(al|l)?.maatschappelijk|socia(al|l)?.cultureel/i.test(name)) { rank = 2; niveau = 'Begeleider'; }
    else if (/helpende/i.test(name)) { rank = 1; niveau = 'Helpende'; }

    if (rank > highestRank) {
      highestRank = rank;
      highest = niveau;
    }
  }

  return highest;
}

export function extractDiplomaNiveau(documentName: string): number | null {
  if (!documentName) return null;
  const name = documentName.toLowerCase();
  if (/hbo|bachelor|nursing/i.test(name)) return 6;
  const mboMatch = name.match(/\b([2-4])\s*$/);
  if (mboMatch) return parseInt(mboMatch[1], 10);
  if (/verpleegkundige|persoonlijk\s*begeleider|sociaal\s*werker/i.test(name)) return 4;
  if (/vig|verzorgend.*ig|begeleider/i.test(name)) return 3;
  if (/helpende/i.test(name)) return 2;
  return null;
}

export function parseCertificates(certs: any): string[] | null {
  if (!certs || !Array.isArray(certs)) return null;
  const parsed = certs
    .map((c: any) => (typeof c === 'string' ? c : c?.value || c?.name || ''))
    .filter((v: string) => v.length > 0);
  return parsed.length > 0 ? parsed : null;
}

export function mapWerkvorm(professionalType: string | null): string | null {
  if (!professionalType) return null;
  const lower = professionalType.toLowerCase();
  if (lower === 'zzp') return 'ZZP';
  if (lower === 'loondienst') return 'Uitzendkracht';
  return null;
}

// ============================================
// FIELD FILL RATE ANALYSIS
// ============================================

export interface FieldFillRate {
  field: string;
  filled: number;
  total: number;
  percentage: number;
  examples: string[];
}

export function analyzeFieldFillRates(rawCacheRecords: any[] | null): FieldFillRate[] {
  if (!rawCacheRecords || rawCacheRecords.length === 0) return [];

  const allKeys = new Set<string>();
  for (const record of rawCacheRecords) {
    const attrs = record.raw_data?.attributes;
    if (attrs && typeof attrs === 'object') {
      Object.keys(attrs).forEach(key => allKeys.add(key));
    }
  }

  const results: FieldFillRate[] = [];
  for (const key of allKeys) {
    let filled = 0;
    const examples: string[] = [];

    for (const record of rawCacheRecords) {
      const value = record.raw_data?.attributes?.[key];
      let isEmpty = value === null || value === undefined || value === '';
      if (!isEmpty && typeof value === 'object') {
        isEmpty = Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
      }
      if (!isEmpty) {
        filled++;
        if (examples.length < 3) {
          const str = typeof value === 'string' ? value : JSON.stringify(value);
          examples.push(str.substring(0, 80));
        }
      }
    }

    results.push({
      field: key,
      filled,
      total: rawCacheRecords.length,
      percentage: Math.round((filled / rawCacheRecords.length) * 100),
      examples,
    });
  }

  return results.sort((a, b) => b.percentage - a.percentage);
}
