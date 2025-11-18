import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageId, feedback, context } = await req.json();
    
    // Validate messageId is a UUID
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's org
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    // Fetch the chat message to get knowledge_ids_for_feedback
    const { data: chatMessage, error: messageError } = await supabaseClient
      .from('chat_messages')
      .select('metadata')
      .eq('id', messageId)
      .single();

    if (messageError || !chatMessage) {
      console.error('Could not fetch chat message:', messageError);
    }

    // Extract usedKnowledge from message metadata
    let usedKnowledge: string[] = [];
    if (chatMessage?.metadata) {
      const metadata = chatMessage.metadata as any;
      usedKnowledge = Array.isArray(metadata.knowledge_ids_for_feedback) 
        ? metadata.knowledge_ids_for_feedback 
        : (Array.isArray(metadata.usedKnowledge) ? metadata.usedKnowledge : []);
    }

    const isPositive = feedback === 'positive';
    const eventType = isPositive ? 'feedback_positive' : 'feedback_negative';
    const outcome = isPositive ? 'success' : 'failure';
    const learningScore = isPositive ? 0.8 : 0.3;

    // Save to message_feedback table (prevents duplicate feedback)
    const { error: feedbackError } = await supabaseClient
      .from('message_feedback')
      .insert({
        user_id: user.id,
        message_id: messageId,
        feedback_type: feedback
      });

    // Ignore duplicate key errors (user already gave feedback)
    if (feedbackError && !feedbackError.message?.includes('duplicate')) {
      console.error('Error saving feedback:', feedbackError);
    }

    // Log learning event with correct usedKnowledge
    const { error: eventError } = await supabaseClient
      .from('ai_learning_events')
      .insert({
        user_id: user.id,
        org_id: userOrg?.org_id,
        event_type: eventType,
        context: {
          message: context?.message,
          usedKnowledge: usedKnowledge
        },
        outcome,
        learning_score: learningScore,
        applied_to_knowledge_base: false
      });

    if (eventError) {
      console.error('Error logging learning event:', eventError);
    }

    // Update confidence scores of related knowledge items
    if (usedKnowledge.length > 0) {
      const confidenceAdjustment = isPositive ? 0.05 : -0.05;
      
      for (const knowledgeId of usedKnowledge) {
        // Fetch current item WITH helpful_count and harmful_count
        const { data: currentItem } = await supabaseClient
          .from('ai_knowledge_base')
          .select('confidence_score, usage_count, helpful_count, harmful_count')
          .eq('id', knowledgeId)
          .single();

        if (currentItem) {
          const newConfidence = Math.max(0, Math.min(1, 
            (currentItem.confidence_score || 0.5) + confidenceAdjustment
          ));
          
          const newUsageCount = (currentItem.usage_count || 0) + (isPositive ? 1 : 0);

          // ACE PHASE 1: Update helpful_count or harmful_count
          const newHelpfulCount = (currentItem.helpful_count || 0) + (isPositive ? 1 : 0);
          const newHarmfulCount = (currentItem.harmful_count || 0) + (isPositive ? 0 : 1);

          await supabaseClient
            .from('ai_knowledge_base')
            .update({ 
              confidence_score: newConfidence,
              usage_count: newUsageCount,
              helpful_count: newHelpfulCount,
              harmful_count: newHarmfulCount,
              last_used_at: new Date().toISOString()
            })
            .eq('id', knowledgeId);
          
          console.log(`📊 [ACE] Updated ${knowledgeId}: helpful=${newHelpfulCount}, harmful=${newHarmfulCount}`);
        }
      }
    }

    // ACE AUTO-PRUNING: Check if any knowledge items should be soft-deleted
    if (usedKnowledge.length > 0) {
      const { data: itemsToCheck } = await supabaseClient
        .from('ai_knowledge_base')
        .select('id, key, helpful_count, harmful_count, deleted_at')
        .in('id', usedKnowledge)
        .is('deleted_at', null); // Only check active items

      if (itemsToCheck) {
        for (const item of itemsToCheck) {
          const totalFeedback = (item.helpful_count || 0) + (item.harmful_count || 0);
          const harmfulCount = item.harmful_count || 0;
          
          // ACE PRUNING CRITERIA:
          // 1. At least 3 harmful votes
          // 2. Harmful ratio >= 70%
          if (harmfulCount >= 3 && totalFeedback > 0) {
            const harmfulRatio = harmfulCount / totalFeedback;
            
            if (harmfulRatio >= 0.70) {
              // Soft-delete the knowledge item
              await supabaseClient
                .from('ai_knowledge_base')
                .update({
                  deleted_at: new Date().toISOString(),
                  deleted_by: 'ACE_AUTO_PRUNER',
                  deletion_reason: {
                    trigger: 'auto_pruning',
                    harmful_count: harmfulCount,
                    helpful_count: item.helpful_count || 0,
                    harmful_ratio: Math.round(harmfulRatio * 100),
                    threshold: '70%',
                    pruned_at: new Date().toISOString()
                  }
                })
                .eq('id', item.id);
              
              console.log(`🗑️ [ACE PRUNER] Auto-deleted knowledge item: ${item.key} (${Math.round(harmfulRatio * 100)}% harmful, ${harmfulCount}/${totalFeedback} votes)`);
              
              // Create business intelligence alert
              await supabaseClient
                .from('business_intelligence')
                .insert({
                  org_id: userOrg?.org_id,
                  intelligence_type: 'data_quality',
                  type: 'knowledge',
                  severity: 'high',
                  title: 'Knowledge Item Auto-Pruned (ACE)',
                  description: `Knowledge item "${item.key}" was automatically deleted due to high harmful feedback ratio (${Math.round(harmfulRatio * 100)}%)`,
                  impact_score: 0.8,
                  priority: 'high',
                  status: 'active',
                  data: {
                    knowledge_id: item.id,
                    knowledge_key: item.key,
                    harmful_count: harmfulCount,
                    helpful_count: item.helpful_count || 0,
                    harmful_ratio: harmfulRatio,
                    pruned_by: 'ACE_AUTO_PRUNER'
                  }
                });
            }
          }
        }
      }
    }

    // Create business intelligence insight on negative feedback
    if (!isPositive && context?.message) {
      await supabaseClient
        .from('business_intelligence')
        .insert({
          org_id: userOrg?.org_id,
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
            context: context
          }
        });
    }

    // 🧠 CONTINUOUS LEARNER: Deep analysis with feedback
    // Call continuous-learner to analyze the response with user feedback
    try {
      console.log('🧠 Triggering continuous-learner with user feedback...');
      
      // Fetch the assistant's response from the chat message
      const { data: assistantMessage } = await supabaseClient
        .from('chat_messages')
        .select('content')
        .eq('id', messageId)
        .single();

      if (assistantMessage?.content && context?.message) {
        const learnerResponse = await supabaseClient.functions.invoke('continuous-learner', {
          body: {
            user_question: context.message,
            ai_response: assistantMessage.content,
            knowledge_used: usedKnowledge,
            user_feedback: isPositive ? 'helpful' : 'harmful',
            auto_apply: true
          }
        });
        
        if (learnerResponse.error) {
          console.error('❌ Continuous learner error:', learnerResponse.error);
        } else {
          console.log('✅ Continuous learner feedback analysis complete:', learnerResponse.data);
        }
      }
    } catch (error) {
      console.error('❌ Failed to invoke continuous-learner:', error);
      // Don't fail the request if continuous-learner fails
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Feedback verwerkt en AI systeem verbeterd'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error processing feedback:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});