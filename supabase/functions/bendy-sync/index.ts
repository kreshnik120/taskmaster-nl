/**
 * BENDY SYNC ENGINE — Enterprise Edge Function
 * Synchroniseert Bendy API clients naar de abcito.io database.
 *
 * Auth: JWT + admin/eigenaar role in-code gevalideerd
 * External: OAuth2 client_credentials naar Bendy (direct, niet via proxy)
 * Protection: Sync lock, circuit breaker, max errors
 * Fase 1: Clients + Fase 2: Professionals
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

interface FetchResult {
  records: any[];
  included: any[];
}

async function fetchAllBendyRecords(tenant: string, endpoint: string, extraParams?: Record<string, string>): Promise<FetchResult> {
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

    // Log paginatie info voor debugging
    const totalFromMeta = response?.meta?.record_count || response?.meta?.total || null;
    if (page === 1 && totalFromMeta) {
      logInfo(FUNCTION_NAME, `API meldt ${totalFromMeta} totaal records voor ${endpoint}`);
    }
    logInfo(FUNCTION_NAME, `Pagina ${page} (offset ${offset}): ${records.length} records opgehaald (totaal: ${allRecords.length})${totalFromMeta ? ` van ${totalFromMeta}` : ''}`);

    // Stop als deze pagina minder records heeft dan PAGE_SIZE (= laatste pagina)
    if (records.length < PAGE_SIZE) break;

    // MAX_PAGES limiet (50) voorkomt oneindige loops (max 50 × 100 = 5.000 records)
    page++;
  }

  logInfo(FUNCTION_NAME, `fetchAllBendyRecords ${endpoint}: ${allRecords.length} totaal na ${page} pagina('s)`);
  return { records: allRecords, included: allIncluded };
}

// ============================================
// BATCH HELPERS
// ============================================

const BATCH_CHUNK_SIZE = 200;
const PARALLEL_CHUNK_SIZE = 50;

async function batchUpsert(
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

async function batchInsert(
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

async function parallelUpdates(
  adminClient: any,
  table: string,
  updates: Array<{ id: string; data: Record<string, any> }>,
): Promise<void> {
  if (updates.length === 0) return;
  for (let i = 0; i < updates.length; i += PARALLEL_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + PARALLEL_CHUNK_SIZE);
    await Promise.all(
      chunk.map(u =>
        adminClient.from(table).update(u.data).eq('id', u.id)
      )
    );
  }
}

// ============================================
// SYNC LOCK MECHANISME
// ============================================

const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minuten

async function acquireSyncLock(
  adminClient: any,
  tenant: string,
  _entityType: string
): Promise<{ locked: boolean; configId: string; orgId: string }> {
  const { data: config } = await adminClient
    .from('bendy_sync_config')
    .select('id, org_id, sync_status, enabled, updated_at')
    .eq('tenant', tenant)
    .single();

  if (!config) return { locked: false, configId: '', orgId: '' };
  if (!config.enabled) return { locked: false, configId: '', orgId: '' };

  // Stale lock detectie: als sync_status 'running' is maar updated_at > 5 min geleden → auto-reset
  if (config.sync_status === 'running') {
    const updatedAt = new Date(config.updated_at).getTime();
    const staleDuration = Date.now() - updatedAt;
    if (staleDuration < STALE_LOCK_TIMEOUT_MS) {
      // Lock is nog vers → echt actief, weigeren
      return { locked: false, configId: '', orgId: '' };
    }
    // Lock is stale → auto-reset
    logWarning(FUNCTION_NAME, `Stale lock gedetecteerd voor ${tenant} (${Math.round(staleDuration / 1000)}s oud) — automatisch gereset`);
  }

  await adminClient
    .from('bendy_sync_config')
    .update({ sync_status: 'running', error_message: null, updated_at: new Date().toISOString() })
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

// Helper: organisatienaam afleiden uit Bendy records
function deriveOrgName(clients: any[]): string {
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

// Helper: string normaliseren voor matching
function normalizeForMatch(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Helper: contactpersoon naam samenstellen uit Bendy velden
function buildContactName(attrs: any): string | null {
  const parts = [
    (attrs.firstname || '').trim(),
    (attrs.middlename || '').trim(),
    (attrs.surname || '').trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

// Helper: volledige naam samenstellen uit Bendy user velden
function buildFullName(attrs: any): string {
  const parts = [
    (attrs.firstname || '').trim(),
    (attrs.middlename || '').trim(),
    (attrs.lastname || '').trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Onbekend';
}

// Helper: functie_niveau afleiden uit Bendy group namen + function_type/level fallback
function deriveFunctieNiveau(groupNames: string[], functionType?: string | null, level?: string | null, diplomaNiveau?: string | null): string | null {
  // Stap 1: Probeer uit groepnamen (al menselijk leesbaar)
  for (const name of groupNames) {
    if (/Persoonlijk\s*begeleider/i.test(name)) return 'Persoonlijk begeleider';
    if (/Begeleider|BGL|PB/i.test(name)) return 'Begeleider';
    if (/Verpleegkundige|VP|HBO-V/i.test(name)) return 'Verpleegkundige (MBO)';
    if (/VIG/i.test(name)) return 'VIG';
    if (/GGZ/i.test(name)) return 'GGZ-agoog';
    if (/Helpende/i.test(name)) return 'Helpende';
  }
  // Stap 2: Fallback naar level (gedecodeerd via selectionListMap)
  if (level) {
    const lv = level.trim().toLowerCase();
    if (/persoonlijk\s*begeleider/.test(lv)) return 'Persoonlijk begeleider';
    if (/begeleider|bgl/.test(lv)) return 'Begeleider';
    if (/verpleegkundige|vp|hbo.?v/.test(lv)) return 'Verpleegkundige (MBO)';
    if (/vig|verzorgend/.test(lv)) return 'VIG';
    if (/ggz/.test(lv)) return 'GGZ-agoog';
    if (/helpende/.test(lv)) return 'Helpende';
  }
  // Stap 3: Fallback naar function_type (gedecodeerd via selectionListMap)
  if (functionType) {
    const ft = functionType.trim().toLowerCase();
    if (/persoonlijk\s*begeleider/.test(ft)) return 'Persoonlijk begeleider';
    if (/begeleider|bgl/.test(ft)) return 'Begeleider';
    if (/verpleegkundige|vp|hbo.?v/.test(ft)) return 'Verpleegkundige (MBO)';
    if (/vig|verzorgend/.test(ft)) return 'VIG';
    if (/ggz/.test(ft)) return 'GGZ-agoog';
    if (/helpende|adl/.test(ft)) return 'Helpende';
  }
  // Stap 4: Fallback naar diploma-afgeleid niveau
  if (diplomaNiveau) return diplomaNiveau;
  return null;
}

// Helper: functie_niveau afleiden uit diploma documenten (hoogste niveau wint)
function deriveFunctieNiveauFromDiplomas(documents: Array<{ document_name: string; document_type: string | null }>): string | null {
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
    else if (/verpleegkunde|verpleegkundige/i.test(name)) { rank = 6; niveau = 'Verpleegkundige (MBO)'; }
    else if (/ggz/i.test(name)) { rank = 5; niveau = 'GGZ-agoog'; }
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

// Helper: MBO/HBO niveaunummer extraheren uit diploma naam
function extractDiplomaNiveau(documentName: string): number | null {
  if (!documentName) return null;
  const name = documentName.toLowerCase();
  // HBO = niveau 6
  if (/hbo|bachelor|nursing/i.test(name)) return 6;
  // MBO: zoek trailing nummer (bijv. "Mbo Helpende Zorg en Welzijn 2" → 2)
  const mboMatch = name.match(/\b([2-4])\s*$/);
  if (mboMatch) return parseInt(mboMatch[1], 10);
  // Fallback op bekende patronen
  if (/verpleegkundige|persoonlijk\s*begeleider|sociaal\s*werker/i.test(name)) return 4;
  if (/vig|verzorgend.*ig|begeleider/i.test(name)) return 3;
  if (/helpende/i.test(name)) return 2;
  return null;
}

// Helper: certificaten parsen uit Bendy certificates array
function parseCertificates(certs: any): string[] | null {
  if (!certs || !Array.isArray(certs)) return null;
  const parsed = certs
    .map((c: any) => (typeof c === 'string' ? c : c?.value || c?.name || ''))
    .filter((v: string) => v.length > 0);
  return parsed.length > 0 ? parsed : null;
}

// Helper: werkvorm mapping Bendy → lokaal
function mapWerkvorm(professionalType: string | null): string | null {
  if (!professionalType) return null;
  const lower = professionalType.toLowerCase();
  if (lower === 'zzp') return 'ZZP';
  if (lower === 'loondienst') return 'Uitzendkracht';
  return null;
}

async function syncClients(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: 'full' | 'incremental'
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  // ── STAP 1: Alle Bendy clients ophalen ──
  logInfo(FUNCTION_NAME, `Ophalen Bendy clients voor ${tenant}...`);
  const { records: bendyClients } = await fetchAllBendyRecords(tenant, '/api/v2/clients');
  result.fetched = bendyClients.length;
  logInfo(FUNCTION_NAME, `${bendyClients.length} Bendy clients opgehaald`);

  // ── STAP 2: Groeperen per KvK-nummer ──
  const kvkGroups = new Map<string, any[]>();
  const noKvkRecords: any[] = [];

  for (const client of bendyClients) {
    const kvk = (client.attributes?.chamber_of_commerce_number || '').trim();
    if (kvk) {
      if (!kvkGroups.has(kvk)) kvkGroups.set(kvk, []);
      kvkGroups.get(kvk)!.push(client);
    } else {
      noKvkRecords.push(client);
    }
  }

  logInfo(FUNCTION_NAME, `${kvkGroups.size} unieke KvK-nummers, ${noKvkRecords.length} zonder KvK`);

  // ── STAP 3: Per KvK-groep verwerken ──
  for (const [kvk, clients] of kvkGroups) {
    try {
      // 3a. Zoek bestaande organisatie
      let { data: org } = await adminClient
        .from('client_organizations')
        .select('id, name, bendy_id, website, invoice_bedrijfsnaam, invoice_adres, invoice_postcode, invoice_plaats, crm_fase, afkorting')
        .eq('kvk_nummer', kvk)
        .eq('org_id', orgId)
        .maybeSingle();

      let defaultLocationId: string | null = null;

      if (org) {
        // Org gevonden — haal eerste location op
        const { data: locations } = await adminClient
          .from('client_locations')
          .select('id')
          .eq('client_org_id', org.id)
          .limit(1);
        defaultLocationId = locations?.[0]?.id || null;

        // Update organisatie velden vanuit Bendy data
        const firstBendyAttrs = clients[0]?.attributes || {};
        const orgUpdateData: Record<string, any> = {};
        if (firstBendyAttrs.website && !org.website) {
          orgUpdateData.website = firstBendyAttrs.website;
        }
        if (firstBendyAttrs.invoice_company_name && firstBendyAttrs.invoice_company_name !== org.invoice_bedrijfsnaam) {
          orgUpdateData.invoice_bedrijfsnaam = firstBendyAttrs.invoice_company_name;
        }
        if (firstBendyAttrs.invoice_address && firstBendyAttrs.invoice_address !== org.invoice_adres) {
          orgUpdateData.invoice_adres = firstBendyAttrs.invoice_address;
        }
        if (firstBendyAttrs.invoice_zipcode && firstBendyAttrs.invoice_zipcode !== org.invoice_postcode) {
          orgUpdateData.invoice_postcode = firstBendyAttrs.invoice_zipcode;
        }
        if (firstBendyAttrs.invoice_town && firstBendyAttrs.invoice_town !== org.invoice_plaats) {
          orgUpdateData.invoice_plaats = firstBendyAttrs.invoice_town;
        }
        // CRM fase en afkorting — organisatie-niveau velden
        if (firstBendyAttrs.crm_stage && firstBendyAttrs.crm_stage !== org.crm_fase) {
          orgUpdateData.crm_fase = firstBendyAttrs.crm_stage;
        }
        if (firstBendyAttrs.abbreviation && firstBendyAttrs.abbreviation !== org.afkorting) {
          orgUpdateData.afkorting = firstBendyAttrs.abbreviation;
        }
        if (Object.keys(orgUpdateData).length > 0) {
          await adminClient
            .from('client_organizations')
            .update(orgUpdateData)
            .eq('id', org.id);
        }

        // Maak default location als er geen is
        if (!defaultLocationId) {
          const { data: newLoc } = await adminClient
            .from('client_locations')
            .insert({ client_org_id: org.id, naam: 'Hoofdlocatie' })
            .select('id')
            .single();
          defaultLocationId = newLoc?.id || null;
        }
      } else {
        // 3b. Auto-aanmaken organisatie + location
        const orgName = deriveOrgName(clients);
        logInfo(FUNCTION_NAME, `Auto-aanmaken organisatie: "${orgName}" (KvK: ${kvk})`);

        const { data: newOrg, error: orgError } = await adminClient
          .from('client_organizations')
          .insert({ org_id: orgId, name: orgName, kvk_nummer: kvk })
          .select('id, name, bendy_id')
          .single();

        if (orgError || !newOrg) {
          result.failed += clients.length;
          result.errors.push(`KvK ${kvk}: Org aanmaken mislukt: ${orgError?.message}`);
          continue;
        }
        org = newOrg;

        // Default location aanmaken
        const firstAttrs = clients[0]?.attributes || {};
        const { data: newLoc } = await adminClient
          .from('client_locations')
          .insert({
            client_org_id: org.id,
            naam: 'Hoofdlocatie',
            adres: firstAttrs.address || null,
            postcode: firstAttrs.zipcode || null,
            plaats: firstAttrs.town || null,
          })
          .select('id')
          .single();
        defaultLocationId = newLoc?.id || null;
      }

      // 3c. Organisatie-mapping registreren
      await adminClient
        .from('bendy_id_mapping')
        .upsert({
          org_id: orgId,
          tenant,
          entity_type: 'organization',
          bendy_id: `kvk-${kvk}`,
          local_id: org.id,
          last_synced_at: new Date().toISOString(),
          sync_status: 'synced',
        }, { onConflict: 'tenant,entity_type,bendy_id' });

      // 3d. Alle bestaande sublocaties ophalen voor deze org
      const { data: allLocations } = await adminClient
        .from('client_locations')
        .select('id')
        .eq('client_org_id', org.id);

      const locationIds = (allLocations || []).map((l: any) => l.id);
      let existingSubs: any[] = [];
      if (locationIds.length > 0) {
        const { data: subs } = await adminClient
          .from('client_sublocations')
          .select('id, naam, adres, postcode, plaats, kostenplaats, telefoon, email, contactpersoon_naam, is_active, bendy_id, location_id, publieke_opmerking, interne_opmerking, externe_referentie, bendy_parent_id, kleur')
          .in('location_id', locationIds);
        existingSubs = subs || [];
      }

      // 3e. Per Bendy record: match of maak sublocation
      for (const bendyClient of clients) {
        try {
          const bendyId = String(bendyClient.id);
          const attrs = bendyClient.attributes || {};

          // Cache raw data (altijd)
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

          // ── MATCHING: 4 niveaus ──
          let matchedSub: any = null;

          // Match 1: bestaande bendy_id (al eerder gekoppeld)
          matchedSub = existingSubs.find((s: any) => s.bendy_id === bendyId);

          // Match 2: exacte naam (genormaliseerd)
          if (!matchedSub && attrs.company_name) {
            const bendyNorm = normalizeForMatch(attrs.company_name);
            matchedSub = existingSubs.find((s: any) =>
              !s.bendy_id && normalizeForMatch(s.naam || '') === bendyNorm
            );
          }

          // Match 3: postcode + adres (exact)
          if (!matchedSub && attrs.zipcode && attrs.address) {
            const bendyPostcode = attrs.zipcode.replace(/\s/g, '').toUpperCase();
            const bendyAdres = normalizeForMatch(attrs.address);
            matchedSub = existingSubs.find((s: any) =>
              !s.bendy_id
              && s.postcode
              && s.postcode.replace(/\s/g, '').toUpperCase() === bendyPostcode
              && s.adres
              && normalizeForMatch(s.adres) === bendyAdres
            );
          }

          // Match 4: naam bevat (minstens 8 tekens)
          if (!matchedSub && attrs.company_name) {
            const bendyNorm = normalizeForMatch(attrs.company_name);
            matchedSub = existingSubs.find((s: any) => {
              if (s.bendy_id) return false;
              const localNorm = normalizeForMatch(s.naam || '');
              if (localNorm.length < 8 && bendyNorm.length < 8) return false;
              return bendyNorm.includes(localNorm) || localNorm.includes(bendyNorm);
            });
          }

          if (matchedSub) {
            // ── MATCH GEVONDEN — update sublocation ──
            const updateData: Record<string, any> = { bendy_id: bendyId };

            if (attrs.company_name && attrs.company_name !== matchedSub.naam) {
              updateData.naam = attrs.company_name;
            }
            if (attrs.address && attrs.address !== matchedSub.adres) {
              updateData.adres = attrs.address;
            }
            if (attrs.zipcode && attrs.zipcode !== matchedSub.postcode) {
              updateData.postcode = attrs.zipcode;
            }
            if (attrs.town && attrs.town !== matchedSub.plaats) {
              updateData.plaats = attrs.town;
            }
            // Telefoon: mobile als fallback voor leeg telephone
            const effectivePhone = attrs.telephone || attrs.mobile || null;
            if (effectivePhone && effectivePhone !== matchedSub.telefoon) {
              updateData.telefoon = effectivePhone;
            }
            if (attrs.email && attrs.email !== matchedSub.email) {
              updateData.email = attrs.email;
            }
            const contactName = buildContactName(attrs);
            if (contactName && contactName !== matchedSub.contactpersoon_naam) {
              updateData.contactpersoon_naam = contactName;
            }
            if (attrs.status) {
              const bendyActive = attrs.status.toLowerCase() !== 'inactive';
              if (bendyActive !== matchedSub.is_active) {
                updateData.is_active = bendyActive;
              }
            }
            // Opmerkingen
            if (attrs.comment_public && attrs.comment_public !== matchedSub.publieke_opmerking) {
              updateData.publieke_opmerking = attrs.comment_public;
            }
            if (attrs.comment && attrs.comment !== matchedSub.interne_opmerking) {
              updateData.interne_opmerking = attrs.comment;
            }
            // Nieuwe velden uit BENDY-FIX-8
            if (attrs.external_id && attrs.external_id !== matchedSub.externe_referentie) {
              updateData.externe_referentie = String(attrs.external_id);
            }
            if (attrs.parent_id && String(attrs.parent_id) !== matchedSub.bendy_parent_id) {
              updateData.bendy_parent_id = String(attrs.parent_id);
            }
            if (attrs.color && attrs.color !== matchedSub.kleur) {
              updateData.kleur = attrs.color;
            }

            await adminClient
              .from('client_sublocations')
              .update(updateData)
              .eq('id', matchedSub.id);

            // Markeer in-memory als gematcht
            matchedSub.bendy_id = bendyId;

            // Mapping registreren
            await adminClient
              .from('bendy_id_mapping')
              .upsert({
                org_id: orgId,
                tenant,
                entity_type: 'sublocation',
                bendy_id: bendyId,
                local_id: matchedSub.id,
                bendy_updated_at: attrs.updated_at || null,
                last_synced_at: new Date().toISOString(),
                sync_status: 'synced',
                conflict_data: null,
              }, { onConflict: 'tenant,entity_type,bendy_id' });

            result.updated++;
          } else if (defaultLocationId) {
            // ── GEEN MATCH — nieuwe sublocation aanmaken ──
            const newContactName = buildContactName(attrs);
            const { data: newSub, error: subError } = await adminClient
              .from('client_sublocations')
              .insert({
                location_id: defaultLocationId,
                naam: attrs.company_name || `Bendy ${bendyId}`,
                adres: attrs.address || null,
                postcode: attrs.zipcode || null,
                plaats: attrs.town || null,
                telefoon: attrs.telephone || attrs.mobile || null,
                email: attrs.email || null,
                contactpersoon_naam: newContactName,
                publieke_opmerking: attrs.comment_public || null,
                interne_opmerking: attrs.comment || null,
                externe_referentie: attrs.external_id ? String(attrs.external_id) : null,
                bendy_parent_id: attrs.parent_id ? String(attrs.parent_id) : null,
                kleur: attrs.color || null,
                bendy_id: bendyId,
              })
              .select('id, naam, bendy_id')
              .single();

            if (newSub) {
              existingSubs.push(newSub);
              await adminClient
                .from('bendy_id_mapping')
                .upsert({
                  org_id: orgId,
                  tenant,
                  entity_type: 'sublocation',
                  bendy_id: bendyId,
                  local_id: newSub.id,
                  bendy_updated_at: attrs.updated_at || null,
                  last_synced_at: new Date().toISOString(),
                  sync_status: 'synced',
                }, { onConflict: 'tenant,entity_type,bendy_id' });
              result.created++;
            } else {
              result.failed++;
              result.errors.push(`Sublocation ${bendyId}: ${subError?.message || 'Aanmaken mislukt'}`);
            }
          } else {
            // Geen location beschikbaar — pending
            await adminClient
              .from('bendy_id_mapping')
              .upsert({
                org_id: orgId,
                tenant,
                entity_type: 'sublocation',
                bendy_id: bendyId,
                local_id: '00000000-0000-0000-0000-000000000000',
                last_synced_at: new Date().toISOString(),
                sync_status: 'pending',
                conflict_data: { company_name: attrs.company_name, kvk: kvk, town: attrs.town },
              }, { onConflict: 'tenant,entity_type,bendy_id' });
            result.skipped++;
          }
        } catch (error) {
          result.failed++;
          const msg = error instanceof Error ? error.message : String(error);
          result.errors.push(`Client ${bendyClient.id}: ${msg.substring(0, 200)}`);
          if (result.errors.length > 20) break;
        }
      }
    } catch (error) {
      result.failed += clients.length;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`KvK ${kvk}: ${msg.substring(0, 200)}`);
    }
  }

  // ── STAP 4: Records zonder KvK-nummer → pending ──
  for (const bendyClient of noKvkRecords) {
    try {
      const bendyId = String(bendyClient.id);
      const attrs = bendyClient.attributes || {};

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

      await adminClient
        .from('bendy_id_mapping')
        .upsert({
          org_id: orgId,
          tenant,
          entity_type: 'sublocation',
          bendy_id: bendyId,
          local_id: '00000000-0000-0000-0000-000000000000',
          last_synced_at: new Date().toISOString(),
          sync_status: 'pending',
          conflict_data: { company_name: attrs.company_name, kvk: null, town: attrs.town },
        }, { onConflict: 'tenant,entity_type,bendy_id' });

      result.skipped++;
    } catch (error) {
      result.failed++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Client (no KvK) ${bendyClient.id}: ${msg.substring(0, 200)}`);
    }
  }

  return result;
}

// ============================================
// USER/PROFESSIONAL SYNC LOGICA
// ============================================

async function syncUsers(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: string,
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  logInfo(FUNCTION_NAME, `Professional sync gestart voor ${tenant}`);

  // 1. Ophalen alle users uit Bendy API (include=groups,company voor functie_niveau + bedrijfsgegevens)
  const { records: bendyUsers, included: bendyIncluded } = await fetchAllBendyRecords(tenant, '/api/v2/users', { include: 'groups,company' });
  result.fetched = bendyUsers.length;
  logInfo(FUNCTION_NAME, `${bendyUsers.length} Bendy users opgehaald`);
  if (bendyUsers.length === 0) return result;

  // 2. Alle bestaande professionals ophalen (voor matching + conditionele updates)
  const { data: existingProfessionals } = await adminClient
    .from('professionals')
    .select('id, full_name, email, bendy_id, telefoonnummer, status, org_id, voorletters, geboorteplaats, geslacht, bendy_external_id, certificaten, bedrijfsnaam, kvk_nummer, btw_nummer, iban, big_nummer, agb_code, skj_registratie, iban_tenaamstelling, boekhouding_email, bedrijfstelefoon, bendy_username, bendy_mediator_id, bendy_function_type, bendy_created_at, werkvorm, bendy_groepen')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  const professionals = existingProfessionals || [];

  // 2b. Bendy groepen ophalen voor functie_niveau mapping
  const { records: bendyGroups } = await fetchAllBendyRecords(tenant, '/api/v2/groups');
  const groupMap = new Map<string, string>();
  for (const group of bendyGroups) {
    groupMap.set(String(group.id), (group.attributes?.name || '').trim());
  }
  logInfo(FUNCTION_NAME, `${groupMap.size} Bendy groepen opgehaald voor functie mapping`);

  // 2b2. Bendy selection lists ophalen voor function_type/level decodering
  const { records: selectionLists } = await fetchAllBendyRecords(tenant, '/api/v2/selection_lists');
  const selectionListMap = new Map<string, string>();
  for (const item of selectionLists) {
    const code = (item.attributes?.key || '').trim();
    const name = (item.attributes?.name || item.attributes?.value || '').trim();
    if (code && name) selectionListMap.set(code, name);
  }
  logInfo(FUNCTION_NAME, `${selectionListMap.size} selection list items opgehaald voor code-decodering`);

  // 2c. Company map bouwen uit included data
  const companyMap = new Map<string, any>();
  for (const item of bendyIncluded) {
    if (item.type === 'companies') {
      companyMap.set(String(item.id), item.attributes || {});
    }
  }
  logInfo(FUNCTION_NAME, `${companyMap.size} company records uit included data`);

  // ══════════════════════════════════════════════
  // FASE 1: Verzamel alle data in-memory (GEEN DB writes)
  // ══════════════════════════════════════════════

  const cacheWrites: any[] = [];
  const proUpdates: Array<{ id: string; data: Record<string, any> }> = [];
  const proInserts: Array<{ insertData: Record<string, any>; bendyId: string; bsn: string | null }> = [];
  const bsnWrites: any[] = [];
  const mappingWrites: any[] = [];

  for (const bendyUser of bendyUsers) {
    try {
      const bendyId = String(bendyUser.id);
      const attrs = bendyUser.attributes || {};

      // Cache data verzamelen — BSN strippen voor veilige opslag
      const sanitizedUser = JSON.parse(JSON.stringify(bendyUser));
      if (sanitizedUser.attributes?.citizen_service_number) {
        sanitizedUser.attributes.citizen_service_number = '[REDACTED]';
      }
      cacheWrites.push({
        org_id: orgId,
        tenant,
        entity_type: 'users',
        bendy_id: bendyId,
        raw_data: sanitizedUser,
        fetched_at: new Date().toISOString(),
      });

      // ── MATCHING: 2 niveaus ──
      let matchedPro: any = null;

      // Match 1: bestaande bendy_id
      matchedPro = professionals.find((p: any) => p.bendy_id === bendyId);

      // Match 2: email (case-insensitive)
      if (!matchedPro && attrs.email) {
        const bendyEmail = attrs.email.trim().toLowerCase();
        matchedPro = professionals.find((p: any) =>
          !p.bendy_id && p.email && p.email.trim().toLowerCase() === bendyEmail
        );
      }

      if (matchedPro) {
        // ── MATCH GEVONDEN — verzamel update data ──
        const updateData: Record<string, any> = { bendy_id: bendyId };
        const fullName = buildFullName(attrs);
        if (fullName !== 'Onbekend' && fullName !== matchedPro.full_name) {
          updateData.full_name = fullName;
        }
        const effectivePhone = attrs.telephone || null;
        if (effectivePhone && effectivePhone !== matchedPro.telefoonnummer) {
          updateData.telefoonnummer = effectivePhone;
        }
        if (attrs.email && attrs.email !== matchedPro.email) {
          updateData.email = attrs.email;
        }

        // Nieuwe velden conditioneel updaten (alleen als Bendy waarde heeft EN lokaal null)
        if (attrs.initials && !matchedPro.voorletters) updateData.voorletters = attrs.initials;
        if (attrs.birthtown && !matchedPro.geboorteplaats) updateData.geboorteplaats = attrs.birthtown;
        if (attrs.gender && !matchedPro.geslacht) updateData.geslacht = attrs.gender;
        if (attrs.external_id && !matchedPro.bendy_external_id) updateData.bendy_external_id = String(attrs.external_id);
        if (attrs.certificates) {
          const parsed = parseCertificates(attrs.certificates);
          if (parsed && parsed.length > 0) {
            updateData.certificaten = parsed;
          }
        }

        // Werkvorm bijwerken vanuit Bendy professional_type — Bendy is leidend
        const mappedWerkvorm = mapWerkvorm(attrs.professional_type || null);
        if (mappedWerkvorm && mappedWerkvorm !== matchedPro.werkvorm) {
          updateData.werkvorm = mappedWerkvorm;
        }

        // Company data ophalen uit included
        const companyRelation = bendyUser.relationships?.company?.data;
        if (companyRelation) {
          const companyAttrs = companyMap.get(String(companyRelation.id));
          if (companyAttrs) {
            if (companyAttrs.name) updateData.bedrijfsnaam = companyAttrs.name;
            if (companyAttrs.chamber_of_commerce_number) updateData.kvk_nummer = companyAttrs.chamber_of_commerce_number;
            if (companyAttrs.vat_id) updateData.btw_nummer = companyAttrs.vat_id;
            if (companyAttrs.iban) updateData.iban = companyAttrs.iban;
            if (companyAttrs.big_number) updateData.big_nummer = companyAttrs.big_number;
            if (companyAttrs.agb_code) updateData.agb_code = companyAttrs.agb_code;
            if (companyAttrs.skj_registration_number) updateData.skj_registratie = companyAttrs.skj_registration_number;
            if (companyAttrs.iban_name_of) updateData.iban_tenaamstelling = companyAttrs.iban_name_of;
            if (companyAttrs.bookkeeping_email) updateData.boekhouding_email = companyAttrs.bookkeeping_email;
            if (companyAttrs.telephone) updateData.bedrijfstelefoon = companyAttrs.telephone;
          }
        }

        // Extra user attributen
        if (attrs.username && !matchedPro.bendy_username) updateData.bendy_username = attrs.username;
        if (attrs.mediator_id && !matchedPro.bendy_mediator_id) updateData.bendy_mediator_id = String(attrs.mediator_id);
        if (attrs.function_type && !matchedPro.bendy_function_type) updateData.bendy_function_type = attrs.function_type;
        if (attrs.created_at && !matchedPro.bendy_created_at) updateData.bendy_created_at = attrs.created_at;

        // Status updaten op basis van Bendy state — Bendy is leidend
        const bendyState = attrs.state?.toLowerCase();
        if (bendyState && ['inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(bendyState)) {
          updateData.status = 'inactief';
        } else if (bendyState) {
          updateData.status = 'actief';
        }

        // Functie_niveau updaten op basis van groepen + function_type/level fallback
        const userGroupIds = (bendyUser.relationships?.groups?.data || [])
          .map((g: any) => String(g.id));
        const userGroupNames = userGroupIds
          .map((id: string) => groupMap.get(id))
          .filter(Boolean) as string[];

        // Bendy groepen opslaan — altijd bijwerken
        updateData.bendy_groepen = userGroupNames.length > 0 ? userGroupNames : [];

        const rawFunctionType = attrs.function_type || null;
        const rawLevel = attrs.level || null;
        const decodedFunctionType = rawFunctionType
          ? (selectionListMap.get(rawFunctionType.replace(/^,/, '')) || rawFunctionType)
          : null;
        const decodedLevel = rawLevel
          ? (selectionListMap.get(rawLevel.replace(/^,/, '')) || rawLevel)
          : null;
        // Diploma-afgeleid niveau ophalen
        const { data: proDocs } = await adminClient
          .from('professional_documents')
          .select('document_name, document_type')
          .eq('professional_id', matchedPro.id);
        const diplomaNiveau = deriveFunctieNiveauFromDiplomas(proDocs || []);
        const functieNiveau = deriveFunctieNiveau(userGroupNames, decodedFunctionType, decodedLevel, diplomaNiveau);
        // Altijd bijwerken — Bendy + diploma's zijn leidend
        updateData.functie_niveau = functieNiveau;

        // Verzamel voor batch
        proUpdates.push({ id: matchedPro.id, data: updateData });

        // BSN verzamelen (plaintext tijdelijk — wordt versleuteld in fase 2d)
        if (attrs.citizen_service_number) {
          bsnWrites.push({
            professional_id: matchedPro.id,
            bsn_plaintext: attrs.citizen_service_number,
            updated_at: new Date().toISOString(),
          });
        }

        // Markeer in-memory als gematcht
        matchedPro.bendy_id = bendyId;

        // Mapping verzamelen
        mappingWrites.push({
          org_id: orgId,
          tenant,
          entity_type: 'professional',
          bendy_id: bendyId,
          local_id: matchedPro.id,
          bendy_updated_at: attrs.updated_at || null,
          last_synced_at: new Date().toISOString(),
          sync_status: 'synced',
          conflict_data: null,
        });

        result.updated++;
      } else {
        // ── GEEN MATCH — verzamel insert data ──
        const fullName = buildFullName(attrs);

        // Functie_niveau uit groepen + function_type/level fallback
        const userGroupIds = (bendyUser.relationships?.groups?.data || [])
          .map((g: any) => String(g.id));
        const userGroupNames = userGroupIds
          .map((id: string) => groupMap.get(id))
          .filter(Boolean) as string[];
        const rawFunctionType = attrs.function_type || null;
        const rawLevel = attrs.level || null;
        const decodedFunctionType = rawFunctionType
          ? (selectionListMap.get(rawFunctionType.replace(/^,/, '')) || rawFunctionType)
          : null;
        const decodedLevel = rawLevel
          ? (selectionListMap.get(rawLevel.replace(/^,/, '')) || rawLevel)
          : null;
        // Diploma's ophalen van Bendy API voor nieuwe professional
        let diplomaNiveau: string | null = null;
        try {
          const docsEndpoint = `/api/v2/users/${bendyId}/documents`;
          const docsResponse = await fetchBendyApi(tenant, docsEndpoint);
          const bendyDocs = (docsResponse?.data || []).map((d: any) => ({
            document_name: d.attributes?.name || '',
            document_type: d.attributes?.document_type || '',
          }));
          diplomaNiveau = deriveFunctieNiveauFromDiplomas(bendyDocs);
        } catch { /* documents ophalen faalde — ga door zonder */ }
        const functieNiveau = deriveFunctieNiveau(userGroupNames, decodedFunctionType, decodedLevel, diplomaNiveau);

        // Werkvorm uit professional_type
        const werkvorm = mapWerkvorm(attrs.professional_type || null);

        // Status uit Bendy state — Bendy is leidend
        const isActive = attrs.state
          ? !['inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(attrs.state.toLowerCase())
          : true;

        const insertData: Record<string, any> = {
          org_id: orgId,
          full_name: fullName,
          functie_niveau: functieNiveau,
          email: attrs.email || null,
          telefoonnummer: attrs.telephone || null,
          werkvorm: werkvorm,
          status: isActive ? 'actief' : 'inactief',
          geboortedatum: attrs.birthdate || null,
          profile_photo_url: attrs.photo_url || null,
          bendy_id: bendyId,
          voorletters: attrs.initials || null,
          geboorteplaats: attrs.birthtown || null,
          geslacht: attrs.gender || null,
          bendy_external_id: attrs.external_id ? String(attrs.external_id) : null,
          certificaten: parseCertificates(attrs.certificates),
          bendy_username: attrs.username || null,
          bendy_mediator_id: attrs.mediator_id ? String(attrs.mediator_id) : null,
          bendy_function_type: attrs.function_type || null,
          bendy_created_at: attrs.created_at || null,
          bendy_groepen: userGroupNames.length > 0 ? userGroupNames : [],
        };

        // Company data toevoegen via companyMap lookup
        const companyRelation = bendyUser.relationships?.company?.data;
        if (companyRelation) {
          const companyAttrs = companyMap.get(String(companyRelation.id));
          if (companyAttrs) {
            if (companyAttrs.name) insertData.bedrijfsnaam = companyAttrs.name;
            if (companyAttrs.chamber_of_commerce_number) insertData.kvk_nummer = companyAttrs.chamber_of_commerce_number;
            if (companyAttrs.vat_id) insertData.btw_nummer = companyAttrs.vat_id;
            if (companyAttrs.iban) insertData.iban = companyAttrs.iban;
            if (companyAttrs.big_number) insertData.big_nummer = companyAttrs.big_number;
            if (companyAttrs.agb_code) insertData.agb_code = companyAttrs.agb_code;
            if (companyAttrs.skj_registration_number) insertData.skj_registratie = companyAttrs.skj_registration_number;
            if (companyAttrs.iban_name_of) insertData.iban_tenaamstelling = companyAttrs.iban_name_of;
            if (companyAttrs.bookkeeping_email) insertData.boekhouding_email = companyAttrs.bookkeeping_email;
            if (companyAttrs.telephone) insertData.bedrijfstelefoon = companyAttrs.telephone;
          }
        }

        proInserts.push({
          insertData,
          bendyId,
          bsn: attrs.citizen_service_number || null,
        });
      }
    } catch (error) {
      result.failed++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`User ${bendyUser.id}: ${msg.substring(0, 200)}`);
    }
  }

  // ══════════════════════════════════════════════
  // FASE 2: Batch DB writes (DRASTISCH minder queries)
  // ══════════════════════════════════════════════

  logInfo(FUNCTION_NAME, `Batch writes: ${cacheWrites.length} cache, ${proUpdates.length} updates, ${proInserts.length} inserts`);

  // 2a. Batch cache writes
  await batchUpsert(adminClient, 'bendy_raw_cache', cacheWrites, 'tenant,entity_type,bendy_id');

  // 2b. Professional updates parallel in chunks van 50
  await parallelUpdates(adminClient, 'professionals', proUpdates);

  // 2c. Professional inserts in batch + koppel IDs terug voor BSN + mapping
  if (proInserts.length > 0) {
    const insertDataArray = proInserts.map(p => p.insertData);
    const newPros = await batchInsert(adminClient, 'professionals', insertDataArray);

    for (let idx = 0; idx < newPros.length; idx++) {
      const newPro = newPros[idx];
      const original = proInserts[idx];

      if (newPro && newPro.id) {
        if (original.bsn) {
          bsnWrites.push({
            professional_id: newPro.id,
            bsn_plaintext: original.bsn,
            updated_at: new Date().toISOString(),
          });
        }

        mappingWrites.push({
          org_id: orgId,
          tenant,
          entity_type: 'professional',
          bendy_id: original.bendyId,
          local_id: newPro.id,
          last_synced_at: new Date().toISOString(),
          sync_status: 'synced',
          conflict_data: null,
        });

        result.created++;
      } else {
        result.failed++;
        result.errors.push(`User ${original.bendyId}: Aanmaken mislukt (geen ID terug)`);
      }
    }
  }

  // 2d. Batch BSN upserts — versleuteld via pgcrypto
  if (bsnWrites.length > 0) {
    const encryptionKey = Deno.env.get('BSN_ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length < 32) {
      logWarning(FUNCTION_NAME, 'BSN_ENCRYPTION_KEY niet geconfigureerd — BSN opslag overgeslagen');
    } else {
      const encryptedBsnWrites: any[] = [];
      for (const bsnWrite of bsnWrites) {
        try {
          const { data: encrypted, error } = await adminClient.rpc('encrypt_bsn', {
            p_plaintext: bsnWrite.bsn_plaintext,
            p_key: encryptionKey,
          });

          if (error) {
            logWarning(FUNCTION_NAME, `BSN encryptie mislukt voor ${bsnWrite.professional_id}: ${error.message}`);
            continue;
          }

          encryptedBsnWrites.push({
            professional_id: bsnWrite.professional_id,
            bsn_encrypted: encrypted,
            encrypted_bsn: '[ENCRYPTED]',
            is_encrypted: true,
            updated_at: bsnWrite.updated_at,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logWarning(FUNCTION_NAME, `BSN encryptie error: ${msg}`);
        }
      }
      if (encryptedBsnWrites.length > 0) {
        await batchUpsert(adminClient, 'professional_bsn', encryptedBsnWrites, 'professional_id');
        logInfo(FUNCTION_NAME, `${encryptedBsnWrites.length} BSN's versleuteld opgeslagen`);
      }
    }
  }

  // 2e. Batch mapping upserts
  if (mappingWrites.length > 0) {
    await batchUpsert(adminClient, 'bendy_id_mapping', mappingWrites, 'tenant,entity_type,bendy_id');
  }

  logInfo(FUNCTION_NAME, `Professional sync voltooid: ${result.fetched} opgehaald, ${result.created} aangemaakt, ${result.updated} bijgewerkt, ${result.failed} gefaald`);
  return result;
}

// ============================================
// FASE 3: DOCUMENT SYNC
// ============================================

async function syncDocuments(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: string,
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  logInfo(FUNCTION_NAME, `Document sync gestart voor ${tenant}`);

  const { data: professionals } = await adminClient
    .from('professionals')
    .select('id, bendy_id, full_name')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .not('bendy_id', 'is', null);

  if (!professionals || professionals.length === 0) {
    logInfo(FUNCTION_NAME, 'Geen professionals met bendy_id gevonden');
    return result;
  }

  logInfo(FUNCTION_NAME, `${professionals.length} professionals met bendy_id gevonden`);

  // Verwerk professionals in chunks van 10 (parallel API calls)
  const DOC_PARALLEL_SIZE = 10;

  for (let i = 0; i < professionals.length; i += DOC_PARALLEL_SIZE) {
    const chunk = professionals.slice(i, i + DOC_PARALLEL_SIZE);

    // Parallel: haal documenten op voor alle pros in deze chunk
    const fetchResults = await Promise.allSettled(
      chunk.map(async (pro: any) => {
        const endpoint = `/api/v2/users/${pro.bendy_id}/documents`;
        const response = await fetchBendyApi(tenant, endpoint);
        return { pro, documents: response?.data || [] };
      })
    );

    // Parallel: haal bestaande docs op voor alle pros in deze chunk
    const existingDocsResults = await Promise.allSettled(
      chunk.map(async (pro: any) => {
        const { data } = await adminClient
          .from('professional_documents')
          .select('id, bendy_document_id')
          .eq('professional_id', pro.id);
        return { proId: pro.id, docs: data || [] };
      })
    );

    // Bouw lookup map voor bestaande docs
    const existingDocsMap = new Map<string, Map<string, any>>();
    for (const settledResult of existingDocsResults) {
      if (settledResult.status === 'fulfilled') {
        const { proId, docs } = settledResult.value;
        const docMap = new Map<string, any>();
        for (const doc of docs) {
          docMap.set(doc.bendy_document_id, doc);
        }
        existingDocsMap.set(proId, docMap);
      }
    }

    // Verzamel alle writes voor deze chunk
    const cacheWrites: any[] = [];
    const docInserts: any[] = [];
    const docUpdates: Array<{ id: string; data: Record<string, any> }> = [];
    const proMetaUpdates: Array<{ id: string; data: Record<string, any> }> = [];

    for (const settledResult of fetchResults) {
      if (settledResult.status === 'rejected') {
        result.failed++;
        result.errors.push(`Doc fetch gefaald: ${String(settledResult.reason).substring(0, 200)}`);
        continue;
      }

      const { pro, documents } = settledResult.value;
      if (documents.length === 0) continue;

      result.fetched += documents.length;

      const existingMap = existingDocsMap.get(pro.id) || new Map();

      let docCount = 0;
      let expiringCount = 0;

      for (const bendyDoc of documents) {
        try {
          const docId = String(bendyDoc.id);
          const attrs = bendyDoc.attributes || {};

          cacheWrites.push({
            org_id: orgId,
            tenant,
            entity_type: 'documents',
            bendy_id: docId,
            raw_data: bendyDoc,
            fetched_at: new Date().toISOString(),
          });

          const docData = {
            professional_id: pro.id,
            org_id: orgId,
            bendy_document_id: docId,
            document_name: attrs.name || 'Onbekend document',
            document_type: attrs.document_type || null,
            document_number: attrs.document_number || null,
            issuer: attrs.issuer || null,
            source: attrs.source || null,
            start_date: attrs.start_date || null,
            expires_at: attrs.expires_at || null,
            status: attrs.status || 'active',
            published: attrs.published || false,
            bendy_created_at: attrs.created_at || null,
            bendy_updated_at: attrs.updated_at || null,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const existing = existingMap.get(docId);
          if (existing) {
            docUpdates.push({ id: existing.id, data: docData });
            result.updated++;
          } else {
            docInserts.push(docData);
            result.created++;
          }

          docCount++;

          if (attrs.expires_at) {
            const expiryDate = new Date(attrs.expires_at);
            const now = new Date();
            const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            if (expiryDate <= ninetyDaysFromNow) {
              expiringCount++;
            }
          }
        } catch (docError) {
          result.failed++;
          const msg = docError instanceof Error ? docError.message : String(docError);
          result.errors.push(`Doc ${bendyDoc.id} voor ${pro.full_name}: ${msg.substring(0, 200)}`);
        }
      }

      // Herbereken functie_niveau op basis van gesyncte documenten
      const { data: proDocs } = await adminClient
        .from('professional_documents')
        .select('document_name, document_type, expires_at')
        .eq('professional_id', pro.id);
      const diplomaNiveau = deriveFunctieNiveauFromDiplomas(proDocs || []);

      // Tel documenten en verlopen/binnenkort verlopen uit DATABASE (niet alleen Bendy API)
      const now = new Date();
      const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const dbDocCount = proDocs?.length || 0;
      const dbExpiringCount = (proDocs || []).filter(d =>
        d.expires_at && new Date(d.expires_at) <= ninetyDaysFromNow
      ).length;

      const metaData: Record<string, any> = {
        documents_synced_at: new Date().toISOString(),
        documents_count: dbDocCount,
        documents_expiring_count: dbExpiringCount,
      };
      if (diplomaNiveau) {
        metaData.functie_niveau = diplomaNiveau;
      }

      proMetaUpdates.push({
        id: pro.id,
        data: metaData,
      });
    }

    // Batch writes voor deze chunk
    if (cacheWrites.length > 0) {
      await batchUpsert(adminClient, 'bendy_raw_cache', cacheWrites, 'tenant,entity_type,bendy_id');
    }
    if (docInserts.length > 0) {
      await batchInsert(adminClient, 'professional_documents', docInserts);
    }
    if (docUpdates.length > 0) {
      await parallelUpdates(adminClient, 'professional_documents', docUpdates);
    }
    if (proMetaUpdates.length > 0) {
      await parallelUpdates(adminClient, 'professionals', proMetaUpdates);
    }
  }

  logInfo(FUNCTION_NAME, `Document sync voltooid: ${result.fetched} opgehaald, ${result.created} nieuw, ${result.updated} bijgewerkt, ${result.failed} gefaald`);
  return result;
}

// ============================================
// FIELD FILL RATE ANALYSIS
// ============================================

interface FieldFillRate {
  field: string;
  filled: number;
  total: number;
  percentage: number;
  examples: string[];
}

function analyzeFieldFillRates(rawCacheRecords: any[] | null): FieldFillRate[] {
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

// ============================================
// REQUEST TYPES
// ============================================

interface BendySyncRequest {
  action: 'sync_clients' | 'sync_users' | 'update_config';
  tenant?: string;
  sync_type?: 'full' | 'incremental';
  enabled?: boolean;
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

    // Diagnostics: config org_id + organisatienaam
    const configOrgData = configs?.[0]?.id
      ? (await adminClient
          .from('bendy_sync_config')
          .select('org_id, organizations!inner(name)')
          .eq('tenant', 'citozorg')
          .single()
        ).data
      : null;

    const orgId = (configOrgData as any)?.org_id;

    // Diagnostics: lokale client counts
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

    // Diagnostics: pending mappings met conflict_data
    const { data: pendingMappings } = await adminClient
      .from('bendy_id_mapping')
      .select('id, bendy_id, conflict_data, sync_status, created_at')
      .eq('sync_status', 'pending')
      .eq('entity_type', 'sublocation')
      .order('created_at', { ascending: false })
      .limit(100);

    // Diagnostics: Bendy clients uit raw_cache (niet pendingMappings)
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

    // Diagnostics: Per-KvK breakdown
    const kvkBreakdown: Array<{
      kvk_nummer: string;
      org_name: string | null;
      org_found: boolean;
      bendy_count: number;
      bendy_examples: string[];
      local_sublocations: number;
    }> = [];

    // Groepeer Bendy records per KvK-nummer
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

    // Per KvK: zoek lokale org + tel sublocaties
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
        kvk_nummer: kvk,
        org_name: matchedOrg?.name || null,
        org_found: !!matchedOrg,
        bendy_count: group.count,
        bendy_examples: group.names,
        local_sublocations: sublocationCount,
      });
    }

    kvkBreakdown.sort((a, b) => b.bendy_count - a.bendy_count);

    // Diagnostics: field fill rates analyse over alle records
    const fieldFillRates = analyzeFieldFillRates(rawCacheRecords);

    // Sample: pak 1 voorbeeld record uit raw_cache om alle beschikbare velden te tonen
    const sampleRecord = (rawCacheRecords && rawCacheRecords.length > 0)
      ? rawCacheRecords[0].raw_data
      : null;
    const sampleAttributes = sampleRecord?.attributes
      ? Object.keys(sampleRecord.attributes)
      : [];

    // Users raw cache ophalen voor fill rate analyse
    const { data: userCacheRecords } = await adminClient
      .from('bendy_raw_cache')
      .select('raw_data')
      .eq('tenant', 'citozorg')
      .eq('entity_type', 'users');

    const userFieldFillRates = analyzeFieldFillRates(userCacheRecords);

    // Users statistieken
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

    // ── DUPLICAAT CHECKS ──
    // Check 1: Professionals met duplicate bendy_id
    const { data: allProsWithBendyId } = await adminClient
      .from('professionals')
      .select('id, bendy_id, full_name, email')
      .eq('org_id', orgId || '')
      .is('deleted_at', null)
      .not('bendy_id', 'is', null);

    const bendyIdCounts = new Map<string, any[]>();
    for (const pro of (allProsWithBendyId || [])) {
      const existing = bendyIdCounts.get(pro.bendy_id) || [];
      existing.push({ id: pro.id, full_name: pro.full_name, email: pro.email });
      bendyIdCounts.set(pro.bendy_id, existing);
    }
    const duplicateBendyIds = Array.from(bendyIdCounts.entries())
      .filter(([_, pros]) => pros.length > 1)
      .map(([bendyId, pros]) => ({ bendy_id: bendyId, count: pros.length, professionals: pros }));

    // Check 2: Professionals met duplicate email
    const { data: allProsWithEmail } = await adminClient
      .from('professionals')
      .select('id, bendy_id, full_name, email')
      .eq('org_id', orgId || '')
      .is('deleted_at', null)
      .not('email', 'is', null);

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

    // Check 3: Totaal professionals tellen
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
          id: m.id,
          bendy_id: m.bendy_id,
          company_name: m.conflict_data?.company_name || '—',
          kvk: m.conflict_data?.kvk || null,
          town: m.conflict_data?.town || '—',
          created_at: m.created_at,
        })),
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

    const { data: isAdmin } = await adminClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return errorResponse('Admin toegang vereist', 403);
    }

    // ACTIE: update_config — toggle enabled/disabled
    if (body.action === 'update_config') {
      const toggleTenant = body.tenant || 'citozorg';
      const { data: config, error: configError } = await adminClient
        .from('bendy_sync_config')
        .select('id, enabled, tenant')
        .eq('tenant', toggleTenant)
        .single();

      if (configError || !config) {
        return errorResponse(`Config voor tenant "${toggleTenant}" niet gevonden`, 404);
      }

      const newEnabled = body.enabled !== undefined ? Boolean(body.enabled) : !config.enabled;

      await adminClient
        .from('bendy_sync_config')
        .update({ enabled: newEnabled })
        .eq('id', config.id);

      logInfo(FUNCTION_NAME, `Config ${toggleTenant} bijgewerkt: enabled=${newEnabled}`, { userId: user.id });

      return jsonResponse({
        success: true,
        data: { tenant: toggleTenant, enabled: newEnabled },
        metadata: { action: 'update_config', version: FUNCTION_VERSION },
      });
    }

    if (body.action === 'reset_lock') {
      const resetTenant = body.tenant || 'citozorg';
      const { data: config } = await adminClient
        .from('bendy_sync_config')
        .select('id, sync_status')
        .eq('tenant', resetTenant)
        .single();

      if (!config) {
        return errorResponse(`Config voor tenant "${resetTenant}" niet gevonden`, 404);
      }

      const previousStatus = config.sync_status;

      await adminClient
        .from('bendy_sync_config')
        .update({ sync_status: 'idle', error_message: null, updated_at: new Date().toISOString() })
        .eq('id', config.id);

      logInfo(FUNCTION_NAME, `Lock gereset voor ${resetTenant}: ${previousStatus} → idle`, { userId: user.id });

      return jsonResponse({
        success: true,
        data: { tenant: resetTenant, previous_status: previousStatus, new_status: 'idle' },
        metadata: { action: 'reset_lock', version: FUNCTION_VERSION },
      });
    }

    if (body.action !== 'sync_clients' && body.action !== 'sync_users' && body.action !== 'sync_documents') {
      return errorResponse(`Onbekende actie: ${body.action}. Beschikbaar: sync_clients, sync_users, sync_documents, update_config, reset_lock`, 400);
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
        entity_type: body.action === 'sync_users' ? 'users' : body.action === 'sync_documents' ? 'documents' : 'clients',
        status: 'running',
      })
      .select('id')
      .single();

    syncLogId = syncLog?.id || '';

    let result: SyncResult;
    if (body.action === 'sync_users') {
      result = await syncUsers(adminClient, tenant, orgId, syncType);
    } else if (body.action === 'sync_documents') {
      result = await syncDocuments(adminClient, tenant, orgId, syncType);
    } else {
      result = await syncClients(adminClient, tenant, orgId, syncType);
    }

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
