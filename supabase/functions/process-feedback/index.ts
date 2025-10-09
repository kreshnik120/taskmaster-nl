import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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
        // Get current item
        const { data: currentItem } = await supabaseClient
          .from('ai_knowledge_base')
          .select('confidence_score, usage_count')
          .eq('id', knowledgeId)
          .single();

        if (currentItem) {
          const newConfidence = Math.max(0, Math.min(1, 
            (currentItem.confidence_score || 0.5) + confidenceAdjustment
          ));
          
          const newUsageCount = (currentItem.usage_count || 0) + (isPositive ? 1 : 0);

          await supabaseClient
            .from('ai_knowledge_base')
            .update({ 
              confidence_score: newConfidence,
              usage_count: newUsageCount,
              last_used_at: new Date().toISOString()
            })
            .eq('id', knowledgeId);
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