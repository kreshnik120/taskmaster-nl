// Pattern Health Monitor - Real-time detection of underperforming Fast Path patterns
// Runs every 15 minutes via master-scheduler
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

interface PatternHealthMetrics {
  id: string;
  keywords: string[];
  health_score: number;
  issues: string[];
  metrics: {
    usage_count: number;
    success_count: number;
    error_count: number;
    consecutive_errors: number;
    helpful_count: number;
    harmful_count: number;
    avg_response_time_ms: number;
    confidence_score: number;
    days_since_used: number;
  };
}

interface HealthCheckResult {
  slow_patterns: PatternHealthMetrics[];
  error_prone: PatternHealthMetrics[];
  harmful: PatternHealthMetrics[];
  stale: PatternHealthMetrics[];
  healthy: number;
  total_checked: number;
  actions_taken: {
    deactivated: string[];
    alerted: string[];
  };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = body.org_id ?? '550e8400-e29b-41d4-a716-446655440000';
    
    // Configurable thresholds
    const config = {
      slowThresholdMs: body.slow_threshold_ms ?? 500,       // Patterns above this are flagged
      criticalSlowMs: body.critical_slow_ms ?? 1000,        // Patterns above this are deactivated
      errorRateThreshold: body.error_rate_threshold ?? 0.20, // 20% error rate flag
      criticalErrorRate: body.critical_error_rate ?? 0.30,   // 30% error rate deactivate
      staleDays: body.stale_days ?? 14,                      // Unused for 14 days
      minUsageForAnalysis: body.min_usage ?? 5,              // Need 5+ uses for metrics
      consecutiveErrorLimit: body.consecutive_error_limit ?? 3
    };

    console.log(`🏥 [PATTERN HEALTH MONITOR] Starting health check for org ${orgId}...`);
    
    const supabase = createAdminClient();

    // Fetch all active patterns with metrics
    const { data: patterns, error: fetchError } = await supabase
      .from('fast_path_patterns')
      .select('id, keywords, table_name, confidence_score, usage_count, success_count, error_count, consecutive_errors, helpful_count, harmful_count, avg_response_time_ms, last_used_at, is_active')
      .eq('org_id', orgId)
      .is('deleted_at', null);

    if (fetchError) {
      console.error('❌ Failed to fetch patterns:', fetchError);
      return errorResponse(fetchError.message);
    }

    const result: HealthCheckResult = {
      slow_patterns: [],
      error_prone: [],
      harmful: [],
      stale: [],
      healthy: 0,
      total_checked: patterns?.length || 0,
      actions_taken: {
        deactivated: [],
        alerted: []
      }
    };

    const now = Date.now();

