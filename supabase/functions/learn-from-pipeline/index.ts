/**
 * LEARN FROM PIPELINE - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Maintains backward compatibility with cron schedule and existing callers.
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional body parameters
    let daysBack = 7;
    try {
      const body = await req.json();
      daysBack = body.days_back ?? 7;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Get default org_id (ABCzorg)
    const orgId = '550e8400-e29b-41d4-a716-446655440000';

    console.log(`🔄 [learn-from-pipeline shim] Routing to unified-learner (days_back: ${daysBack})`);

    // Route to unified-learner
    const { data, error } = await supabase.functions.invoke('unified-learner', {
      body: {
        action: 'learn_pipeline',
        days_back: daysBack,
        org_id: orgId,
      },
    });

    if (error) {
      console.error('❌ [learn-from-pipeline shim] unified-learner error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for success: false in response
    if (data && data.success === false) {
      console.error('❌ [learn-from-pipeline shim] unified-learner returned failure:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || 'unified-learner returned failure' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [learn-from-pipeline shim] Completed in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        ...data,
        _shim: 'learn-from-pipeline -> unified-learner',
        _execution_time_ms: executionTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[learn-from-pipeline shim] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
