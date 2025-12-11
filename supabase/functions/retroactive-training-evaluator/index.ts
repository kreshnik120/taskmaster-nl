/**
 * RETROACTIVE TRAINING EVALUATOR - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Maintains backward compatibility with cron schedule.
 * Re-evaluates previously rejected learning events.
 */

import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const supabase = createAdminClient();

    // Parse optional body parameters
    let minConfidence = 0.80;
    let maxConfidence = 0.85;
    let limit = 100;
    
    try {
      const body = await req.json();
      minConfidence = body.min_confidence ?? 0.80;
      maxConfidence = body.max_confidence ?? 0.85;
      limit = body.limit ?? 100;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Get default org_id (ABCzorg)
    const orgId = '550e8400-e29b-41d4-a716-446655440000';

    console.log(`🔄 [retroactive-training-evaluator shim] Routing to unified-learner (confidence: ${minConfidence}-${maxConfidence})`);

    // Route to unified-learner
    const { data, error } = await supabase.functions.invoke('unified-learner', {
      body: {
        action: 'retroactive_scan',
        min_confidence: minConfidence,
        max_confidence: maxConfidence,
        limit: limit,
        org_id: orgId,
      },
    });

    if (error) {
      console.error('❌ [retroactive-training-evaluator shim] unified-learner error:', error);
      return errorResponse(error.message, 500);
    }

    // Check for success: false in response
    if (data && data.success === false) {
      console.error('❌ [retroactive-training-evaluator shim] unified-learner returned failure:', data);
      return errorResponse(data.error || 'unified-learner returned failure', 500);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [retroactive-training-evaluator shim] Completed in ${executionTime}ms`);

    return jsonResponse({
      success: true,
      ...data,
      _shim: 'retroactive-training-evaluator -> unified-learner',
      _execution_time_ms: executionTime,
    });

  } catch (error) {
    console.error("❌ [retroactive-training-evaluator shim] Error:", error);
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
