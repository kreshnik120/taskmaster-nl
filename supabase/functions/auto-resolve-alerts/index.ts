import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    console.log("🤖 Starting Auto-Resolution Engine...");

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

    // 1. AUTO-MERGE DUPLICATES
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

    // 2. AUTO-RESOLVE KNOWLEDGE CONFLICTS (Tier 1 source wins)
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

    // 3. AUTO-RESOLVE DATA QUALITY (check conflicting items)
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

    console.log(`✅ Auto-resolved ${resolvedCount} alerts`);

    return jsonResponse({
      success: true,
      total_alerts_scanned: alerts?.length || 0,
      resolved_count: resolvedCount,
      resolution_log: resolutionLog,
    });
  } catch (error: any) {
    console.error("❌ Auto-resolution error:", error);
    return errorResponse(error.message, 500);
  }
});
