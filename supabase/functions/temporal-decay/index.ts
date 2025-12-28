// Temporal Decay Edge Function
// Applies time-based decay to low-quality auto-learned knowledge while protecting core Gemini data
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { CONFIDENCE_RULES, clampConfidence, isBelowPruneThreshold } from '../_shared/confidence-calculator.ts';

const BATCH_SIZE = 200; // Max items per run
const SOFT_DELETE_THRESHOLD = 0.30; // Confidence below this = soft delete

// Decay rules (multiplicative factors)
const DECAY_RULES = {
  // Items > 60 days old, never used
  decay_60_days_unused: 0.92,
  // Items > 90 days old, never verified
  decay_90_days_unverified: 0.85,
  // Items > 180 days old, low stability, never used
  decay_180_days_low_quality: 0.75,
};

// Protection thresholds
const PROTECTION = {
  min_usage_count: 5,
  min_stability_score: 0.9,
  verified_status: 'verified',
};

interface DecayResult {
  items_decayed: number;
  items_deleted: number;
  items_protected: number;
  avg_confidence_before: number;
  avg_confidence_after: number;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log('🕐 [temporal-decay] Starting temporal decay process...');

  try {
    const supabase = createAdminClient();
    const result: DecayResult = {
      items_decayed: 0,
      items_deleted: 0,
      items_protected: 0,
      avg_confidence_before: 0,
      avg_confidence_after: 0,
    };

    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Step 1: Get candidates for decay
    // IMPORTANT: Exclude protected items:
    // - Core Gemini data (source_reference IS NULL)
    // - Verified items
    // - High stability items
    // - High usage items
    const { data: candidates, error: candidatesError } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, confidence_score, usage_count, stability_score, validation_status, source_reference, created_at, last_used_at, value')
      .is('deleted_at', null)
      .not('source_reference', 'is', null) // Exclude core Gemini data
      .neq('validation_status', 'verified') // Exclude verified
      .lt('created_at', sixtyDaysAgo.toISOString()) // Older than 60 days
      .or(`usage_count.is.null,usage_count.lt.${PROTECTION.min_usage_count}`)
      .or(`stability_score.is.null,stability_score.lt.${PROTECTION.min_stability_score}`)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (candidatesError) {
      console.error('❌ [temporal-decay] Failed to fetch candidates:', candidatesError);
      return errorResponse(candidatesError.message, 500);
    }

    if (!candidates || candidates.length === 0) {
      console.log('✅ [temporal-decay] No decay candidates found');
      return jsonResponse({
        success: true,
        message: 'No items eligible for decay',
        ...result,
        duration_ms: Date.now() - startTime
      });
    }

    console.log(`📋 [temporal-decay] Found ${candidates.length} decay candidates`);

    // Calculate average confidence before
    const confidenceSum = candidates.reduce((sum: number, item: any) => 
      sum + (item.confidence_score || CONFIDENCE_RULES.default_confidence), 0);
    result.avg_confidence_before = confidenceSum / candidates.length;

    let totalConfidenceAfter = 0;

    // Step 2: Process each candidate
    for (const item of candidates) {
      try {
        const createdAt = new Date(item.created_at);
        const lastUsed = item.last_used_at ? new Date(item.last_used_at) : null;
        const usageCount = item.usage_count || 0;
        const stability = item.stability_score || 0;
        const currentConfidence = item.confidence_score || CONFIDENCE_RULES.default_confidence;

        // Additional protection check
        if (shouldProtect(item)) {
          result.items_protected++;
          totalConfidenceAfter += currentConfidence;
          continue;
        }

        // Determine decay factor
        let decayFactor = 1.0;
        let decayReason = '';

        // Rule 1: > 180 days old, low stability, never used
        if (createdAt < oneEightyDaysAgo && stability < 0.5 && usageCount === 0) {
          decayFactor = DECAY_RULES.decay_180_days_low_quality;
          decayReason = '180+ days, low stability, unused';
        }
        // Rule 2: > 90 days old, not verified, not used in 30 days
        else if (createdAt < ninetyDaysAgo && (!lastUsed || lastUsed < thirtyDaysAgo)) {
          decayFactor = DECAY_RULES.decay_90_days_unverified;
          decayReason = '90+ days, unverified, stale';
        }
        // Rule 3: > 60 days old, never used
        else if (createdAt < sixtyDaysAgo && usageCount === 0) {
          decayFactor = DECAY_RULES.decay_60_days_unused;
          decayReason = '60+ days, never used';
        }

        if (decayFactor === 1.0) {
          // No decay needed
          result.items_protected++;
          totalConfidenceAfter += currentConfidence;
          continue;
        }

        // Apply decay
        const newConfidence = clampConfidence(currentConfidence * decayFactor);
        totalConfidenceAfter += newConfidence;

        // Check if should soft delete
        if (newConfidence < SOFT_DELETE_THRESHOLD) {
          // Soft delete
          const { error: deleteError } = await supabase
            .from('ai_knowledge_base')
            .update({
              deleted_at: now.toISOString(),
              deletion_reason: {
                type: 'temporal_decay',
                reason: decayReason,
                final_confidence: newConfidence,
                original_confidence: currentConfidence
              },
              updated_at: now.toISOString()
            })
            .eq('id', item.id);

          if (!deleteError) {
            result.items_deleted++;
            console.log(`🗑️ Soft deleted item ${item.id} (${decayReason}) - confidence: ${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}`);
          }
        } else {
          // Apply decay
          const { error: updateError } = await supabase
            .from('ai_knowledge_base')
            .update({
              confidence_score: newConfidence,
              updated_at: now.toISOString()
            })
            .eq('id', item.id);

          if (!updateError) {
            result.items_decayed++;

            // Log version for audit trail
            try {
              await supabase.from('ai_knowledge_versions').insert({
                knowledge_id: item.id,
                version_number: 1,
                category: item.category,
                key: item.key,
                value: item.value,
                confidence_score: newConfidence,
                change_type: 'temporal_decay',
                change_reason: decayReason,
                ai_action_context: {
                  decay_factor: decayFactor,
                  original_confidence: currentConfidence,
                  created_at: item.created_at,
                  usage_count: usageCount
                }
              });
            } catch (versionErr) {
              // Non-critical
            }
          }
        }
      } catch (itemErr) {
        console.error(`❌ [temporal-decay] Error processing item ${item.id}:`, itemErr);
      }
    }

    // Calculate average confidence after
    result.avg_confidence_after = totalConfidenceAfter / candidates.length;

    // Step 3: Log the run
    try {
      await supabase.from('function_call_logs').insert({
        function_name: 'temporal-decay',
        status: 'success',
        execution_time_ms: Date.now() - startTime,
        input_data: { 
          batch_size: BATCH_SIZE, 
          candidates_found: candidates.length,
          thresholds: { sixtyDaysAgo, ninetyDaysAgo, oneEightyDaysAgo }
        },
        output_data: result,
        org_id: '550e8400-e29b-41d4-a716-446655440000'
      });
    } catch (logErr) {
      console.warn('⚠️ [temporal-decay] Failed to log run:', logErr);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [temporal-decay] Completed in ${duration}ms`);
    console.log(`   Decayed: ${result.items_decayed}, Deleted: ${result.items_deleted}, Protected: ${result.items_protected}`);
    console.log(`   Avg confidence: ${result.avg_confidence_before.toFixed(3)} → ${result.avg_confidence_after.toFixed(3)}`);

    return jsonResponse({
      success: true,
      ...result,
      duration_ms: duration
    });

  } catch (error) {
    console.error('❌ [temporal-decay] Fatal error:', error);
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});

/**
 * Additional protection check for items that shouldn't be decayed
 */
function shouldProtect(item: any): boolean {
  // Core Gemini data (source_reference is null or empty)
  if (!item.source_reference || item.source_reference === '') {
    return true;
  }

  // Verified items
  if (item.validation_status === 'verified') {
    return true;
  }

  // High usage items
  if ((item.usage_count || 0) >= PROTECTION.min_usage_count) {
    return true;
  }

  // High stability items
  if ((item.stability_score || 0) >= PROTECTION.min_stability_score) {
    return true;
  }

  // Source reference contains trusted sources
  const trustedSources = ['gemini', 'manual', 'import', 'seed'];
  const sourceRef = (item.source_reference || '').toLowerCase();
  if (trustedSources.some(src => sourceRef.includes(src))) {
    return true;
  }

  return false;
}