    for (const pattern of patterns || []) {
      const metrics = {
        usage_count: pattern.usage_count || 0,
        success_count: pattern.success_count || 0,
        error_count: pattern.error_count || 0,
        consecutive_errors: pattern.consecutive_errors || 0,
        helpful_count: pattern.helpful_count || 0,
        harmful_count: pattern.harmful_count || 0,
        avg_response_time_ms: pattern.avg_response_time_ms || 0,
        confidence_score: pattern.confidence_score || 0,
        days_since_used: pattern.last_used_at 
          ? Math.floor((now - new Date(pattern.last_used_at).getTime()) / (1000 * 60 * 60 * 24))
          : 999
      };

      const issues: string[] = [];
      let healthScore = 100;

      // 1. SLOW RESPONSE CHECK
      if (metrics.avg_response_time_ms > config.criticalSlowMs) {
        issues.push(`Critical slow: ${metrics.avg_response_time_ms}ms (>${config.criticalSlowMs}ms)`);
        healthScore -= 40;
      } else if (metrics.avg_response_time_ms > config.slowThresholdMs) {
        issues.push(`Slow: ${metrics.avg_response_time_ms}ms (>${config.slowThresholdMs}ms)`);
        healthScore -= 20;
      }

      // 2. ERROR RATE CHECK (only if enough usage data)
      const totalAttempts = metrics.success_count + metrics.error_count;
      if (totalAttempts >= config.minUsageForAnalysis) {
        const errorRate = metrics.error_count / totalAttempts;
        
        if (errorRate >= config.criticalErrorRate) {
          issues.push(`Critical error rate: ${(errorRate * 100).toFixed(1)}% (>=${(config.criticalErrorRate * 100)}%)`);
          healthScore -= 40;
        } else if (errorRate >= config.errorRateThreshold) {
          issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}% (>=${(config.errorRateThreshold * 100)}%)`);
          healthScore -= 20;
        }
      }

      // 3. CONSECUTIVE ERRORS CHECK
      if (metrics.consecutive_errors >= config.consecutiveErrorLimit) {
        issues.push(`${metrics.consecutive_errors} consecutive errors`);
        healthScore -= 30;
      }

      // 4. HARMFUL FEEDBACK CHECK
      if (metrics.harmful_count > metrics.helpful_count) {
        const harmfulRatio = metrics.harmful_count / Math.max(1, metrics.helpful_count);
        issues.push(`Harmful feedback: ${metrics.harmful_count} harmful vs ${metrics.helpful_count} helpful (ratio: ${harmfulRatio.toFixed(1)}x)`);
        healthScore -= Math.min(40, harmfulRatio * 10);
      }

      // 5. STALE PATTERN CHECK
      if (metrics.days_since_used >= config.staleDays) {
        issues.push(`Stale: unused for ${metrics.days_since_used} days`);
        healthScore -= 15;
      }

      // 6. LOW CONFIDENCE CHECK
      if (metrics.confidence_score < 0.50) {
        issues.push(`Low confidence: ${(metrics.confidence_score * 100).toFixed(0)}%`);
        healthScore -= 20;
      }

      healthScore = Math.max(0, healthScore);

      const patternHealth: PatternHealthMetrics = {
        id: pattern.id,
        keywords: pattern.keywords || [],
        health_score: healthScore,
        issues,
        metrics
      };

      // Categorize by issue type
      if (metrics.avg_response_time_ms > config.slowThresholdMs) {
        result.slow_patterns.push(patternHealth);
      }
      if (totalAttempts >= config.minUsageForAnalysis && metrics.error_count / totalAttempts >= config.errorRateThreshold) {
        result.error_prone.push(patternHealth);
      }
      if (metrics.harmful_count > metrics.helpful_count) {
        result.harmful.push(patternHealth);
      }
      if (metrics.days_since_used >= config.staleDays) {
        result.stale.push(patternHealth);
      }

      // AUTO-DEACTIVATION for critical issues (only if pattern is active)
      if (pattern.is_active && healthScore < 30) {
        const deactivationReason = `Auto-deactivated: health score ${healthScore}%. Issues: ${issues.join(', ')}`;
        
        await supabase
          .from('fast_path_patterns')
          .update({
            is_active: false,
            deactivation_reason: deactivationReason,
            deactivated_at: new Date().toISOString(),
            auto_reactivation_eligible: healthScore > 10, // Allow reactivation if not completely broken
            updated_at: new Date().toISOString()
          })
          .eq('id', pattern.id);

        result.actions_taken.deactivated.push(pattern.id);
        console.log(`🚫 Auto-deactivated pattern ${pattern.id}: ${deactivationReason}`);
      }

      // ALERT for concerning patterns (health 30-60)
      if (healthScore >= 30 && healthScore < 60 && issues.length > 0) {
        // Check if alert already exists for this pattern
        const { data: existingAlert } = await supabase
          .from('business_intelligence')
          .select('id')
          .eq('org_id', orgId)
          .eq('intelligence_type', 'fast_path_degradation')
          .ilike('title', `%${pattern.id.substring(0, 8)}%`)
          .eq('status', 'pending')
          .single();

        if (!existingAlert) {
          await supabase.from('business_intelligence').insert({
            org_id: orgId,
            intelligence_type: 'fast_path_degradation',
            title: `Pattern performance issue (${pattern.id.substring(0, 8)}...)`,
            description: `Health score: ${healthScore}%. Issues: ${issues.join(', ')}`,
            data: {
              pattern_id: pattern.id,
              keywords: pattern.keywords,
              health_score: healthScore,
              metrics,
              issues
            },
            priority: healthScore < 40 ? 'high' : 'medium',
            impact_score: (100 - healthScore) / 100,
            status: 'pending'
          });

          result.actions_taken.alerted.push(pattern.id);
          console.log(`⚠️ Alert created for pattern ${pattern.id}: health ${healthScore}%`);
        }
      }

      // Count healthy patterns
      if (issues.length === 0) {
        result.healthy++;
      }
    }

    const duration = Date.now() - startTime;

    // Log the run
    await supabase
      .from('function_call_logs')
      .insert({
        function_name: 'pattern-health-monitor',
        org_id: orgId,
        execution_time_ms: duration,
        success: true,
        metadata: {
          total_checked: result.total_checked,
          healthy: result.healthy,
          slow_count: result.slow_patterns.length,
          error_prone_count: result.error_prone.length,
          harmful_count: result.harmful.length,
          stale_count: result.stale.length,
          deactivated: result.actions_taken.deactivated.length,
          alerted: result.actions_taken.alerted.length
        }
      });

    console.log(`✅ [PATTERN HEALTH MONITOR] Complete in ${duration}ms: ${result.healthy}/${result.total_checked} healthy, ${result.actions_taken.deactivated.length} deactivated, ${result.actions_taken.alerted.length} alerted`);

    return jsonResponse({
      success: true,
      duration_ms: duration,
      result
    });

  } catch (error) {
    console.error('❌ Pattern Health Monitor error:', error);
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
});
