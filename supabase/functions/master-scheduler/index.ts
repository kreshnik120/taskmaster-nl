import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Active scheduled functions (7 schedules for 5 learning loops + 2 support)
const SCHEDULES = {
  'smart-deduplicator': '30 * * * *',           // Every hour at :30 (Learning Loop 5)
  'data-quality-auditor': '20 * * * *',         // Every hour at :20 (Learning Loop 4)
  // 'source-validator': '35 * * * *',          // ❌ REMOVED: Redundant (web validation now in continuous-learner)
  'knowledge-graph-builder': '15 * * * *',      // Every hour at :15 (Learning Loop 3)
  'tariff-analyzer': '45 * * * *',              // Every hour at :45 (Support)
  'feedback-processor': '*/5 * * * *',          // Every 5 minutes (Learning Loop 2)
  'process-pending-jobs': '*/1 * * * *',        // Every minute (Background Job Queue)
  // Note: continuous-learner (Loop 1) runs via database trigger, not scheduler
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const now = new Date();
  
  console.log('🕐 Master Scheduler triggered at:', now.toISOString());

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find functions that should run now
    const functionsToTrigger: string[] = [];
    
    for (const [functionName, cronExpr] of Object.entries(SCHEDULES)) {
      if (matchesCron(cronExpr, now)) {
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
