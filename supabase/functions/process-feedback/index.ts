/**
 * PROCESS FEEDBACK - Shim
 * 
 * This function is now a shim that routes to unified-learner.
 * Handles single feedback events from UI (thumbs up/down).
 * Maintains backward compatibility with existing callers.
 */

import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const { messageId, feedback, context } = await req.json();
    
    // Validate messageId
    if (!messageId || typeof messageId !== 'string') {
      return errorResponse('Ongeldig bericht ID', 400);
    }
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Authenticatie vereist', 401);
    }

    const supabase = createAdminClient();

    // Get user from auth header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError || !user) {
      return errorResponse('Authenticatie gefaald', 401);
    }

    // Get user's org
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    const orgId = userOrg?.org_id || '550e8400-e29b-41d4-a716-446655440000';

    // ✅ FIX: Query ai_chat_messages (correct table) with fallback to legacy chat_messages
    console.log(`🔍 [process-feedback] Looking up message ${messageId}...`);
    
    let usedKnowledge: string[] = [];
    
    // Step 1: Try ai_chat_messages first (new schema)
    const { data: aiChatMessage, error: aiChatError } = await supabase
      .from('ai_chat_messages')
      .select('used_knowledge, content')
      .eq('id', messageId)
      .maybeSingle();
    
    if (aiChatMessage?.used_knowledge && Array.isArray(aiChatMessage.used_knowledge)) {
      usedKnowledge = aiChatMessage.used_knowledge;
      console.log(`✅ [process-feedback] Found ${usedKnowledge.length} knowledge IDs in ai_chat_messages`);
    } else {
      // Step 2: Fallback to legacy chat_messages table
      console.log(`⚠️ [process-feedback] Not found in ai_chat_messages, trying legacy chat_messages...`);
      const { data: legacyMessage } = await supabase
        .from('chat_messages')
        .select('metadata, content')
        .eq('id', messageId)
        .maybeSingle();
      
      if (legacyMessage?.metadata) {
        const metadata = legacyMessage.metadata as Record<string, unknown>;
        usedKnowledge = Array.isArray(metadata.knowledge_ids_for_feedback) 
          ? metadata.knowledge_ids_for_feedback as string[]
          : (Array.isArray(metadata.usedKnowledge) ? metadata.usedKnowledge as string[] : []);
        console.log(`✅ [process-feedback] Found ${usedKnowledge.length} knowledge IDs in legacy chat_messages`);
      } else {
        console.warn(`⚠️ [process-feedback] Message ${messageId} not found in either table`);
      }
    }

    const isPositive = feedback === 'positive';
    const feedbackType = isPositive ? 'helpful' : 'harmful';

    // Save to message_feedback table with knowledge_ids (prevents duplicate feedback)
    const { error: feedbackError } = await supabase
      .from('message_feedback')
      .insert({
        user_id: user.id,
        message_id: messageId,
        feedback_type: feedback,
        knowledge_ids: usedKnowledge, // FIX: Store knowledge_ids for batch processing
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

    // NOTE: Removed duplicate continuous-learner call - unified-learner now handles all learning

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

    return jsonResponse({ 
      success: true,
      message: 'Feedback verwerkt en AI systeem verbeterd',
      _shim: 'process-feedback -> unified-learner',
      _execution_time_ms: executionTime,
      ...data,
    });

  } catch (error) {
    console.error('[process-feedback shim] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
