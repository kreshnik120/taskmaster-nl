import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("🤖 Starting Auto-Resolution Engine...");

    // Fetch all active critical alerts
    const { data: alerts, error: fetchError } = await supabase
      .from("business_intelligence")
      .select("*")
      .eq("intelligence_type", "alert")
      .in("severity", ["critical", "high"])
      .eq("status", "active")
      .order("detected_at", { ascending: false });

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
        // Keep most recent, mark others as resolved
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
        // Clear winner: Tier 1 source
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

    // 3. AUTO-RESOLVE DATA QUALITY (if data was validated)
    const dataQualityAlerts = alerts?.filter(a => 
      a.data?.category === 'data_quality' && a.status === 'active'
    ) || [];

    for (const alert of dataQualityAlerts) {
      const knowledgeId = alert.data?.knowledge_id;
      if (knowledgeId) {
        const { data: kb } = await supabase
          .from("ai_knowledge_base")
          .select("validation_status")
          .eq("id", knowledgeId)
          .single();

        if (kb?.validation_status === "verified") {
          await supabase
            .from("business_intelligence")
            .update({
              status: "resolved",
              data: {
                ...alert.data,
                resolution: "data_validated_by_admin",
                resolved_at: new Date().toISOString(),
              }
            })
            .eq("id", alert.id);

          resolvedCount++;
          resolutionLog.push({
            id: alert.id,
            title: alert.title,
            reason: "data_validated",
          });

          console.log(`✅ Auto-resolved data quality: ${alert.title}`);
        }
      }
    }

    console.log(`✅ Auto-resolved ${resolvedCount} alerts`);

    return new Response(
      JSON.stringify({
        success: true,
        total_alerts_scanned: alerts?.length || 0,
        resolved_count: resolvedCount,
        resolution_log: resolutionLog,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("❌ Auto-resolution error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
