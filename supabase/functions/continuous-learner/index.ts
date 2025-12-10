/**
 * CONTINUOUS LEARNER - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Maintains backward compatibility with existing callers.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse, errorResponse } from "../_shared/core.ts";

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    // Parse legacy request format
    const body = await req.json();
    const { 
      user_question, 
      ai_response, 
      knowledge_used,
      user_feedback,
      auto_apply = true,
      org_id,
      user_id,
    } = body;

    // Validate required fields
    if (!user_question || !ai_response) {
      console.log('⚠️ [continuous-learner shim] Missing required fields');
      return errorResponse('Missing required fields: user_question and ai_response are required', 400);
    }

    // Get org_id from body or fallback to default
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let resolvedOrgId = org_id;
    let resolvedUserId = user_id;

    // If no org_id provided, try to get from auth header
    if (!resolvedOrgId) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          resolvedUserId = user.id;
          const { data: userOrg } = await supabase
            .from('user_organizations')
            .select('org_id')
            .eq('user_id', user.id)
            .single();
          resolvedOrgId = userOrg?.org_id;
        }
      }
    }

    // Fallback to default org if still not found
    if (!resolvedOrgId) {
      resolvedOrgId = '550e8400-e29b-41d4-a716-446655440000'; // ABCzorg
      console.warn('⚠️ [continuous-learner shim] Using default org_id');
    }

    console.log(`🔄 [continuous-learner shim] Routing to unified-learner (org: ${resolvedOrgId})`);

    // Route to unified-learner
    const { data, error } = await supabase.functions.invoke('unified-learner', {
      body: {
        action: 'analyze_chat',
        user_question,
        ai_response,
        knowledge_used,
        user_feedback,
        auto_apply,
        org_id: resolvedOrgId,
        user_id: resolvedUserId,
      },
    });

    if (error) {
      console.error('❌ [continuous-learner shim] unified-learner error:', error);
      return errorResponse(error.message || 'unified-learner failed', 500);
    }

    // Check for success: false in response
    if (data && data.success === false) {
      console.error('❌ [continuous-learner shim] unified-learner returned failure:', data);
      return errorResponse(data.error || 'unified-learner returned failure', 500);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [continuous-learner shim] Completed in ${executionTime}ms`);

    return jsonResponse({
      ...data,
      _shim: 'continuous-learner -> unified-learner',
      _execution_time_ms: executionTime,
    });

  } catch (error) {
    console.error('❌ [continuous-learner shim] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
