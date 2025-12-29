// Cleanup Fast Path Patterns - Handles decay, disabling, and removal of underperforming patterns
// 🆕 UPGRADED: Stricter thresholds, consecutive error tracking, response time monitoring
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = body.org_id ?? '550e8400-e29b-41d4-a716-446655440000';
    
    // 🆕 VERSCHERPTE THRESHOLDS (was: 30 dagen, 0.30 min, 0.50 error rate)
    const inactivityDays = body.inactivity_days ?? 21;       // Was 30
    const decayRate = body.decay_rate ?? 0.12;               // Was 0.10 (12% decay per cleanup)
    const minConfidence = body.min_confidence ?? 0.50;       // Was 0.30
    const maxErrorRate = body.max_error_rate ?? 0.30;        // Was 0.50
    const maxResponseTimeMs = body.max_response_time_ms ?? 1000; // 🆕 Nieuw: slow pattern detection
    const consecutiveErrorLimit = body.consecutive_error_limit ?? 3; // 🆕 Nieuw: immediate deactivation
    
    console.log(`🧹 [CLEANUP FAST PATH] Starting cleanup for org ${orgId}...`);
    
    const supabase = createAdminClient();
    
    const stats = {
      decayed: 0,
      disabled: 0,
      softDeleted: 0,
      merged: 0,
      reactivated: 0,
      slowDisabled: 0,           // 🆕 Slow patterns disabled
      consecutiveErrorsDisabled: 0 // 🆕 Patterns with consecutive errors
    };
    
    // 1. TEMPORAL DECAY: Patterns not used in X days get confidence reduction
    const inactivityThreshold = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: inactivePatterns, error: inactiveError } = await supabase
      .from('fast_path_patterns')
      .select('id, confidence_score, last_used_at, usage_count')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .or(`last_used_at.is.null,last_used_at.lt.${inactivityThreshold}`)
      .gt('confidence_score', minConfidence);
    
    if (inactiveError) {
      console.error('❌ Failed to fetch inactive patterns:', inactiveError);
    } else {
      for (const pattern of inactivePatterns || []) {
        const newConfidence = Math.max(minConfidence, pattern.confidence_score - decayRate);
        const shouldDisable = newConfidence < 0.85;
        
        await supabase
          .from('fast_path_patterns')
          .update({
            confidence_score: newConfidence,
            is_active: !shouldDisable && pattern.confidence_score >= 0.85,
            updated_at: new Date().toISOString()
          })
          .eq('id', pattern.id);
        
        stats.decayed++;
        console.log(`📉 Decayed pattern ${pattern.id}: ${pattern.confidence_score.toFixed(2)} → ${newConfidence.toFixed(2)}`);
      }
    }
    
    // 2. 🆕 DISABLE SLOW PATTERNS: avg_response_time > threshold
    const { data: slowPatterns, error: slowError } = await supabase
      .from('fast_path_patterns')
      .select('id, avg_response_time_ms, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .gt('avg_response_time_ms', maxResponseTimeMs)
      .is('deleted_at', null);
    
    if (slowError) {
      console.error('❌ Failed to fetch slow patterns:', slowError);
    } else {
      for (const pattern of slowPatterns || []) {
        await supabase
          .from('fast_path_patterns')
          .update({
            is_active: false,
            deactivation_reason: `Disabled due to slow response time: ${pattern.avg_response_time_ms}ms (>${maxResponseTimeMs}ms)`,
            deactivated_at: new Date().toISOString(),
            auto_reactivation_eligible: true, // Can reactivate if performance improves
            updated_at: new Date().toISOString()
          })
          .eq('id', pattern.id);
        
        stats.slowDisabled++;
        console.log(`🐢 Disabled slow pattern ${pattern.id}: ${pattern.avg_response_time_ms}ms`);
      }
    }
    
    // 3. 🆕 DISABLE CONSECUTIVE ERRORS: Patterns with X consecutive errors
    const { data: errorStreakPatterns, error: errorStreakError } = await supabase
      .from('fast_path_patterns')
      .select('id, consecutive_errors, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .gte('consecutive_errors', consecutiveErrorLimit)
      .is('deleted_at', null);
    
    if (errorStreakError) {
      console.error('❌ Failed to fetch error streak patterns:', errorStreakError);
    } else {
      for (const pattern of errorStreakPatterns || []) {
        await supabase
          .from('fast_path_patterns')
          .update({
            is_active: false,
            deactivation_reason: `Disabled due to ${pattern.consecutive_errors} consecutive errors`,
            deactivated_at: new Date().toISOString(),
            auto_reactivation_eligible: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', pattern.id);
        
        stats.consecutiveErrorsDisabled++;
        console.log(`❌ Disabled pattern ${pattern.id} due to ${pattern.consecutive_errors} consecutive errors`);
      }
    }
    
    // 4. DISABLE HIGH ERROR RATE: Patterns with error rate > threshold (was step 2)
    const { data: errorPronePatterns, error: errorPatternsError } = await supabase
      .from('fast_path_patterns')
      .select('id, success_count, error_count, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .is('deleted_at', null);
    
    if (errorPatternsError) {
      console.error('❌ Failed to fetch error-prone patterns:', errorPatternsError);
    } else {
      for (const pattern of errorPronePatterns || []) {
        const totalAttempts = (pattern.success_count || 0) + (pattern.error_count || 0);
        if (totalAttempts < 5) continue; // Need enough data
        
        const errorRate = pattern.error_count / totalAttempts;
        if (errorRate > maxErrorRate) {
          await supabase
            .from('fast_path_patterns')
            .update({
              is_active: false,
              deactivation_reason: `Disabled due to high error rate: ${(errorRate * 100).toFixed(1)}% (>${(maxErrorRate * 100)}%)`,
              deactivated_at: new Date().toISOString(),
              auto_reactivation_eligible: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', pattern.id);
          
          stats.disabled++;
          console.log(`🚫 Disabled pattern ${pattern.id} due to ${(errorRate * 100).toFixed(1)}% error rate`);
        }
      }
    }
    
    // 5. SOFT DELETE: Patterns with harmful > helpful + 3 (was +5)
    const { data: harmfulPatterns, error: harmfulError } = await supabase
      .from('fast_path_patterns')
      .select('id, helpful_count, harmful_count')
      .eq('org_id', orgId)
      .is('deleted_at', null);
    
    if (harmfulError) {
      console.error('❌ Failed to fetch harmful patterns:', harmfulError);
    } else {
      for (const pattern of harmfulPatterns || []) {
        // 🆕 Stricter threshold: harmful > helpful + 3 (was +5)
        if ((pattern.harmful_count || 0) > (pattern.helpful_count || 0) + 3) {
          await supabase
            .from('fast_path_patterns')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_reason: `Too much harmful feedback: ${pattern.harmful_count} harmful vs ${pattern.helpful_count} helpful`,
              is_active: false,
              auto_reactivation_eligible: false // 🆕 Cannot auto-reactivate harmful patterns
            })
            .eq('id', pattern.id);
          
          stats.softDeleted++;
          console.log(`🗑️ Soft-deleted pattern ${pattern.id} due to harmful feedback`);
        }
      }
    }
    
    // 6. SOFT DELETE: Patterns with confidence < min_confidence (was step 4)
    const { data: lowConfidencePatterns, error: lowConfError } = await supabase
      .from('fast_path_patterns')
      .select('id, confidence_score')
      .eq('org_id', orgId)
      .lt('confidence_score', minConfidence)
      .is('deleted_at', null);
    
    if (lowConfError) {
      console.error('❌ Failed to fetch low confidence patterns:', lowConfError);
    } else {
      for (const pattern of lowConfidencePatterns || []) {
        await supabase
          .from('fast_path_patterns')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_reason: `Confidence dropped below threshold: ${pattern.confidence_score.toFixed(2)} < ${minConfidence}`,
            is_active: false,
            auto_reactivation_eligible: false // Cannot reactivate low confidence patterns
          })
          .eq('id', pattern.id);
        
        stats.softDeleted++;
        console.log(`🗑️ Soft-deleted pattern ${pattern.id} due to low confidence (${pattern.confidence_score.toFixed(2)})`);
      }
    }
    
    // 7. REACTIVATION CHECK: Patterns that have recovered (only if auto_reactivation_eligible)
    const { data: recoveredPatterns, error: recoveredError } = await supabase
      .from('fast_path_patterns')
      .select('id, confidence_score, success_count, error_count, consecutive_errors, avg_response_time_ms, auto_reactivation_eligible')
      .eq('org_id', orgId)
      .eq('is_active', false)
      .eq('auto_reactivation_eligible', true) // 🆕 Only check eligible patterns
      .gte('confidence_score', 0.85)
      .is('deleted_at', null);
    
    if (recoveredError) {
      console.error('❌ Failed to fetch recovered patterns:', recoveredError);
    } else {
      for (const pattern of recoveredPatterns || []) {
        const totalAttempts = (pattern.success_count || 0) + (pattern.error_count || 0);
        if (totalAttempts < 3) continue;
        
        const errorRate = (pattern.error_count || 0) / totalAttempts;
        const hasAcceptableErrors = errorRate <= maxErrorRate;
        const hasNoConsecutiveErrors = (pattern.consecutive_errors || 0) < consecutiveErrorLimit;
        const hasAcceptableSpeed = (pattern.avg_response_time_ms || 0) <= maxResponseTimeMs;
        
        // 🆕 All conditions must be met for reactivation
        if (hasAcceptableErrors && hasNoConsecutiveErrors && hasAcceptableSpeed) {
          await supabase
            .from('fast_path_patterns')
            .update({
              is_active: true,
              deactivation_reason: null,
              deactivated_at: null,
              consecutive_errors: 0, // Reset error counter
              updated_at: new Date().toISOString()
            })
            .eq('id', pattern.id);
          
          stats.reactivated++;
          console.log(`🔄 Reactivated pattern ${pattern.id} (confidence: ${pattern.confidence_score.toFixed(2)}, error rate: ${(errorRate * 100).toFixed(1)}%)`);
        }
      }
    }
    
    // 8. MERGE DUPLICATES: Find patterns with similar keywords and merge to highest confidence
    const { data: allPatterns, error: allError } = await supabase
      .from('fast_path_patterns')
      .select('id, keywords, table_name, confidence_score, usage_count')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false });
    
    if (allError) {
      console.error('❌ Failed to fetch all patterns:', allError);
    } else {
      const processed = new Set<string>();
      
      for (const pattern of allPatterns || []) {
        if (processed.has(pattern.id)) continue;
        
        // Find similar patterns (same table, overlapping keywords)
        const similar = (allPatterns || []).filter(p => 
          p.id !== pattern.id &&
          !processed.has(p.id) &&
          p.table_name === pattern.table_name &&
          pattern.keywords.filter((k: string) => p.keywords.includes(k)).length >= 2
        );
        
        if (similar.length > 0) {
          // Merge into the highest confidence pattern (which is this one due to ordering)
          for (const dup of similar) {
            processed.add(dup.id);
            
            // Transfer usage counts
            await supabase
              .from('fast_path_patterns')
              .update({
                usage_count: pattern.usage_count + dup.usage_count,
                updated_at: new Date().toISOString()
              })
              .eq('id', pattern.id);
            
            // Soft-delete the duplicate
            await supabase
              .from('fast_path_patterns')
              .update({
                deleted_at: new Date().toISOString(),
                deleted_reason: `Merged into pattern ${pattern.id}`,
                is_active: false
              })
              .eq('id', dup.id);
            
            stats.merged++;
            console.log(`🔗 Merged pattern ${dup.id} into ${pattern.id}`);
          }
        }
        
        processed.add(pattern.id);
      }
    }
    
    // 9. Cleanup old usage logs (keep last 30 days)
    const logRetentionDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: deletedLogData, error: deleteLogError } = await supabase
      .from('fast_path_usage_log')
      .delete()
      .eq('org_id', orgId)
      .lt('created_at', logRetentionDate)
      .select('id');
    
    const deletedLogs = deletedLogData?.length || 0;
    
    console.log(`🧹 Deleted ${deletedLogs || 0} old usage logs`);
    
    const duration = Date.now() - startTime;
    
    // Log the run
    await supabase
      .from('function_call_logs')
      .insert({
        function_name: 'cleanup-fast-path-patterns',
        duration_ms: duration,
        success: true,
        metadata: {
          org_id: orgId,
          ...stats,
          deleted_logs: deletedLogs || 0
        }
      });
    
    console.log(`✅ Cleanup complete in ${duration}ms:`, stats);
    
    return jsonResponse({
      success: true,
      duration_ms: duration,
      stats,
      deleted_logs: deletedLogs || 0
    });
    
  } catch (error) {
    console.error('❌ Cleanup Fast Path error:', error);
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
});
