import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

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
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('🤖 Auto-validate trusted knowledge starting...');
    
    const { batch_size = 1000, offset = 0 } = await req.json().catch(() => ({}));
    
    console.log(`📊 Processing batch: size=${batch_size}, offset=${offset}`);
    
    const supabase = createAdminClient();

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
      return jsonResponse({ success: true, validated: 0, message: 'No items to validate' });
    }

    console.log(`📊 Found ${candidates.length} candidates`);

    // Helper function to detect placeholder text
    const hasPlaceholderText = (item: any): boolean => {
      if (!item || typeof item !== 'object') return false;
      
      const valueStr = JSON.stringify(item).toLowerCase();
      const placeholders = [
        'nog te bepalen',
        'in te vullen', 
        'todo',
        'tbd',
        'not available',
        'n/a',
        'unknown',
        'onbekend',
        'nvt',
        'xxx'
      ];
      
      return placeholders.some(pattern => valueStr.includes(pattern));
    };

    // Filter op trust criteria
    const trustedItems = candidates.filter(item => {
      if (hasPlaceholderText(item)) {
        console.log(`❌ Skipping ${item.key}: contains placeholder text`);
        return false;
      }
      
      const isTrustedSource = item.source && TRUSTED_DOMAINS.some(domain => 
        item.source.toLowerCase().includes(domain)
      );

      const isHighConfidence = 
        item.confidence_score >= 0.7 && 
        (item.harmful_count || 0) === 0;

      const hasPositiveFeedback = (item.helpful_count || 0) >= 2;

      return isTrustedSource || isHighConfidence || hasPositiveFeedback;
    });

    if (trustedItems.length === 0) {
      console.log('⚠️ No items meet trust criteria');
      return jsonResponse({ 
        success: true, 
        validated: 0, 
        message: 'No items meet trust criteria',
        candidates_checked: candidates.length 
      });
    }

    console.log(`✅ ${trustedItems.length} items meet trust criteria`);

    // Update validation status IN BATCHES
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
        console.error(`❌ Update batch ${i}-${i + batch.length} failed:`, updateError);
        throw updateError;
      }
      
      console.log(`✅ Updated batch ${Math.floor(i / UPDATE_BATCH_SIZE) + 1}/${Math.ceil(itemIds.length / UPDATE_BATCH_SIZE)}: ${batch.length} items`);
    }

    // Log validation events
    const events = trustedItems.map(item => {
      const validationReason = 
        TRUSTED_DOMAINS.some(d => item.source?.toLowerCase().includes(d)) ? 'trusted_source' :
        item.confidence_score >= 0.8 ? 'high_confidence' :
        'positive_feedback';
      
      return {
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: null,
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

    const INSERT_BATCH_SIZE = 200;
    
    console.log(`📦 Inserting ${events.length} learning events in batches of ${INSERT_BATCH_SIZE}...`);
    
    for (let i = 0; i < events.length; i += INSERT_BATCH_SIZE) {
      const batch = events.slice(i, i + INSERT_BATCH_SIZE);
      const { error: logError } = await supabase
        .from('ai_learning_events')
        .insert(batch);
      
      if (logError) {
        console.error(`⚠️ Failed to log events batch ${i}-${i + batch.length}:`, logError);
      } else {
        console.log(`✅ Logged events batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}/${Math.ceil(events.length / INSERT_BATCH_SIZE)}`);
      }
    }

    console.log(`✅ Auto-validated ${trustedItems.length} items`);

    return jsonResponse({ 
      success: true, 
      validated: trustedItems.length,
      candidates_checked: candidates.length,
      items: trustedItems.map(i => ({ id: i.id, category: i.category, key: i.key }))
    });

  } catch (error) {
    console.error('❌ Error in auto-validate-trusted-knowledge:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      {
        code: (error as any)?.code,
        details: (error as any)?.details
      }
    );
  }
});
