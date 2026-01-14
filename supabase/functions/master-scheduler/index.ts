// Master Scheduler - central cron job orchestration
// Version 2.5.0 - Werkvorm AI Learning Loop
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

const VERSION = '2.5.0-enterprise';

// Active scheduled functions (19 schedules - added werkvorm learning)
const SCHEDULES = {
  // CRITICAL: Process system events for professional creation chain
  'process-system-events': '*/5 * * * *',       // Every 5 minutes (Recruitment events & professional creation)
  'auto-resolve-alerts': '*/30 * * * *',        // Every 30 minutes (ACE Alert Resolution)
  'smart-deduplicator': '30 * * * *',           // Every hour at :30 (Learning Loop 5)
  'data-quality-auditor': '20 * * * *',         // Every hour at :20 (Learning Loop 4)
  'knowledge-graph-builder': '15 * * * *',      // Every hour at :15 (Learning Loop 3)
  'process-pending-jobs': '*/1 * * * *',        // Every minute (Background Job Queue)
  // Phase 2: Self-Learning Reinforcement
  'apply-meta-patterns': '0 */6 * * *',         // Every 6 hours (Meta-pattern application)
  'temporal-decay': '0 3 * * *',                // Daily at 03:00 (Temporal decay for stale knowledge)
  // Self-Learning Fast Path with Pattern Optimization
  'pattern-health-monitor': '*/15 * * * *',     // Every 15 minutes (Real-time health detection)
  'learn-fast-path-patterns': '0 5 * * *',      // Daily at 05:00 (Learn new patterns from usage)
  'cleanup-fast-path-patterns': '0 */4 * * *',  // Every 4 hours (Stricter cleanup cycle)
  // Document & Orchestrator Cleanup
  'cleanup-orphan-documents': '30 6 * * *',     // Daily at 06:30 (Cleanup orphan document references)
  'cleanup-orchestrator-state': '45 6 * * *',   // Daily at 06:45 (Cleanup stale orchestrator records)
  // Diploma Re-Verification (signature_valid → verified_duo)
  'reverify-diploma-signatures': '0 1 * * 0',   // Weekly Sunday 01:00 (Re-verify signature_valid diplomas)
  // Security Penetration Testing
  'webhook-security-tester': '0 2 * * *',       // Daily at 02:00 UTC (Automated security scan)
  // Cache Management
  'cache-warmer': '0 */2 * * *',                // Every 2 hours (Refresh expiring cache entries)
  // Functie Niveau AI Learning
  'learn-functie-niveau-patterns': '0 4 * * *', // Daily at 04:00 UTC (Learn from unknown values)
  'apply-learned-functie-niveau': '15 4 * * *', // Daily at 04:15 UTC (Promote high-confidence suggestions)
  // Werkvorm AI Learning (NEW in v2.5.0)
  'learn-werkvorm-patterns': '30 4 * * *',      // Daily at 04:30 UTC (Learn from unknown werkvormen)
  'apply-learned-werkvorm': '45 4 * * *',       // Daily at 04:45 UTC (Promote high-confidence werkvorm suggestions)
  // Unified Learner - Central AI Learning Engine (consolidates learning functions)
  'unified-learner': '*/30 * * * *',            // Every 30 minutes (Retroactive scan + batch feedback)
};

// Simple cron expression matcher (minute hour dayOfMonth month dayOfWeek)
function matchesCron(cronExpr: string, now: Date): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpr.split(' ');
  
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentDayOfWeek = now.getDay();
  
  // Check minute
  if (minute !== '*') {
    if (minute.includes('/')) {
      const [, interval] = minute.split('/');
      if (currentMinute % parseInt(interval) !== 0) return false;
    } else if (parseInt(minute) !== currentMinute) {
      return false;
    }
  }
  
  // Check hour
  if (hour !== '*') {
    if (hour.includes('/')) {
      const [, interval] = hour.split('/');
      if (currentHour % parseInt(interval) !== 0) return false;
    } else if (parseInt(hour) !== currentHour) {
      return false;
    }
  }
  
  // Check day of month
  if (dayOfMonth !== '*' && parseInt(dayOfMonth) !== currentDay) {
    return false;
  }
  
  // Check month
  if (month !== '*' && parseInt(month) !== currentMonth) {
    return false;
  }
  
  // Check day of week
  if (dayOfWeek !== '*' && parseInt(dayOfWeek) !== currentDayOfWeek) {
    return false;
  }
  
  return true;
}

