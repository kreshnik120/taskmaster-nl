import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    console.log('🧹 Starting feedback backlog cleanup for user:', user.id);

    // Get user's organizations
    const { data: userOrgs, error: orgError } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id);

    if (orgError) throw orgError;

    const orgIds = userOrgs?.map(o => o.org_id) || [];
    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ updated_count: 0, message: 'No organizations found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch feedback events that are not applied
    const { data: feedbackEvents, error: fetchError } = await supabaseClient
      .from('ai_learning_events')
      .select('*')
      .in('event_type', ['feedback_positive', 'feedback_negative'])
      .eq('applied_to_knowledge_base', false)
      .in('org_id', orgIds);

    if (fetchError) throw fetchError;

    console.log(`📊 Found ${feedbackEvents?.length || 0} unapplied feedback events`);

    // Filter in code: only events without usedKnowledge
    const eventsToUpdate = feedbackEvents?.filter(event => {
      const context = event.context || {};
      const usedKnowledge = context.usedKnowledge;
      return !usedKnowledge || (Array.isArray(usedKnowledge) && usedKnowledge.length === 0);
    }) || [];

    console.log(`🎯 ${eventsToUpdate.length} events missing usedKnowledge, marking as skipped`);

    if (eventsToUpdate.length === 0) {
      return new Response(
        JSON.stringify({ updated_count: 0, message: 'No events to clean up' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const idsToUpdate = eventsToUpdate.map(e => e.id);

    // Batch update
    const { error: updateError } = await supabaseClient
      .from('ai_learning_events')
      .update({
        applied_to_knowledge_base: true,
        outcome: 'skipped_missing_knowledge_ids'
      })
      .in('id', idsToUpdate);

    if (updateError) throw updateError;

    console.log(`✅ Successfully cleaned up ${idsToUpdate.length} feedback events`);

    return new Response(
      JSON.stringify({
        updated_count: idsToUpdate.length,
        updated_ids: idsToUpdate,
        message: `Successfully cleaned up ${idsToUpdate.length} feedback events`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in cleanup-feedback-backlog:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});