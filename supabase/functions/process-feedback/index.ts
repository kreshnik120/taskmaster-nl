/**
 * PROCESS FEEDBACK - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Handles single feedback events from UI (thumbs up/down).
 * Maintains backward compatibility with existing callers.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { messageId, feedback, context } = await req.json();
    
    // Validate messageId
    if (!messageId || typeof messageId !== 'string') {
      return new Response(JSON.stringify({ error: 'Ongeldig bericht ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's org
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    const orgId = userOrg?.org_id || '550e8400-e29b-41d4-a716-446655440000';

    // Fetch the chat message to get knowledge_ids_for_feedback
    const { data: chatMessage } = await supabase
      .from('chat_messages')
      .select('metadata, content')
      .eq('id', messageId)
      .single();

    // Extract usedKnowledge from message metadata
    let usedKnowledge: string[] = [];
    if (chatMessage?.metadata) {
      const metadata = chatMessage.metadata as Record<string, unknown>;
      usedKnowledge = Array.isArray(metadata.knowledge_ids_for_feedback) 
        ? metadata.knowledge_ids_for_feedback as string[]
        : (Array.isArray(metadata.usedKnowledge) ? metadata.usedKnowledge as string[] : []);
    }

    const isPositive = feedback === 'positive';
    const feedbackType = isPositive ? 'helpful' : 'harmful';

    // Save to message_feedback table (prevents duplicate feedback)
    const { error: feedbackError } = await supabase
      .from('message_feedback')
      .insert({
        user_id: user.id,
        message_id: messageId,
        feedback_type: feedback,
      });

    // Ignore duplicate key errors
    if (feedbackError && !feedbackError.message?.includes('duplicate')) {
      console.error('[process-feedback shim] Error saving feedback:', feedbackError);
    }

    console.log(`🔄 [process-feedback shim] Routing to unified-learner (${usedKnowledge.length} knowledge items, feedback: ${feedbackType})`);

    // Route to unified-learner for single feedback processing
    const { data, error } = await supabase.functions.invoke('unified-learner', {
      body: {
        action: 'process_feedback',
        batch_mode: false,
        knowledge_ids: usedKnowledge,
        feedback_type: feedbackType,
        message_context: context?.message,
        org_id: orgId,
        user_id: user.id,
      },
    });

    if (error) {
      console.error('❌ [process-feedback shim] unified-learner error:', error);
      // Don't fail the request - feedback was saved
    }

    // Also trigger continuous-learner for deep analysis (legacy behavior)
    if (chatMessage?.content && context?.message) {
      try {
        await supabase.functions.invoke('continuous-learner', {
          body: {
            user_question: context.message,
            ai_response: chatMessage.content,
            knowledge_used: usedKnowledge,
            user_feedback: feedbackType,
            auto_apply: true,
            org_id: orgId,
            user_id: user.id,
          },
        });
      } catch (learnerError) {
        console.error('❌ [process-feedback shim] continuous-learner error:', learnerError);
        // Don't fail the request
      }
    }

    // Create business intelligence insight on negative feedback (legacy behavior)
    if (!isPositive && context?.message) {
      await supabase
        .from('business_intelligence')
        .insert({
          org_id: orgId,
          intelligence_type: 'optimization_opportunity',
          type: 'knowledge',
          severity: 'medium',
          title: 'AI Response Needs Improvement',
          description: `Negative feedback on message: "${context.message.substring(0, 100)}..."`,
          impact_score: 0.6,
          priority: 'medium',
          status: 'active',
          data: {
            feedback_type: feedback,
            context: context,
          },
        });
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [process-feedback shim] Completed in ${executionTime}ms`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Feedback verwerkt en AI systeem verbeterd',
        _shim: 'process-feedback -> unified-learner',
        _execution_time_ms: executionTime,
        ...data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-feedback shim] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
