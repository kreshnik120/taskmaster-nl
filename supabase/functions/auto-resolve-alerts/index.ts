// Auto-Resolve Alerts - automated alert resolution engine (Enterprise Edition)
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    console.log("🤖 Starting Enterprise Auto-Resolution Engine...");

    // Fetch all active critical alerts
    const { data: alerts, error: fetchError } = await supabase
      .from("business_intelligence")
      .select("*")
      .in("severity", ["critical", "high"])
      .eq("status", "active")
      .order("detected_at", { ascending: false })
      .limit(1000);

    if (fetchError) {
      console.error("❌ Error fetching alerts:", fetchError);
      throw fetchError;
    }

    console.log(`📊 Found ${alerts?.length || 0} active critical alerts`);

    let resolvedCount = 0;
    const resolutionLog: any[] = [];

    // ============================================================
    // 1. AUTO-MERGE DUPLICATES
    // ============================================================
    const duplicateGroups = new Map<string, any[]>();
    alerts?.forEach((alert) => {
      const key = `${alert.title}_${alert.data?.category || 'unknown'}`;
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key)!.push(alert);
    });

    for (const [key, group] of duplicateGroups.entries()) {
      if (group.length > 1) {
        const sortedGroup = group.sort((a, b) => 
          new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
        );
        
        const toResolve = sortedGroup.slice(1);
        const keepAlert = sortedGroup[0];

        for (const alert of toResolve) {
          await supabase
            .from("business_intelligence")
            .update({
              status: "resolved",
              data: {
                ...alert.data,
                resolution: "auto_merged_duplicate",
                merged_into: keepAlert.id,
                resolved_at: new Date().toISOString(),
              }
            })
            .eq("id", alert.id);

          resolvedCount++;
          resolutionLog.push({
            id: alert.id,
            title: alert.title,
            reason: "duplicate_merged",
            merged_into: keepAlert.id,
          });
        }

        console.log(`✅ Merged ${toResolve.length} duplicates for: ${key}`);
      }
    }

    // ============================================================
    // 2. AUTO-RESOLVE TEST FAILURE ALERTS (pass_rate >= 90%)
    // ============================================================
    const testFailureAlerts = alerts?.filter(a => 
      a.intelligence_type === 'test_failure' && a.status === 'active'
    ) || [];

    if (testFailureAlerts.length > 0) {
      // Get latest test run
      const { data: latestRun } = await supabase
        .from("ai_chat_test_runs")
        .select("id, passed_tests, total_tests, completed_at")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      if (latestRun && latestRun.total_tests > 0) {
        const passRate = (latestRun.passed_tests / latestRun.total_tests) * 100;
        
        if (passRate >= 90) {
          for (const alert of testFailureAlerts) {
            await supabase
              .from("business_intelligence")
              .update({
                status: "resolved",
                data: {
                  ...alert.data,
                  resolution: "auto_resolved_pass_rate_above_threshold",
                  latest_pass_rate: passRate.toFixed(1),
                  latest_run_id: latestRun.id,
                  resolved_at: new Date().toISOString(),
                }
              })
              .eq("id", alert.id);

            resolvedCount++;
            resolutionLog.push({
              id: alert.id,
              title: alert.title,
              reason: "test_pass_rate_above_90",
              pass_rate: passRate.toFixed(1),
            });
          }
          console.log(`✅ Auto-resolved ${testFailureAlerts.length} test failure alerts (pass rate: ${passRate.toFixed(1)}%)`);
        }
      }
    }

    // ============================================================
    // 3. AUTO-RESOLVE KNOWLEDGE CONFLICTS (Tier 1 source wins)
    // ============================================================
    const conflictAlerts = alerts?.filter(a => 
      a.data?.category === 'knowledge_conflict' && a.status === 'active'
    ) || [];

    for (const alert of conflictAlerts) {
      const sources = alert.data?.sources || [];
      const tier1Sources = sources.filter((s: any) => 
        s?.source_type?.includes('tier1') || s?.source_type === 'officieel'
      );

      if (tier1Sources.length === 1 && sources.length > 1) {
        await supabase
          .from("business_intelligence")
          .update({
            status: "resolved",
            data: {
              ...alert.data,
              resolution: "tier1_source_priority",
              winning_source: tier1Sources[0],
              resolved_at: new Date().toISOString(),
            }
          })
          .eq("id", alert.id);

        resolvedCount++;
        resolutionLog.push({
          id: alert.id,
          title: alert.title,
          reason: "tier1_priority",
        });

        console.log(`✅ Auto-resolved conflict via Tier 1 priority: ${alert.title}`);
      }
    }

    // ============================================================
    // 4. AUTO-RESOLVE DATA QUALITY (check conflicting items)
    // ============================================================
    const dataQualityAlerts = alerts?.filter(a => 
      a.data?.category === 'data_quality' && 
      a.status === 'active' &&
      a.data?.conflicting_items?.length > 0
    ) || [];

    for (const alert of dataQualityAlerts) {
      const conflictingItems = alert.data.conflicting_items || [];
      const aiReasoning = alert.data.ai_reasoning || '';
      
      const isComplementary = 
        aiReasoning.toLowerCase().includes('complement') ||
        aiReasoning.toLowerCase().includes('aanvullend') ||
        aiReasoning.toLowerCase().includes('niet in conflict');
      
      if (isComplementary) {
        await supabase
          .from("business_intelligence")
          .update({
            status: "resolved",
            data: {
              ...alert.data,
              resolution: "auto_complementary_items",
              resolved_at: new Date().toISOString(),
            }
          })
          .eq("id", alert.id);
        
        const itemIds = conflictingItems.map((item: any) => item.id);
        if (itemIds.length > 0) {
          await supabase
            .from("ai_knowledge_base")
            .update({ 
              needs_review: false,
              validation_status: 'verified'
            })
            .in('id', itemIds);
        }

        resolvedCount++;
        resolutionLog.push({
          id: alert.id,
          title: alert.title,
          reason: "complementary_items",
          items_validated: itemIds.length
        });
        
        console.log(`✅ Auto-resolved complementary conflict: ${alert.title} (${itemIds.length} items validated)`);
        continue;
      }
      
      const itemIds = conflictingItems.map((item: any) => item.id).filter(Boolean);
      if (itemIds.length > 0) {
        const { data: kbItems } = await supabase
          .from("ai_knowledge_base")
          .select("id, validation_status")
          .in('id', itemIds);
        
        const allValidated = kbItems?.every((kb: any) => 
          kb.validation_status === 'verified'
        );
        
        if (allValidated && kbItems && kbItems.length === itemIds.length) {
          await supabase
            .from("business_intelligence")
            .update({
              status: "resolved",
              data: {
                ...alert.data,
                resolution: "all_items_validated_by_admin",
                resolved_at: new Date().toISOString(),
              }
            })
            .eq("id", alert.id);

          resolvedCount++;
          resolutionLog.push({
            id: alert.id,
            title: alert.title,
            reason: "all_items_validated",
          });
          
          console.log(`✅ Auto-resolved data quality: ${alert.title} (all ${itemIds.length} items validated)`);
        }
      }
    }

    // ============================================================
    // 5. AUTO-COMPLETE WORKFLOW PATTERNS (these are successes)
    // ============================================================
    const workflowPatterns = alerts?.filter(a => 
      a.intelligence_type === 'workflow_pattern' && a.status === 'active'
    ) || [];

    for (const alert of workflowPatterns) {
      await supabase
        .from("business_intelligence")
        .update({
          status: "completed",
          data: {
            ...alert.data,
            completion_note: "auto_completed_workflow_pattern_is_success",
            resolved_at: new Date().toISOString(),
          }
        })
        .eq("id", alert.id);

      resolvedCount++;
      resolutionLog.push({
        id: alert.id,
        title: alert.title,
        reason: "workflow_pattern_completed",
      });
      
      console.log(`✅ Auto-completed workflow pattern: ${alert.title}`);
    }

    // ============================================================
    // 6. CLEANUP OUTDATED ALERTS (> 60 days without update)
    // ============================================================
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: staleAlerts } = await supabase
      .from("business_intelligence")
      .select("id, title")
      .eq("status", "active")
      .lt("last_updated_at", sixtyDaysAgo.toISOString())
      .limit(50);

    if (staleAlerts && staleAlerts.length > 0) {
      for (const alert of staleAlerts) {
        await supabase
          .from("business_intelligence")
          .update({
            status: "stale",
            data: {
              resolution: "auto_marked_stale_no_updates_60_days",
              stale_at: new Date().toISOString(),
            }
          })
          .eq("id", alert.id);

        resolvedCount++;
        resolutionLog.push({
          id: alert.id,
          title: alert.title,
          reason: "stale_60_days",
        });
      }
      console.log(`✅ Marked ${staleAlerts.length} alerts as stale (no updates in 60 days)`);
    }

    console.log(`✅ Enterprise Auto-Resolution complete: ${resolvedCount} alerts processed`);

    return jsonResponse({
      success: true,
      total_alerts_scanned: alerts?.length || 0,
      resolved_count: resolvedCount,
      resolution_log: resolutionLog,
      capabilities: [
        "duplicate_merging",
        "test_failure_auto_resolve",
        "tier1_source_priority",
        "complementary_items",
        "workflow_pattern_completion",
        "stale_alert_cleanup"
      ]
    });
  } catch (error: any) {
    console.error("❌ Auto-resolution error:", error);
    return errorResponse(error.message, 500);
  }
});
