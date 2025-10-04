import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schedule map: all 22 edge functions with their cron expressions
const SCHEDULES = {
  'compliance-monitor': '25 * * * *',           // Every hour at :25
  'smart-deduplicator': '30 * * * *',           // Every hour at :30
  'category-classifier': '0 3 * * *',           // Daily at 03:00
  'data-quality-auditor': '20 * * * *',         // Every hour at :20
  'source-validator': '35 * * * *',             // Every hour at :35
  'client-communication-coach': '55 * * * *',   // Every hour at :55
  'mega-forecast-generator': '50 * * * *',      // Every hour at :50
  'professional-enricher': '55 */8 * * *',      // Every 8 hours at :55
  'knowledge-graph-builder': '15 * * * *',      // Every hour at :15
  'auto-knowledge-harvester': '5 * * * *',      // Every hour at :05
  'self-trainer': '10 * * * *',                 // Every hour at :10
  'prioritizer': '18 */6 * * *',                // Every 6 hours at :18
  'ai-task-scorer': '0 */12 * * *',             // Every 12 hours at :00
  'review-knowledge': '0 2 * * 0',              // Weekly Sunday 02:00
  'tariff-analyzer': '45 * * * *',              // Every hour at :45
  'professional-matcher': '40 * * * *',         // Every hour at :40
  'planning-optimizer': '0 */12 * * *',         // Every 12 hours at :00
  'client-intelligence': '45 */8 * * *',        // Every 8 hours at :45
  'compliance-extractor': '10 */4 * * *',       // Every 4 hours at :10
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

    // Trigger functions in parallel
    const results: Record<string, any> = {};
    
    if (functionsToTrigger.length > 0) {
      const invokePromises = functionsToTrigger.map(async (fnName) => {
        try {
          console.log(`🚀 Invoking ${fnName}...`);
          const { data, error } = await supabase.functions.invoke(fnName, {
            body: { trigger: 'scheduler', timestamp: now.toISOString() }
          });
          
          if (error) {
            console.error(`❌ ${fnName} failed:`, error);
            results[fnName] = { success: false, error: error.message };
          } else {
            console.log(`✅ ${fnName} completed`);
            results[fnName] = { success: true, data };
          }
        } catch (err) {
          console.error(`❌ ${fnName} exception:`, err);
          results[fnName] = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      });

      await Promise.allSettled(invokePromises);
    }

    const duration = Date.now() - startTime;

    // Log to database
    const { error: logError } = await supabase
      .from('scheduler_runs')
      .insert({
        run_at: now.toISOString(),
        triggered_functions: functionsToTrigger,
        results,
        duration_ms: duration,
        org_id: '550e8400-e29b-41d4-a716-446655440000'
      });

    if (logError) {
      console.error('❌ Failed to log scheduler run:', logError);
    }

    // Self-loop: schedule next run in 5 minutes
    setTimeout(async () => {
      try {
        console.log('🔄 Self-loop: triggering next run in 5 minutes...');
        await fetch(`${supabaseUrl}/functions/v1/master-scheduler`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ trigger: 'self-loop', timestamp: new Date().toISOString() })
        });
      } catch (err) {
        console.error('❌ Self-loop failed:', err);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now.toISOString(),
        triggered: functionsToTrigger,
        results,
        duration_ms: duration,
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
