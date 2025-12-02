import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pipeline learning weights - how much to boost/penalize patterns
const PIPELINE_WEIGHTS: Record<string, number> = {
  geplaatst: 0.15,      // Strong positive - placement succeeded
  goedgekeurd: 0.08,    // Moderate positive - approved
  interview: 0.05,      // Weak positive - made it to interview
  screening: 0.02,      // Minimal positive
  nieuw: 0.0,           // Neutral
  afgewezen: -0.05,     // Negative - rejected
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log("[learn-from-pipeline] Starting pipeline learning analysis...");

    // Get recent stage transitions from system_events (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Check for both event types: application_stage_changed and pipeline_stage_changed
    const { data: events, error: eventsError } = await supabase
      .from("system_events")
      .select("*")
      .in("event_type", ["pipeline_stage_changed", "application_stage_changed"])
      .is("processed_at", null) // Use processed_at instead of applied_to_knowledge_base
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100);

    if (eventsError) {
      console.error("[learn-from-pipeline] Error fetching events:", eventsError);
      throw eventsError;
    }

    console.log(`[learn-from-pipeline] Found ${events?.length || 0} unprocessed pipeline events`);

    if (!events?.length) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No new pipeline events to process",
          processed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const learnings: Array<{
      application_id: string;
      pattern_key: string;
      weight_change: number;
      new_stage: string;
    }> = [];

    // Process each stage transition
    for (const event of events) {
      // Use event_data and metadata columns (not context)
      const eventData = event.event_data as Record<string, unknown> || {};
      const metadata = event.metadata as Record<string, unknown> || {};
      const newStage = eventData?.new_stage as string || eventData?.pipeline_stage as string || metadata?.new_stage as string;
      const applicationId = eventData?.application_id as string || event.entity_id;
      
      if (!newStage || !applicationId) continue;

      const weight = PIPELINE_WEIGHTS[newStage.toLowerCase()] || 0;
      if (weight === 0) continue; // Skip neutral transitions

      // Get application details to extract learning patterns
      const { data: application } = await supabase
        .from("professional_applications")
        .select("extracted_data, org_id")
        .eq("id", applicationId)
        .single();

      if (!application?.extracted_data) continue;

      const extracted = application.extracted_data as Record<string, unknown>;
      const functieNiveau = extracted.functie_niveau as string;
      const werkvorm = extracted.werkvorm as string;
      const ervaringSector = extracted.ervaring_sector as string[] || [];
      const doelgroepErvaring = extracted.doelgroep_ervaring as string[] || [];
      const regio = extracted.regio as string;

      // Create pattern key from application characteristics
      const patternComponents = [
        functieNiveau,
        ervaringSector[0], // Primary sector
        doelgroepErvaring[0], // Primary target group
      ].filter(Boolean);

      if (patternComponents.length < 2) continue;

      const patternKey = `success_pattern:${patternComponents.join("_").toLowerCase().replace(/\s+/g, "_")}`;

      // Check if pattern exists in knowledge base
      const { data: existingPattern } = await supabase
        .from("ai_knowledge_base")
        .select("id, value, occurrence_count, confidence_score")
        .eq("key", patternKey)
        .eq("category", "success_patterns")
        .is("deleted_at", null)
        .maybeSingle();

      if (existingPattern) {
        // Update existing pattern
        const currentValue = existingPattern.value as Record<string, unknown>;
        const currentBoost = (currentValue.boost_factor as number) || 0.05;
        const newBoost = Math.min(0.20, Math.max(0, currentBoost + weight));
        
        await supabase
          .from("ai_knowledge_base")
          .update({
            value: {
              ...currentValue,
              boost_factor: newBoost,
              last_learning_event: new Date().toISOString(),
              last_stage: newStage,
            },
            occurrence_count: (existingPattern.occurrence_count || 1) + 1,
            confidence_score: Math.min(1.0, (existingPattern.confidence_score || 0.5) + Math.abs(weight) * 0.5),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPattern.id);

        console.log(`[learn-from-pipeline] Updated pattern ${patternKey}: boost ${currentBoost} -> ${newBoost}`);
      } else if (weight > 0) {
        // Create new pattern only for positive signals
        const org_id = application.org_id || "550e8400-e29b-41d4-a716-446655440000"; // Default to ABCzorg
        
        await supabase
          .from("ai_knowledge_base")
          .insert({
            org_id,
            key: patternKey,
            category: "success_patterns",
            value: {
              functie_niveau: functieNiveau,
              sector: ervaringSector[0],
              doelgroep: doelgroepErvaring[0],
              werkvorm: werkvorm,
              regio: regio,
              boost_factor: 0.05 + weight,
              pattern_type: "pipeline_learned",
              created_from_stage: newStage,
              last_learning_event: new Date().toISOString(),
            },
            confidence_score: 0.4 + Math.abs(weight),
            occurrence_count: 1,
            source_type: "pipeline_learning",
          });

        console.log(`[learn-from-pipeline] Created new pattern ${patternKey} from ${newStage} transition`);
      }

      learnings.push({
        application_id: applicationId,
        pattern_key: patternKey,
        weight_change: weight,
        new_stage: newStage,
      });

      // Mark event as processed
      await supabase
        .from("system_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", event.id);
    }

    // Also learn from evaluations
    const { data: evaluations } = await supabase
      .from("assignment_evaluations")
      .select(`
        id, rating, would_rehire, feedback,
        assignments!inner (
          id, professional_id, sublocation_id,
          professionals!inner (
            id, naam, functie_niveau, regio
          ),
          client_sublocations!inner (
            id, sector, doelgroep
          )
        )
      `)
      .gte("created_at", sevenDaysAgo)
      .limit(50);

    let evaluationLearnings = 0;
    
    if (evaluations?.length) {
      for (const eval_ of evaluations) {
        const rating = eval_.rating;
        const wouldRehire = eval_.would_rehire;
        const assignment = eval_.assignments as any;
        const professional = assignment?.professionals;
        const sublocation = assignment?.client_sublocations;
        
        if (!professional || !sublocation) continue;

        // Calculate learning weight from evaluation
        let evalWeight = 0;
        if (rating >= 5 && wouldRehire) evalWeight = 0.12;
        else if (rating >= 4 && wouldRehire) evalWeight = 0.08;
        else if (rating >= 5) evalWeight = 0.04;
        else if (rating >= 4) evalWeight = 0.02;
        else if (rating <= 2) evalWeight = -0.05;

        if (evalWeight === 0) continue;

        // Create pattern from evaluation
        const patternKey = `eval_pattern:${professional.functie_niveau}_${sublocation.sector?.[0] || 'unknown'}`.toLowerCase().replace(/\s+/g, "_");

        const { data: existingEvalPattern } = await supabase
          .from("ai_knowledge_base")
          .select("id, value, occurrence_count")
          .eq("key", patternKey)
          .eq("category", "success_patterns")
          .is("deleted_at", null)
          .maybeSingle();

        if (existingEvalPattern) {
          const currentValue = existingEvalPattern.value as Record<string, unknown>;
          const currentBoost = (currentValue.boost_factor as number) || 0.05;
          const newBoost = Math.min(0.20, Math.max(0, currentBoost + evalWeight));

          await supabase
            .from("ai_knowledge_base")
            .update({
              value: {
                ...currentValue,
                boost_factor: newBoost,
                last_eval_rating: rating,
                last_eval_rehire: wouldRehire,
              },
              occurrence_count: (existingEvalPattern.occurrence_count || 1) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingEvalPattern.id);

          evaluationLearnings++;
        }
      }
    }

    console.log(`[learn-from-pipeline] Completed: ${learnings.length} pipeline learnings, ${evaluationLearnings} evaluation learnings`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: learnings.length,
        evaluation_learnings: evaluationLearnings,
        learnings: learnings.slice(0, 10), // Return sample
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[learn-from-pipeline] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
