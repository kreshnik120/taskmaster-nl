// System Health Monitor - Self-Healing System (Phase 4)
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    const results: any[] = [];
    const actionsTaken: string[] = [];

    // Get all organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name');

    if (!orgs) {
      throw new Error('No organizations found');
    }

    for (const org of orgs) {
      console.log(`\n🔍 Checking health for org: ${org.name}`);
      
      // **CHECK 1: Stuck Orchestrator Runs**
      const { data: stuckRuns, error: stuckError } = await supabase
        .from('orchestrator_state')
        .select('*')
        .eq('org_id', org.id)
        .eq('status', 'running');

      if (!stuckError && stuckRuns) {
        for (const run of stuckRuns) {
          const lastHeartbeat = run.metadata?.last_heartbeat 
            ? new Date(run.metadata.last_heartbeat)
            : new Date(run.last_run_at);
          
          const minutesStale = (Date.now() - lastHeartbeat.getTime()) / 1000 / 60;

          if (minutesStale > 5) {
            console.log(`⚠️ Found stuck run (${minutesStale.toFixed(1)} min stale): ${run.id}`);
            
            // AUTO-FIX: Reset to error
            const { error: resetError } = await supabase
              .from('orchestrator_state')
              .update({
                status: 'error',
                metadata: {
                  ...run.metadata,
                  error: `Auto-recovery: Stale heartbeat (${minutesStale.toFixed(1)} min)`,
                  recovered_at: new Date().toISOString(),
                  recovered_by: 'system-health-monitor'
                }
              })
              .eq('id', run.id);

            if (!resetError) {
              actionsTaken.push(`Reset stuck orchestrator run: ${run.id}`);
              console.log(`✅ Reset stuck run: ${run.id}`);
            }
          }
        }
      }

      // **CHECK 2: Missing Embeddings (FIXED)**
      // Count total knowledge base items
      const { count: kbCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .is('deleted_at', null);

      // Get all knowledge IDs for this org
      const { data: kbItems } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('org_id', org.id)
        .is('deleted_at', null);

      const kbIds = kbItems?.map(item => item.id) || [];

      // Count items with embeddings
      const { data: embeddingData } = await supabase
        .from('knowledge_embeddings')
        .select('knowledge_id')
        .in('knowledge_id', kbIds);

      const totalItems = kbCount || 0;
      const itemsWithEmbeddings = embeddingData?.length || 0;
      const missingCount = totalItems - itemsWithEmbeddings;
      const coveragePercentage = totalItems > 0 ? (itemsWithEmbeddings / totalItems) * 100 : 0;

      console.log(`📊 Embedding coverage: ${itemsWithEmbeddings}/${totalItems} (${missingCount} missing, ${coveragePercentage.toFixed(1)}%)`);

      if (missingCount > 100) {
        console.log(`🚨 Too many missing embeddings (${missingCount}), triggering backfill...`);
        
        // AUTO-FIX: Trigger backfill
        try {
          const { error: backfillError } = await supabase.functions.invoke(
            'auto-backfill-orchestrator',
            {
              body: { 
                batch_size: 50,
                force_restart: true 
              }
            }
          );

          if (!backfillError) {
            actionsTaken.push(`Triggered auto-backfill for ${missingCount} missing embeddings`);
            console.log(`✅ Backfill triggered`);
          }
        } catch (err) {
          console.error('❌ Failed to trigger backfill:', err);
        }
      }

      // **CHECK 3: AI Response Times** (sample recent function calls)
      const { data: recentCalls } = await supabase
        .from('function_call_logs')
        .select('execution_time_ms, function_name, created_at')
        .eq('org_id', org.id)
        .in('function_name', ['ai-chat', 'ai-training-chat'])
        .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentCalls && recentCalls.length > 0) {
        const avgResponseTime = recentCalls.reduce((sum, call) => sum + (call.execution_time_ms || 0), 0) / recentCalls.length;
        console.log(`⏱️ Avg AI response time: ${avgResponseTime.toFixed(0)}ms`);

        if (avgResponseTime > 10000) {
          console.log(`⚠️ High AI response times detected (${avgResponseTime.toFixed(0)}ms avg)`);
          results.push({
            org_id: org.id,
            check: 'ai_performance',
            status: 'warning',
            value: avgResponseTime,
            threshold: 10000
          });
        }
      }

      // **CHECK 4: Stuck Agent Goals (>10 min in executing or executing_react)**
      const { data: stuckGoals, error: goalError } = await supabase
        .from('agent_goals')
        .select('*')
        .eq('org_id', org.id)
        .in('status', ['executing', 'executing_react'])
        .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

      let stuckGoalsCount = 0;
      if (!goalError && stuckGoals && stuckGoals.length > 0) {
        stuckGoalsCount = stuckGoals.length;
        console.log(`⚠️ Found ${stuckGoals.length} stuck goals (>10 min in executing)`);
        
        for (const goal of stuckGoals) {
          const minutesStuck = (Date.now() - new Date(goal.started_at).getTime()) / 1000 / 60;
          const severity = minutesStuck > 30 ? 'critical' : 'high';
          
          // Check for existing active alert (deduplication)
          const { data: existingAlert } = await supabase
            .from('business_intelligence')
            .select('id')
            .eq('intelligence_type', 'stuck_goal_alert')
            .eq('status', 'active')
            .contains('data', { goal_id: goal.id })
            .single();
          
          if (!existingAlert) {
            // Create new alert
            const { error: alertError } = await supabase.from('business_intelligence').insert({
              org_id: goal.org_id,
              intelligence_type: 'stuck_goal_alert',
              title: `⚠️ Goal vast: ${goal.goal_type}`,
              description: `Goal ${goal.id.slice(0,8)} staat al ${minutesStuck.toFixed(0)} minuten in 'executing' status`,
              severity,
              status: 'active',
              priority: severity === 'critical' ? 'high' : 'medium',
              data: {
                category: 'stuck_goal',
                goal_id: goal.id,
                goal_type: goal.goal_type,
                started_at: goal.started_at,
                minutes_stuck: Math.round(minutesStuck),
                application_id: (goal.input_data as any)?.application_id,
                detected_at: new Date().toISOString()
              }
            });
            
            if (!alertError) {
              actionsTaken.push(`Created stuck goal alert: ${goal.id.slice(0,8)} (${minutesStuck.toFixed(0)} min)`);
              console.log(`📢 Alert created for stuck goal: ${goal.id}`);
            }
          }
          
          // AUTO-FIX: Reset goals stuck >30 min to failed
          if (minutesStuck > 30) {
            const { error: failError } = await supabase
              .from('agent_goals')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                output_data: {
                  ...(goal.output_data as object || {}),
                  error: `Auto-recovery: Goal stuck for ${minutesStuck.toFixed(0)} minutes`,
                  recovered_by: 'system-health-monitor',
                  recovered_at: new Date().toISOString()
                }
              })
              .eq('id', goal.id);
            
            if (!failError) {
              actionsTaken.push(`Auto-failed stuck goal: ${goal.id.slice(0,8)} (${minutesStuck.toFixed(0)} min)`);
              console.log(`🔄 Auto-failed stuck goal: ${goal.id}`);
            }
          }
        }
        
        results.push({
          org_id: org.id,
          check: 'stuck_goals',
          status: stuckGoals.some(g => (Date.now() - new Date(g.started_at).getTime()) / 1000 / 60 > 30) ? 'critical' : 'warning',
          count: stuckGoals.length,
          threshold_minutes: 10,
          auto_fail_threshold_minutes: 30
        });
      }

      // **LOG HEALTH CHECK**
      await supabase
        .from('system_health_log')
        .insert({
          org_id: org.id,
          check_type: 'full_system_scan',
          status: actionsTaken.length > 0 ? 'actions_taken' : 'healthy',
          details: {
            stuck_runs: stuckRuns?.length || 0,
            stuck_goals: stuckGoalsCount,
            missing_embeddings: missingCount,
            checks_performed: ['orchestrator_status', 'embedding_coverage', 'ai_performance', 'stuck_goals']
          },
          actions_taken: actionsTaken
        });
    }

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      orgs_checked: orgs.length,
      actions_taken: actionsTaken,
      results
    });

  } catch (error) {
    console.error('❌ Health monitor error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});