/**
 * FEEDBACK PROCESSOR - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Maintains backward compatibility with cron schedule.
 * Processes feedback in batch mode.
 */

import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const supabase = createAdminClient();

    // Get first organization (legacy behavior)
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    if (!orgs) {
      return errorResponse('No organization found', 400);
    }

    const orgId = orgs.id;
    console.log(`🔄 [feedback-processor shim] Routing to unified-learner (batch mode, org: ${orgId})`);

    // Route to unified-learner in batch mode
    const { data, error } = await supabase.functions.invoke('unified-learner', {
      body: {
        action: 'process_feedback',
        batch_mode: true,
        org_id: orgId,
      },
    });

    if (error) {
      console.error('❌ [feedback-processor shim] unified-learner error:', error);
      return errorResponse(error.message, 500);
    }

    // Check for success: false in response
    if (data && data.success === false) {
      console.error('❌ [feedback-processor shim] unified-learner returned failure:', data);
      return errorResponse(data.error || 'unified-learner returned failure', 500);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [feedback-processor shim] Completed in ${executionTime}ms`);

    // Log function call (legacy behavior)
    await supabase.from('function_call_logs').insert({
      function_name: 'feedback-processor',
      user_id: orgId,
      org_id: orgId,
      success: true,
      execution_time_ms: executionTime,
    });

    return jsonResponse({
      success: true,
      ...data,
      _shim: 'feedback-processor -> unified-learner',
      _execution_time_ms: executionTime,
    });

  } catch (error) {
    console.error('❌ [feedback-processor shim] Error:', error);
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
