/**
 * BENDY API PROXY — Enterprise Edge Function
 * Veilige proxy tussen abcito.io en Bendy Planning API.
 *
 * Auth: JWT in-code gevalideerd (gebruiker moet ingelogd zijn)
 * External: OAuth2 client_credentials naar Bendy
 * Protection: Circuit breaker, endpoint whitelist, timeout
 * Multi-tenant: CitoZorg nu, ABCzorg later
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

const FUNCTION_NAME = 'bendy-proxy';
const FUNCTION_VERSION = '1.0.0';

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

const DEFAULT_TENANT = 'citozorg';
const BENDY_REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

const ALLOWED_ENDPOINTS: readonly string[] = [
  '/api/v2/clients',
  '/api/v2/users',
  '/api/v2/requisitions',
  '/api/v2/requisitions/open',
  '/api/v2/requisitions/assigned',
  '/api/v2/documents',
  '/api/v2/document_types',
  '/api/v2/groups',
  '/api/v2/selection_lists',
] as const;

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;
type AllowedMethod = typeof ALLOWED_METHODS[number];

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
// REQUEST TYPES & VALIDATION
// ============================================

interface BendyProxyRequest {
  endpoint: string;
  method?: string;
  params?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
  tenant?: string;
}

function isEndpointAllowed(endpoint: string): boolean {
  const normalized = endpoint.replace(/\/+$/, '');
  return ALLOWED_ENDPOINTS.some(allowed =>
    normalized === allowed || normalized.startsWith(allowed + '/')
  );
}

function validateRequest(body: BendyProxyRequest): string | null {
  if (!body.endpoint) return 'Veld "endpoint" is verplicht (bv. "/api/v2/clients")';
  if (!body.endpoint.startsWith('/')) return 'Endpoint moet beginnen met "/"';

  if (!isEndpointAllowed(body.endpoint)) {
    return `Endpoint "${body.endpoint}" niet toegestaan. Whitelist: ${ALLOWED_ENDPOINTS.join(', ')}`;
  }

  if (body.method) {
    const upper = body.method.toUpperCase();
    if (!ALLOWED_METHODS.includes(upper as AllowedMethod)) {
      return `Method "${body.method}" niet toegestaan. Gebruik: ${ALLOWED_METHODS.join(', ')}`;
    }
  }

  if (body.tenant && !TENANT_CONFIG[body.tenant]) {
    return `Tenant "${body.tenant}" niet geconfigureerd. Beschikbaar: ${Object.keys(TENANT_CONFIG).join(', ')}`;
  }

  return null;
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    // STAP 1: Authenticatie — gebruiker moet ingelogd zijn
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('Niet geautoriseerd — login vereist', 401);
    }

    const anonClient = createAnonClient(authHeader);
    const { data: { user }, error: authError } = await anonClient.auth.getUser();

    if (authError || !user) {
      return errorResponse('Ongeldige sessie — log opnieuw in', 401);
    }

    // STAP 2: Request validatie
    let body: BendyProxyRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Ongeldig JSON formaat', 400);
    }

    const validationError = validateRequest(body);
    if (validationError) return errorResponse(validationError, 400);

    const tenant = body.tenant || DEFAULT_TENANT;
    const method = (body.method || 'GET').toUpperCase();
    const config = TENANT_CONFIG[tenant];

    logInfo(FUNCTION_NAME, `${method} ${body.endpoint}`, { tenant, userId: user.id });

    // STAP 3: Circuit breaker check
    const adminClient = createAdminClient();
    const circuitCheck = await canExecute(adminClient, config.circuitBreakerName);

    if (!circuitCheck.allowed) {
      logWarning(FUNCTION_NAME, `Circuit breaker OPEN voor ${tenant}`);
      return jsonResponse({
        success: false,
        error: `Bendy API (${tenant}) tijdelijk niet beschikbaar`,
        metadata: { tenant, endpoint: body.endpoint, circuit_breaker: circuitCheck.reason },
      }, 503);
    }

    // STAP 4: OAuth2 token ophalen
    let accessToken: string;
    try {
      accessToken = await getAccessToken(tenant);
    } catch (tokenError) {
      const msg = tokenError instanceof Error ? tokenError.message : String(tokenError);
      logError(FUNCTION_NAME, `Token mislukt: ${msg}`);
      await recordFailure(adminClient, config.circuitBreakerName, `Token: ${msg}`);
      return errorResponse(`Bendy authenticatie mislukt: ${msg}`, 502);
    }

    // STAP 5: Bendy API call
    let bendyUrl = `${config.baseUrl}${body.endpoint}`;

    if (body.params && Object.keys(body.params).length > 0) {
      const qp = new URLSearchParams();
      for (const [key, value] of Object.entries(body.params)) {
        qp.set(key, String(value));
      }
      bendyUrl += `?${qp.toString()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BENDY_REQUEST_TIMEOUT_MS);

    let bendyResponse: Response;
    try {
      bendyResponse = await fetch(bendyUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: (method !== 'GET' && method !== 'HEAD' && body.body)
          ? JSON.stringify(body.body)
          : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      const msg = isTimeout
        ? `Bendy timeout na ${BENDY_REQUEST_TIMEOUT_MS / 1000}s`
        : `Bendy onbereikbaar: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;

      logError(FUNCTION_NAME, msg);
      await recordFailure(adminClient, config.circuitBreakerName, msg);
      return errorResponse(msg, 502);
    }

    // STAP 6: Response verwerken
    const duration = Date.now() - startTime;

    if (!bendyResponse.ok) {
      const errorText = await bendyResponse.text().catch(() => 'Onbekende fout');
      logWarning(FUNCTION_NAME, `Bendy ${bendyResponse.status}`, { error: errorText.substring(0, 200) });

      if (bendyResponse.status >= 500) {
        await recordFailure(adminClient, config.circuitBreakerName, `HTTP ${bendyResponse.status}`);
      }

      // Token cache invalidatie bij 401
      if (bendyResponse.status === 401) {
        tokenCache.delete(tenant);
      }

      return jsonResponse({
        success: false,
        error: `Bendy API fout (${bendyResponse.status})`,
        metadata: { tenant, endpoint: body.endpoint, method, status: bendyResponse.status, duration_ms: duration },
      }, bendyResponse.status);
    }

    const responseData = await bendyResponse.json();
    await recordSuccess(adminClient, config.circuitBreakerName);

    logSuccess(FUNCTION_NAME, `${method} ${body.endpoint} OK`, {
      duration_ms: duration,
      records: Array.isArray(responseData?.data) ? responseData.data.length : 'n/a',
    });

    // STAP 7: Response terugsturen
    return jsonResponse({
      success: true,
      data: responseData,
      metadata: { tenant, endpoint: body.endpoint, method, status: bendyResponse.status, duration_ms: duration },
    });
  } catch (error) {
    logError(FUNCTION_NAME, 'Onverwachte fout', error);
    return errorResponse(`Interne fout: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});
