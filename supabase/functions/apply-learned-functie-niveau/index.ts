/**
 * Apply Learned Functie Niveau
 * 
 * Promotes high-confidence functie_niveau suggestions to learned mappings.
 * 
 * Auto-promotion criteria:
 * - confidence_score >= 0.85
 * - occurrence_count >= 3
 * 
 * Medium-confidence suggestions (0.70-0.85) are flagged for human review.
 * 
 * Schedule: Daily at 04:15 UTC via master-scheduler
 * Enterprise Version: 1.0.0
 */
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { ORG_IDS } from '../_shared/healthcare-mappings.ts';

const VERSION = '1.0.0';
const AUTO_PROMOTE_CONFIDENCE = 0.85;
const REVIEW_THRESHOLD_CONFIDENCE = 0.70;
const MIN_OCCURRENCES_FOR_PROMOTION = 3;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  
  console.log(`🚀 [Apply FN v${VERSION}] Starting auto-promotion cycle...`);

  try {
    const supabase = createAdminClient();
    
    // =========================================================================
    // STEP 1: Find high-confidence suggestions ready for promotion
    // =========================================================================
    const { data: suggestions, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('category', 'functie_niveau_mapping_suggestion')
      .gte('confidence_score', AUTO_PROMOTE_CONFIDENCE)
      .gte('occurrence_count', MIN_OCCURRENCES_FOR_PROMOTION)
      .is('deleted_at', null);
    
    if (fetchError) {
      throw new Error(`Failed to fetch suggestions: ${fetchError.message}`);
    }
    
    console.log(`📊 [Apply FN] Found ${suggestions?.length || 0} eligible suggestions for promotion`);
    
    let promoted = 0;
    let failed = 0;
    
    for (const suggestion of suggestions || []) {
      const value = suggestion.value as any;
      const rawValue = value?.raw_value;
      const targetMapping = value?.suggested_mapping;
      
      if (!rawValue || !targetMapping) {
        console.warn(`⚠️ [Apply FN] Skipping invalid suggestion ${suggestion.id}`);
        failed++;
        continue;
      }
      
      // Generate key for learned mapping
      const learnedKey = `fn_learned_${rawValue.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
      
      // Check if already learned
      const { data: existingLearned } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('category', 'functie_niveau_mapping_learned')
        .eq('key', learnedKey)
        .is('deleted_at', null)
        .maybeSingle();
      
      if (existingLearned) {
        console.log(`⏭️ [Apply FN] "${rawValue}" already learned, skipping`);
        
        // Soft-delete the redundant suggestion
        await supabase
          .from('ai_knowledge_base')
          .update({ 
            deleted_at: new Date().toISOString(),
            deletion_reason: { reason: 'already_learned', learned_id: existingLearned.id },
          })
          .eq('id', suggestion.id);
        
        continue;
      }
      
      // Create learned mapping
      const { error: insertError } = await supabase.from('ai_knowledge_base').insert({
        category: 'functie_niveau_mapping_learned',
        key: learnedKey,
        value: {
          raw_value: rawValue,
          target: targetMapping,
          learned_at: new Date().toISOString(),
          source: 'auto_promoted',
          original_suggestion_id: suggestion.id,
          original_confidence: suggestion.confidence_score,
          original_occurrences: suggestion.occurrence_count,
          similarity_score: value.similarity_score,
        },
        confidence_score: suggestion.confidence_score,
        occurrence_count: suggestion.occurrence_count,
        org_id: suggestion.org_id || ORG_IDS.CITOZORG,
        source: 'auto_learned',
        source_type: 'ai_pattern_promotion',
        needs_review: false,
      });
      
      if (insertError) {
        console.error(`❌ [Apply FN] Failed to create learned mapping for "${rawValue}":`, insertError);
        failed++;
        continue;
      }
      
      // Soft-delete the suggestion (successfully promoted)
      await supabase
        .from('ai_knowledge_base')
        .update({ 
          deleted_at: new Date().toISOString(),
          deletion_reason: { reason: 'promoted_to_learned', promoted_at: new Date().toISOString() },
        })
        .eq('id', suggestion.id);
      
      promoted++;
      console.log(`✅ [Apply FN] Promoted: "${rawValue}" → "${targetMapping}" (confidence: ${(suggestion.confidence_score * 100).toFixed(1)}%)`);
    }
    
    // =========================================================================
    // STEP 2: Flag medium-confidence suggestions for review
    // =========================================================================
    const { data: reviewCandidates } = await supabase
      .from('ai_knowledge_base')
      .select('id, value')
      .eq('category', 'functie_niveau_mapping_suggestion')
      .gte('confidence_score', REVIEW_THRESHOLD_CONFIDENCE)
      .lt('confidence_score', AUTO_PROMOTE_CONFIDENCE)
      .eq('needs_review', false)
      .is('deleted_at', null);
    
    let flaggedForReview = 0;
    
    if (reviewCandidates && reviewCandidates.length > 0) {
      const { error: flagError } = await supabase
        .from('ai_knowledge_base')
        .update({ needs_review: true })
        .in('id', reviewCandidates.map(r => r.id));
      
      if (!flagError) {
        flaggedForReview = reviewCandidates.length;
        console.log(`🔍 [Apply FN] Flagged ${flaggedForReview} suggestions for manual review`);
      }
    }
    
    // =========================================================================
    // STEP 3: Get statistics for dashboard
    // =========================================================================
    const { count: totalLearned } = await supabase
      .from('ai_knowledge_base')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'functie_niveau_mapping_learned')
      .is('deleted_at', null);
    
    const { count: pendingReview } = await supabase
      .from('ai_knowledge_base')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'functie_niveau_mapping_suggestion')
      .eq('needs_review', true)
      .is('deleted_at', null);
    
    const duration = Date.now() - startTime;
    
    // =========================================================================
    // STEP 4: Log function execution
    // =========================================================================
    await supabase.from('function_call_logs').insert({
      function_name: 'apply-learned-functie-niveau',
      duration_ms: duration,
      success: true,
      metadata: {
        version: VERSION,
        suggestions_evaluated: suggestions?.length || 0,
        promoted,
        failed,
        flagged_for_review: flaggedForReview,
        total_learned_mappings: totalLearned,
        pending_review: pendingReview,
      },
    });
    
    console.log(`🏁 [Apply FN v${VERSION}] Complete in ${duration}ms: ${promoted} promoted, ${failed} failed, ${flaggedForReview} flagged`);
    
    return jsonResponse({
      success: true,
      version: VERSION,
      duration_ms: duration,
      promoted,
      failed,
      flagged_for_review: flaggedForReview,
      stats: {
        total_learned_mappings: totalLearned,
        pending_review: pendingReview,
      },
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [Apply FN v${VERSION}] Error:`, error);
    
    // Log failure
    try {
      const supabase = createAdminClient();
      await supabase.from('function_call_logs').insert({
        function_name: 'apply-learned-functie-niveau',
        duration_ms: duration,
        success: false,
        error_message: error instanceof Error ? error.message : String(error),
        metadata: { version: VERSION },
      });
    } catch (logError) {
      console.error('[Apply FN] Failed to log error:', logError);
    }
    
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
