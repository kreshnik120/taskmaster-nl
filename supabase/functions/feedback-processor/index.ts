import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log('🔄 Feedback Processor starting...');

    // Fetch first organization
    const { data: orgs } = await supabaseClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    if (!orgs) {
      throw new Error('No organization found');
    }

    const orgId = orgs.id;
    console.log(`🏢 Processing org: ${orgId}`);

    // Fetch unapplied feedback events
    const { data: feedbackEvents, error: fetchError } = await supabaseClient
      .from('ai_learning_events')
      .select('*')
      .eq('org_id', orgId)
      .in('event_type', ['feedback_negative', 'feedback_positive'])
      .eq('applied_to_knowledge_base', false)
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) throw fetchError;

    console.log(`📊 Found ${feedbackEvents?.length || 0} unapplied feedback events`);

    let negativeProcessed = 0;
    let positiveProcessed = 0;
    let errors = 0;

    for (const event of feedbackEvents || []) {
      try {
        const knowledgeIds = event.context?.usedKnowledge || [];
        
        if (knowledgeIds.length === 0) {
          console.log(`⚠️ No knowledge IDs in event ${event.id}, skipping`);
          continue;
        }

        if (event.event_type === 'feedback_negative') {
          // Downgrade confidence to 50%, flag for review
          console.log(`👎 Processing negative feedback for ${knowledgeIds.length} items`);
          
          const { error: updateError } = await supabaseClient
            .from('ai_knowledge_base')
            .update({
              confidence_score: 0.50,
              needs_review: true,
              last_validation_error: `Negative feedback: ${event.context?.message || 'User reported incorrect answer'}`,
              updated_at: new Date().toISOString()
            })
            .in('id', knowledgeIds)
            .is('deleted_at', null);

          if (updateError) {
            console.error(`Failed to update knowledge items:`, updateError);
            errors++;
            continue;
          }

          negativeProcessed++;

        } else if (event.event_type === 'feedback_positive') {
          // Boost confidence +10% (max 100%)
          console.log(`👍 Processing positive feedback for ${knowledgeIds.length} items`);
          
          // Fetch current scores
          const { data: currentItems } = await supabaseClient
            .from('ai_knowledge_base')
            .select('id, confidence_score, usage_count')
            .in('id', knowledgeIds)
            .is('deleted_at', null);

          if (currentItems) {
            for (const item of currentItems) {
              const newScore = Math.min(1.0, (item.confidence_score || 0.5) + 0.10);
              
              const { error: boostError } = await supabaseClient
                .from('ai_knowledge_base')
                .update({
                  confidence_score: newScore,
                  usage_count: (item.usage_count || 0) + 1,
                  last_used_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);

              if (boostError) {
                console.error(`Failed to boost item ${item.id}:`, boostError);
                errors++;
              }
            }
          }

          positiveProcessed++;
        }

        // Mark event as applied
        const { error: markError } = await supabaseClient
          .from('ai_learning_events')
          .update({
            applied_to_knowledge_base: true,
            outcome: 'applied'
          })
          .eq('id', event.id);

        if (markError) {
          console.error(`Failed to mark event ${event.id} as applied:`, markError);
        }

      } catch (eventError) {
        console.error(`Error processing event ${event.id}:`, eventError);
        errors++;
      }
    }

    console.log(`✅ Processed: ${negativeProcessed} negative, ${positiveProcessed} positive, ${errors} errors`);

    // Log to business intelligence
    const { error: biError } = await supabaseClient
      .from('business_intelligence')
      .insert({
        org_id: orgId,
        intelligence_type: 'feedback_processing',
        title: 'Feedback Loop Results',
        description: `Processed ${negativeProcessed} negative and ${positiveProcessed} positive feedback events`,
        priority: 'medium',
        status: 'active',
        impact_score: (negativeProcessed + positiveProcessed) / 5,
        data: {
          negative_processed: negativeProcessed,
          positive_processed: positiveProcessed,
          errors: errors,
          total_events: feedbackEvents?.length || 0
        }
      });

    if (biError) {
      console.error('Failed to log to business intelligence:', biError);
    }

    // Log function call
    await supabaseClient.from('function_call_logs').insert({
      function_name: 'feedback-processor',
      user_id: orgId,
      org_id: orgId,
      success: true,
      execution_time_ms: Math.floor(Date.now() - startTime)
    });

    return new Response(
      JSON.stringify({
        success: true,
        negative_processed: negativeProcessed,
        positive_processed: positiveProcessed,
        errors: errors,
        total_events: feedbackEvents?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Feedback Processor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
