import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupRequest {
  email_pattern: string;
  dry_run?: boolean;
  keep_system_events?: boolean;
}

interface CleanupResult {
  success: boolean;
  dry_run: boolean;
  email_pattern: string;
  deleted: {
    application_conversations: number;
    application_stage_audit: number;
    application_notes: number;
    application_documents: number;
    application_sublocation_matches: number;
    agent_goals: number;
    system_events: number;
    professional_applications: number;
    professionals: number;
    // New audit tables
    slot_detection_audit: number;
    intent_classification_audit: number;
    processed_emails: number;
  };
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: CleanupRequest = await req.json();
    const { email_pattern, dry_run = true, keep_system_events = false } = body;

    if (!email_pattern || email_pattern.length < 3) {
      return new Response(
        JSON.stringify({ error: "email_pattern is required and must be at least 3 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🧹 Starting cleanup for pattern: ${email_pattern} (dry_run: ${dry_run})`);

    const result: CleanupResult = {
      success: true,
      dry_run,
      email_pattern,
      deleted: {
        application_conversations: 0,
        application_stage_audit: 0,
        application_notes: 0,
        application_documents: 0,
        application_sublocation_matches: 0,
        agent_goals: 0,
        system_events: 0,
        professional_applications: 0,
        professionals: 0,
        // New audit tables
        slot_detection_audit: 0,
        intent_classification_audit: 0,
        processed_emails: 0,
      },
      errors: [],
    };

    // Step 1: Find all matching application IDs
    const { data: applications, error: appError } = await supabase
      .from("professional_applications")
      .select("id, email_from, professional_id")
      .ilike("email_from", `%${email_pattern}%`);

    if (appError) {
      result.errors.push(`Failed to find applications: ${appError.message}`);
      console.error("❌ Failed to find applications:", appError);
    }

    const applicationIds = applications?.map((a) => a.id) || [];
    const professionalIds = applications
      ?.map((a) => a.professional_id)
      .filter((id): id is string => id !== null) || [];

    console.log(`📋 Found ${applicationIds.length} applications, ${professionalIds.length} linked professionals`);

    // Step 2: Find all matching professionals (by email directly)
    const { data: professionals, error: profError } = await supabase
      .from("professionals")
      .select("id, email")
      .ilike("email", `%${email_pattern}%`);

    if (profError) {
      result.errors.push(`Failed to find professionals: ${profError.message}`);
    }

    const allProfessionalIds = [
      ...new Set([...professionalIds, ...(professionals?.map((p) => p.id) || [])]),
    ];

    console.log(`👤 Total professionals to clean: ${allProfessionalIds.length}`);

    // Step 3: Delete in correct order (FK constraints)

    // 3a. application_conversations
    if (applicationIds.length > 0) {
      const { data: convs } = await supabase
        .from("application_conversations")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.application_conversations = convs?.length || 0;
      
      if (!dry_run && convs && convs.length > 0) {
        const { error } = await supabase
          .from("application_conversations")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`application_conversations: ${error.message}`);
      }
      console.log(`💬 Conversations: ${result.deleted.application_conversations}`);
    }

    // 3b. application_stage_audit
    if (applicationIds.length > 0) {
      const { data: audits } = await supabase
        .from("application_stage_audit")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.application_stage_audit = audits?.length || 0;
      
      if (!dry_run && audits && audits.length > 0) {
        const { error } = await supabase
          .from("application_stage_audit")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`application_stage_audit: ${error.message}`);
      }
      console.log(`📝 Stage audits: ${result.deleted.application_stage_audit}`);
    }

    // 3c. application_notes
    if (applicationIds.length > 0) {
      const { data: notes } = await supabase
        .from("application_notes")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.application_notes = notes?.length || 0;
      
      if (!dry_run && notes && notes.length > 0) {
        const { error } = await supabase
          .from("application_notes")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`application_notes: ${error.message}`);
      }
      console.log(`📌 Notes: ${result.deleted.application_notes}`);
    }

    // 3d. application_documents
    if (applicationIds.length > 0) {
      const { data: docs } = await supabase
        .from("application_documents")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.application_documents = docs?.length || 0;
      
      if (!dry_run && docs && docs.length > 0) {
        const { error } = await supabase
          .from("application_documents")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`application_documents: ${error.message}`);
      }
      console.log(`📄 Documents: ${result.deleted.application_documents}`);
    }

