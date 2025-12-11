import { corsHeaders, handleCors, createAdminClient, jsonResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  const result: any = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // DB Ping with 3s timeout
    const supabase = createAdminClient();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const dbStart = Date.now();
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();

      clearTimeout(timeoutId);
      const dbDuration = Date.now() - dbStart;

      result.checks.db = {
        status: error && error.code !== 'PGRST116' ? 'error' : 'ok',
        latency_ms: dbDuration,
        error: error?.message || null,
        error_code: error?.code || null,
      };
    } catch (dbError: any) {
      clearTimeout(timeoutId);
      result.checks.db = {
        status: 'timeout',
        latency_ms: Date.now() - dbStart,
        error: dbError.name === 'AbortError' ? 'Timeout (3s)' : dbError.message,
        error_code: dbError.code || null,
      };
    }

    result.overall_status = result.checks.db.status === 'ok' ? 'healthy' : 'degraded';
    result.total_duration_ms = Date.now() - startTime;

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: result.overall_status === 'healthy' ? 200 : 503,
    });
  } catch (error: any) {
    console.error('[PUBLIC-HEALTH] Critical error:', error);
    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        overall_status: 'error',
        error: error.message,
        total_duration_ms: Date.now() - startTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