/**
 * Enhanced cron matcher with grace period for catching jobs that might be missed
 * due to scheduler timing. Checks if cron expression matches any minute in the 
 * past `graceMinutes` window.
 * 
 * This prevents daily/hourly jobs from being missed when scheduler runs at :00, :05, etc.
 * and cron is scheduled for e.g. :01 or :03.
 */
function matchesCronWithGrace(cronExpr: string, now: Date, graceMinutes: number = 5): boolean {
  // First check exact match (most common case)
  if (matchesCron(cronExpr, now)) return true;
  
  // Check previous minutes within grace window
  for (let i = 1; i <= graceMinutes; i++) {
    const checkTime = new Date(now.getTime() - i * 60000);
    if (matchesCron(cronExpr, checkTime)) return true;
  }
  
  return false;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  const now = new Date();
  
  console.log(`🕐 Master Scheduler v${VERSION} triggered at:`, now.toISOString());

  try {
    const supabase = createAdminClient();

    // Find functions that should run now (with 5-minute grace period to catch missed jobs)
    const functionsToTrigger: string[] = [];
    
    for (const [functionName, cronExpr] of Object.entries(SCHEDULES)) {
      if (matchesCronWithGrace(cronExpr, now, 5)) {
        functionsToTrigger.push(functionName);
      }
    }

    console.log(`📋 Functions to trigger (${functionsToTrigger.length}):`, functionsToTrigger);

    // Trigger functions in background (fire-and-forget)
    const triggerTimestamp = now.toISOString();

    if (functionsToTrigger.length > 0) {
      console.log(`🚀 Triggering ${functionsToTrigger.length} functions in background...`);
      
      // Fire-and-forget: trigger all functions without blocking
      functionsToTrigger.forEach(async (fnName) => {
        const fnStartTime = Date.now();
        
        try {
          console.log(`⏳ [Background] Starting ${fnName}...`);
          
          const { data, error } = await supabase.functions.invoke(fnName, {
            body: { trigger: 'scheduler', timestamp: triggerTimestamp }
          });
          
          const fnDuration = Date.now() - fnStartTime;
          
          if (error) {
            console.error(`❌ [Background] ${fnName} failed after ${fnDuration}ms:`, error);
          } else {
            console.log(`✅ [Background] ${fnName} completed in ${fnDuration}ms`);
          }
        } catch (err) {
          const fnDuration = Date.now() - fnStartTime;
          console.error(`❌ [Background] ${fnName} exception after ${fnDuration}ms:`, err);
        }
      });
      
      console.log(`✅ Dispatched ${functionsToTrigger.length} functions`);
    }

    const schedulerDuration = Date.now() - startTime;

    // Log trigger event to database (not results, as they're async)
    try {
      await supabase
        .from('scheduler_runs')
        .insert({
          run_at: triggerTimestamp,
          triggered_functions: functionsToTrigger,
          results: { status: 'dispatched', note: 'Functions triggered asynchronously' },
          duration_ms: schedulerDuration,
          org_id: '550e8400-e29b-41d4-a716-446655440000'
        });
    } catch (logErr) {
      console.error('❌ Failed to log scheduler run:', logErr);
    }

    // Note: Scheduling is handled by pg_cron (runs every 5 minutes)
    // See migration: fix_master_scheduler_cron.sql

    // Return immediate response (scheduler overhead only, not function execution)
    return new Response(
      JSON.stringify({
        success: true,
        timestamp: triggerTimestamp,
        triggered_count: functionsToTrigger.length,
        triggered_functions: functionsToTrigger,
        scheduler_duration_ms: schedulerDuration,
        status: 'background_tasks_running',
        message: `Triggered ${functionsToTrigger.length} functions in background. Results will be logged to scheduler_runs table.`,
        next_run_in_ms: 5 * 60 * 1000
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Master Scheduler error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: now.toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
