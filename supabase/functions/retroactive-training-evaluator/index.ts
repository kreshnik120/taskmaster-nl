/**
 * RETROACTIVE TRAINING EVALUATOR - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Maintains backward compatibility with cron schedule.
 * Re-evaluates previously rejected learning events.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for success: false in response
    if (data && data.success === false) {
      console.error('❌ [retroactive-training-evaluator shim] unified-learner returned failure:', data);
      return new Response(
        JSON.stringify({ error: data.error || 'unified-learner returned failure' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [retroactive-training-evaluator shim] Completed in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        ...data,
        _shim: 'retroactive-training-evaluator -> unified-learner',
        _execution_time_ms: executionTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [retroactive-training-evaluator shim] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
