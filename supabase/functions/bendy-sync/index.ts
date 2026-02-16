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

async function syncClients(
  adminClient: any,
  tenant: string,
  orgId: string,
  _syncType: 'full' | 'incremental'
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  // ── STAP 1: Alle Bendy clients ophalen ──
  logInfo(FUNCTION_NAME, `Ophalen Bendy clients voor ${tenant}...`);
  const bendyClients = await fetchAllBendyRecords(tenant, '/api/v2/clients');
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
        .select('id, name, bendy_id, website, invoice_bedrijfsnaam, invoice_adres, invoice_postcode, invoice_plaats')
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
          .select('id, naam, adres, postcode, plaats, kostenplaats, telefoon, email, contactpersoon_naam, is_active, bendy_id, location_id, publieke_opmerking, interne_opmerking')
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
  action: 'sync_clients' | 'update_config';
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

    if (body.action !== 'sync_clients') {
      return errorResponse(`Onbekende actie: ${body.action}. Beschikbaar: sync_clients, update_config`, 400);
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
