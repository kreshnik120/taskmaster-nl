import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    
    // Parse request body for batch parameters
    const { batch_size = 1000, offset = 0 } = await req.json().catch(() => ({}));
    
    console.log(`📊 Processing batch: size=${batch_size}, offset=${offset}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch unverified items with OFFSET for chunked processing
    const { data: candidates, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, source, confidence_score, helpful_count, harmful_count, category, key')
      .eq('validation_status', 'unverified')
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .range(offset, offset + batch_size - 1);

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

      // Criterium 2: High confidence + geen negatieve feedback (VERLAAGD: 0.8 → 0.7)
      const isHighConfidence = 
        item.confidence_score >= 0.7 && 
        (item.harmful_count || 0) === 0;

      // Criterium 3: Positieve feedback van gebruikers (VERLAAGD: 5 → 2)
      const hasPositiveFeedback = (item.helpful_count || 0) >= 2;

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

    // Update validation status IN BATCHES (prevent URL length issues)
    const itemIds = trustedItems.map(i => i.id);
    const UPDATE_BATCH_SIZE = 200;
    
    console.log(`📦 Updating ${itemIds.length} items in batches of ${UPDATE_BATCH_SIZE}...`);
    
    for (let i = 0; i < itemIds.length; i += UPDATE_BATCH_SIZE) {
      const batch = itemIds.slice(i, i + UPDATE_BATCH_SIZE);
      const { error: updateError } = await supabase
        .from('ai_knowledge_base')
        .update({
          validation_status: 'verified',
          last_verified: new Date().toISOString()
        })
        .in('id', batch);

      if (updateError) {
        console.error(`❌ Update batch ${i}-${i + batch.length} failed:`, {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint
        });
        throw updateError;
      }
      
      console.log(`✅ Updated batch ${Math.floor(i / UPDATE_BATCH_SIZE) + 1}/${Math.ceil(itemIds.length / UPDATE_BATCH_SIZE)}: ${batch.length} items`);
    }

    // Log validation events - use NULL user_id for system events (service_role)
    const events = trustedItems.map(item => {
      const validationReason = 
        TRUSTED_DOMAINS.some(d => item.source?.toLowerCase().includes(d)) ? 'trusted_source' :
        item.confidence_score >= 0.8 ? 'high_confidence' :
        'positive_feedback';
      
      return {
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: null, // NULL for system events - allowed by RLS for service_role
        event_type: 'auto_validation',
        context: {
          validation_reason: validationReason,
          knowledge_id: item.id,
          category: item.category,
          key: item.key,
          source: item.source,
          confidence_score: item.confidence_score
        },
        outcome: 'auto_validated',
        learning_score: item.confidence_score
      };
    });

    // Insert learning events IN BATCHES (prevent payload size issues)
    const INSERT_BATCH_SIZE = 200;
    
    console.log(`📦 Inserting ${events.length} learning events in batches of ${INSERT_BATCH_SIZE}...`);
    
    for (let i = 0; i < events.length; i += INSERT_BATCH_SIZE) {
      const batch = events.slice(i, i + INSERT_BATCH_SIZE);
      const { error: logError } = await supabase
        .from('ai_learning_events')
        .insert(batch);
      
      if (logError) {
        console.error(`⚠️ Failed to log events batch ${i}-${i + batch.length}:`, {
          code: logError.code,
          message: logError.message,
          details: logError.details,
          hint: logError.hint
        });
        // Don't crash - validation already succeeded
      } else {
        console.log(`✅ Logged events batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}/${Math.ceil(events.length / INSERT_BATCH_SIZE)}`);
      }
    }

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
    console.error('❌ Error in auto-validate-trusted-knowledge:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      stack: error instanceof Error ? error.stack : undefined
    });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any)?.code,
        details: (error as any)?.details
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});