import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Trusted sources (configureerbaar uitbreiden)
const TRUSTED_DOMAINS = [
  'overheid.nl',
  'rijksoverheid.nl',
  'belastingdienst.nl',
  'uwv.nl',
  'svb.nl',
  'cbr.nl',
  'duo.nl'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🤖 Auto-validate trusted knowledge starting...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const BATCH_SIZE = 1000;

    // Fetch unverified items die voldoen aan trust criteria
    const { data: candidates, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, source, confidence_score, helpful_count, harmful_count, category, key')
      .eq('validation_status', 'unverified')
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw fetchError;
    }

    if (!candidates || candidates.length === 0) {
      console.log('✅ No unverified items found');
      return new Response(
        JSON.stringify({ success: true, validated: 0, message: 'No items to validate' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${candidates.length} candidates`);

    // Filter op trust criteria
    const trustedItems = candidates.filter(item => {
      // Criterium 1: Trusted domain
      const isTrustedSource = item.source && TRUSTED_DOMAINS.some(domain => 
        item.source.toLowerCase().includes(domain)
      );

      // Criterium 2: High confidence + geen negatieve feedback
      const isHighConfidence = 
        item.confidence_score >= 0.8 && 
        (item.harmful_count || 0) === 0;

      // Criterium 3: Positieve feedback van gebruikers
      const hasPositiveFeedback = (item.helpful_count || 0) >= 5;

      return isTrustedSource || isHighConfidence || hasPositiveFeedback;
    });

    if (trustedItems.length === 0) {
      console.log('⚠️ No items meet trust criteria');
      return new Response(
        JSON.stringify({ 
          success: true, 
          validated: 0, 
          message: 'No items meet trust criteria',
          candidates_checked: candidates.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ ${trustedItems.length} items meet trust criteria`);

    // Update validation status
    const itemIds = trustedItems.map(i => i.id);
    const { error: updateError } = await supabase
      .from('ai_knowledge_base')
      .update({
        validation_status: 'verified',
        last_verified: new Date().toISOString()
      })
      .in('id', itemIds);

    if (updateError) {
      throw updateError;
    }

    // Log validation events
    const events = trustedItems.map(item => ({
      org_id: '550e8400-e29b-41d4-a716-446655440000', // Default org
      event_type: 'auto_validation',
      metadata: {
        knowledge_id: item.id,
        category: item.category,
        key: item.key,
        validation_reason: 
          TRUSTED_DOMAINS.some(d => item.source?.toLowerCase().includes(d)) ? 'trusted_source' :
          item.confidence_score >= 0.8 ? 'high_confidence' :
          'positive_feedback',
        source: item.source,
        confidence_score: item.confidence_score
      }
    }));

    await supabase
      .from('ai_learning_events')
      .insert(events);

    console.log(`✅ Auto-validated ${trustedItems.length} items`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        validated: trustedItems.length,
        candidates_checked: candidates.length,
        items: trustedItems.map(i => ({ id: i.id, category: i.category, key: i.key }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-validate-trusted-knowledge:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});