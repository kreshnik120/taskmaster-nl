/**
 * SHARED CORE MODULE - Foundation for all edge functions
 * Eliminates CORS/Supabase client duplication across 62+ functions
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ============================================
// CORS HEADERS - Single source of truth
// ============================================
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// SUPABASE CLIENT FACTORIES
// ============================================

/**
 * Create admin client with service role key (full access)
 * Use for: background jobs, cron tasks, autonomous operations
 */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(url, key);
}

/**
 * Create anonymous client with user's auth header
 * Use for: user-initiated requests with RLS enforcement
 */
export function createAnonClient(authHeader: string | null): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  
  return createClient(url, key, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} }
  });
}

/**
 * Smart client factory - tries auth first, falls back to admin
 * Returns: { client, userId, orgId, isAuthenticated }
 */
export async function createSmartClient(authHeader: string | null): Promise<{
  client: SupabaseClient;
  userId: string | null;
  orgId: string;
  isAuthenticated: boolean;
}> {
  // Check if it's a real user auth (not the anon key embedded in header)
  const isRealUserAuth = authHeader && 
    !authHeader.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3');
  
  if (isRealUserAuth) {
    try {
      const client = createAnonClient(authHeader);
      const { data: { user }, error } = await client.auth.getUser();
      
      if (!error && user) {
        const { data: userOrg } = await client
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        return {
          client,
          userId: user.id,
          orgId: userOrg?.org_id || await getDefaultOrgId(client),
          isAuthenticated: true
        };
      }
    } catch (e) {
      console.log('⚠️ Auth failed, falling back to admin mode');
    }
  }
  
  // Fallback to admin client
  const client = createAdminClient();
  return {
    client,
    userId: null,
    orgId: await getDefaultOrgId(client),
    isAuthenticated: false
  };
}

async function getDefaultOrgId(client: SupabaseClient): Promise<string> {
  const { data: orgs } = await client.from('organizations').select('id').limit(1);
  return orgs?.[0]?.id || '';
}

// ============================================
// LEARNING CLIENT - Specialized for AI learning operations
// ============================================

export interface LearningContext {
  org_id?: string;
  user_id?: string;
  source?: string;
}

export interface LearningClientOptions {
  /** If true, throws error when org_id cannot be determined */
  requireOrgId?: boolean;
}

/**
 * Create a learning client for AI learning operations
 * 
 * ARCHITECTURE DECISION:
 * - Learning operations ALWAYS use admin client (service role)
 * - org_id/user_id are derived from request body, NOT from JWT
 * - This enables edge-to-edge calls without auth headers
 * - Security is enforced via org_id scoping in RPC functions
 * 
 * PRIORITY ORDER:
 * 1. bodyContext (from edge function payload) - for edge-to-edge calls
 * 2. authHeader (JWT extraction) - for direct frontend calls
 * 3. Fail fast if requireOrgId is true and no org found
 * 4. Default org (fallback) - only for single-tenant or system operations
 * 
 * @param bodyContext - org_id/user_id from request body (for edge-to-edge calls)
 * @param authHeader - Optional auth header (for direct frontend calls)
 * @param options - Options including requireOrgId for fail-fast behavior
 */
export async function createLearningClient(
  bodyContext?: LearningContext,
  authHeader?: string | null,
  options?: LearningClientOptions
): Promise<{
  client: SupabaseClient;
  orgId: string;
  userId: string | null;
  source: string;
}> {
  // Always use admin client for learning operations
  const client = createAdminClient();
  
  // Priority 1: Use context from body (edge-to-edge calls)
  if (bodyContext?.org_id) {
    logInfo('LearningClient', 'Using body context', { 
      hasOrgId: true, 
      hasUserId: !!bodyContext.user_id,
      source: bodyContext.source || 'edge-function'
    });
    return {
      client,
      orgId: bodyContext.org_id,
      userId: bodyContext.user_id || null,
      source: bodyContext.source || 'edge-function',
    };
  }
  
  // Priority 2: Try to extract from auth header (direct frontend calls)
  if (authHeader && !authHeader.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3')) {
    try {
      const anonClient = createAnonClient(authHeader);
      const { data: { user } } = await anonClient.auth.getUser();
      
      if (user) {
        const { data: userOrg } = await client
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (userOrg?.org_id) {
          logInfo('LearningClient', 'Using JWT context', { userId: user.id, orgId: userOrg.org_id });
          return {
            client,
            orgId: userOrg.org_id,
            userId: user.id,
            source: 'authenticated-user',
          };
        }
      }
    } catch (e) {
      logWarning('LearningClient', 'Auth extraction failed', { error: String(e) });
    }
  }
  
  // Fail fast if org_id is required but not found
  if (options?.requireOrgId) {
    throw new Error('org_id is required but could not be determined from body context or auth header');
  }
  
  // Fallback: use default org (only for single-tenant setup)
  const defaultOrgId = await getDefaultOrgId(client);
  logWarning('LearningClient', '⚠️ Using default org - only valid for single-tenant setup', { defaultOrgId });
  
  return {
    client,
    orgId: defaultOrgId,
    userId: null,
    source: 'fallback',
  };
}

// ============================================
// RESPONSE HELPERS
// ============================================

/**
 * Create JSON response with CORS headers
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Create error response with CORS headers
 */
export function errorResponse(message: string, status = 500, details?: unknown): Response {
  console.error(`❌ Error (${status}): ${message}`, details || '');
  return new Response(JSON.stringify({ 
    error: message,
    details: details || undefined 
  }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle CORS preflight request
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

// ============================================
// RETRY UTILITIES
// ============================================

/**
 * Retry async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw new Error(`Operation failed after ${maxRetries} attempts: ${lastError.message}`);
      }
      
      const delayMs = Math.pow(2, attempt - 1) * baseDelayMs;
      console.log(`⚠️ Attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError || new Error('Unexpected retry failure');
}

/**
 * Fetch with automatic retry for transient failures (502, 503)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  return retryWithBackoff(async () => {
    const response = await fetch(url, options);
    
    // Retry on transient errors
    if (response.status === 502 || response.status === 503) {
      throw new Error(`Service temporarily unavailable (${response.status})`);
    }
    
    return response;
  }, maxRetries);
}

// ============================================
// LOGGING HELPERS
// ============================================

export function logInfo(context: string, message: string, data?: unknown): void {
  console.log(`ℹ️ [${context}] ${message}`, data ? JSON.stringify(data) : '');
}

export function logSuccess(context: string, message: string, data?: unknown): void {
  console.log(`✅ [${context}] ${message}`, data ? JSON.stringify(data) : '');
}

export function logWarning(context: string, message: string, data?: unknown): void {
  console.warn(`⚠️ [${context}] ${message}`, data ? JSON.stringify(data) : '');
}

export function logError(context: string, message: string, error?: unknown): void {
  console.error(`❌ [${context}] ${message}`, error || '');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * Extract action from request body
 */
export async function parseRequestBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {} as T;
  } catch {
    return {} as T;
  }
}
