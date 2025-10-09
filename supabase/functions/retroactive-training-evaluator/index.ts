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

    console.log("🔄 Starting retroactive self-training evaluation...");

    // Get rejected self_training events with score between 0.80-0.85
    const { data: rejectedEvents, error: fetchError } = await supabase
      .from("ai_learning_events")
      .select("*")
      .eq("event_type", "self_training")
      .eq("applied_to_knowledge_base", false)
      .gte("confidence_score", 0.80)
      .lt("confidence_score", 0.85)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("❌ Error fetching events:", fetchError);
      throw fetchError;
    }

    console.log(`📊 Found ${rejectedEvents?.length || 0} eligible events for re-evaluation`);

    let reappliedCount = 0;
    const reappliedItems: any[] = [];

    for (const event of rejectedEvents || []) {
      // Extract knowledge suggestions from context
      const suggestions = event.context?.new_knowledge_suggestions || [];
      
      for (const suggestion of suggestions) {
        // Re-apply with new threshold
        const { error: insertError } = await supabase
          .from("ai_knowledge_base")
          .insert({
            category: suggestion.category,
            key: suggestion.key,
            value: suggestion.value,
            confidence_score: suggestion.confidence || event.confidence_score,
            org_id: event.org_id,
            user_id: event.user_id,
            source: `retroactive_training_${event.id}`,
            validation_status: "unverified",
          });

        if (!insertError) {
          reappliedCount++;
          reappliedItems.push({
            category: suggestion.category,
            key: suggestion.key,
            original_event_id: event.id,
          });
          
          // Update original event status
          await supabase
            .from("ai_learning_events")
            .update({ 
              applied_to_knowledge_base: true,
              outcome: "reapplied_retroactively"
            })
            .eq("id", event.id);
        }
      }
    }

    console.log(`✅ Successfully re-applied ${reappliedCount} knowledge items`);

    return new Response(
      JSON.stringify({
        success: true,
        evaluated_events: rejectedEvents?.length || 0,
        reapplied_items: reappliedCount,
        items: reappliedItems,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("❌ Retroactive evaluation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