    // 3e. application_sublocation_matches
    if (applicationIds.length > 0) {
      const { data: matches } = await supabase
        .from("application_sublocation_matches")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.application_sublocation_matches = matches?.length || 0;
      
      if (!dry_run && matches && matches.length > 0) {
        const { error } = await supabase
          .from("application_sublocation_matches")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`application_sublocation_matches: ${error.message}`);
      }
      console.log(`🔗 Matches: ${result.deleted.application_sublocation_matches}`);
    }

    // 3f. NEW AUDIT TABLES - slot_detection_audit
    if (applicationIds.length > 0) {
      const { data: slotAudits } = await supabase
        .from("slot_detection_audit")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.slot_detection_audit = slotAudits?.length || 0;
      
      if (!dry_run && slotAudits && slotAudits.length > 0) {
        const { error } = await supabase
          .from("slot_detection_audit")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`slot_detection_audit: ${error.message}`);
      }
      console.log(`🎰 Slot detection audits: ${result.deleted.slot_detection_audit}`);
    }

    // 3g. NEW AUDIT TABLES - intent_classification_audit
    if (applicationIds.length > 0) {
      const { data: intentAudits } = await supabase
        .from("intent_classification_audit")
        .select("id")
        .in("application_id", applicationIds);
      
      result.deleted.intent_classification_audit = intentAudits?.length || 0;
      
      if (!dry_run && intentAudits && intentAudits.length > 0) {
        const { error } = await supabase
          .from("intent_classification_audit")
          .delete()
          .in("application_id", applicationIds);
        if (error) result.errors.push(`intent_classification_audit: ${error.message}`);
      }
      console.log(`🧠 Intent classification audits: ${result.deleted.intent_classification_audit}`);
    }

    // 3h. NEW AUDIT TABLES - processed_emails (match by email_id containing email pattern or application_id)
    // First try to match by application_id reference in email_id field
    const { data: allProcessedEmails } = await supabase
      .from("processed_emails")
      .select("id, email_id, message_id");
    
    const matchingProcessedEmailIds = allProcessedEmails
      ?.filter((e) => 
        (e.email_id && e.email_id.toLowerCase().includes(email_pattern.toLowerCase())) ||
        (e.message_id && e.message_id.toLowerCase().includes(email_pattern.toLowerCase()))
      )
      .map((e) => e.id) || [];
    
    result.deleted.processed_emails = matchingProcessedEmailIds.length;
    
    if (!dry_run && matchingProcessedEmailIds.length > 0) {
      const { error } = await supabase
        .from("processed_emails")
        .delete()
        .in("id", matchingProcessedEmailIds);
      if (error) result.errors.push(`processed_emails: ${error.message}`);
    }
    console.log(`📧 Processed emails: ${result.deleted.processed_emails}`);

    // 3i. agent_goals (match by input_data containing email pattern)
    const { data: goals } = await supabase
      .from("agent_goals")
      .select("id")
      .or(`input_data.cs.{"email":"${email_pattern}"},input_data.cs.{"applicant_email":"${email_pattern}"}`);

    // Also search by text pattern in input_data
    const { data: goalsText } = await supabase
      .from("agent_goals")
      .select("id, input_data")
      .textSearch("input_data", email_pattern);

    const allGoalIds = [...new Set([
      ...(goals?.map((g) => g.id) || []),
      ...(goalsText?.map((g) => g.id) || []),
    ])];

    // Fallback: manual filter for goals containing the pattern
    const { data: allGoals } = await supabase
      .from("agent_goals")
      .select("id, input_data");
    
    const matchingGoalIds = allGoals
      ?.filter((g) => JSON.stringify(g.input_data).toLowerCase().includes(email_pattern.toLowerCase()))
      .map((g) => g.id) || [];

    const finalGoalIds = [...new Set([...allGoalIds, ...matchingGoalIds])];
    result.deleted.agent_goals = finalGoalIds.length;

    if (!dry_run && finalGoalIds.length > 0) {
      // First delete agent_actions that reference these goals
      const { error: actionsError } = await supabase
        .from("agent_actions")
        .delete()
        .in("goal_id", finalGoalIds);
      if (actionsError) result.errors.push(`agent_actions: ${actionsError.message}`);

      // Then delete the goals
      const { error } = await supabase
        .from("agent_goals")
        .delete()
        .in("id", finalGoalIds);
      if (error) result.errors.push(`agent_goals: ${error.message}`);
    }
    console.log(`🎯 Agent goals: ${result.deleted.agent_goals}`);

    // 3j. system_events (optional)
    if (!keep_system_events) {
      const allEntityIds = [...applicationIds, ...allProfessionalIds];
      if (allEntityIds.length > 0) {
        const { data: events } = await supabase
          .from("system_events")
          .select("id")
          .in("entity_id", allEntityIds);
        
        result.deleted.system_events = events?.length || 0;
        
        if (!dry_run && events && events.length > 0) {
          const { error } = await supabase
            .from("system_events")
            .delete()
            .in("entity_id", allEntityIds);
          if (error) result.errors.push(`system_events: ${error.message}`);
        }
        console.log(`📊 System events: ${result.deleted.system_events}`);
      }
    }

    // 3k. Unlink professional_id from applications before deleting
    if (!dry_run && applicationIds.length > 0) {
      const { error } = await supabase
        .from("professional_applications")
        .update({ professional_id: null })
        .in("id", applicationIds);
      if (error) result.errors.push(`unlink professional_id: ${error.message}`);
    }

    // 3l. Delete professional_applications
    result.deleted.professional_applications = applicationIds.length;
    if (!dry_run && applicationIds.length > 0) {
      const { error } = await supabase
        .from("professional_applications")
        .delete()
        .in("id", applicationIds);
      if (error) result.errors.push(`professional_applications: ${error.message}`);
    }
    console.log(`📨 Applications: ${result.deleted.professional_applications}`);

    // 3m. Delete professionals
    result.deleted.professionals = allProfessionalIds.length;
    if (!dry_run && allProfessionalIds.length > 0) {
      // First delete any assignments linked to these professionals
      const { error: assignError } = await supabase
        .from("assignments")
        .delete()
        .in("professional_id", allProfessionalIds);
      if (assignError) result.errors.push(`assignments: ${assignError.message}`);

      const { error } = await supabase
        .from("professionals")
        .delete()
        .in("id", allProfessionalIds);
      if (error) result.errors.push(`professionals: ${error.message}`);
    }
    console.log(`👤 Professionals: ${result.deleted.professionals}`);

    result.success = result.errors.length === 0;

    console.log(`✅ Cleanup ${dry_run ? "(DRY RUN) " : ""}complete:`, result.deleted);

    return new Response(
      JSON.stringify(result, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
