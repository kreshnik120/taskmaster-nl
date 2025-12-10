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
