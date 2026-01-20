/**
 * Pipeline Stage Controller v1.1.0
 * ================================
 * Central controller for ALL pipeline stage transitions.
 * Part of the Multi-Agent Specialist Architecture.
 * 
 * Endpoints:
 * - POST /check    - Check which transition is possible
 * - POST /advance  - Execute transition with strict validation
 * - POST /route    - Route to the correct specialist agent
 * - POST /status   - Get current pipeline status and blockers
 * 
 * This controller enforces the strict 6-stage flow:
 * nieuw → intake_verstuurd → gesprek_gepland → screening → goedgekeurd → geplaatst
 */
console.log('[pipeline-stage-controller] v1.4.0 BOOTED at', new Date().toISOString());

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid pipeline stages in order
// HERZIEN januari 2026: 'docs_compleet' verwijderd - documenten verzameld in intake_verstuurd
const PIPELINE_STAGES = [
  'nieuw',
  'intake_verstuurd', 
  'gesprek_gepland',    // Direct naar gesprek_gepland (recruiter plant of kandidaat kiest slot)
  'screening',          // Na positieve gesprek feedback
  'goedgekeurd',        // Na VOG verificatie
  'geplaatst'
] as const;

type PipelineStage = typeof PIPELINE_STAGES[number];

interface TransitionResult {
  allowed: boolean;
  blockers: string[];
  current_stage: string;
  target_stage?: string;
}

interface ApplicationData {
  id: string;
  pipeline_stage: string;
  welcome_email_sent_at: string | null;
  completeness_score: number | null;
  gesprek_datum: string | null;
  gesprek_feedback: string | null;
  vog_validation_status: string | null;
  org_id: string;
  extracted_data: { naam?: string } | null;
  email_from: string | null;
}

interface DocumentData {
  id: string;
  document_type: string | null;
  is_verified: boolean;
  filename: string;
}

// ============================================================================
// TRANSITION REQUIREMENTS - Strict validation for each stage transition
// ============================================================================

async function checkTransitionRequirements(
  supabase: any,
  app: ApplicationData,
  fromStage: string,
  toStage: string
): Promise<TransitionResult> {
  const blockers: string[] = [];

  // Get documents for this application
  const { data: docs } = await supabase
    .from('application_documents')
    .select('id, document_type, is_verified, filename')
    .eq('application_id', app.id);

  const documents = (docs || []) as DocumentData[];

  // Define requirements per transition
  // HERZIEN januari 2026: docs_compleet verwijderd, intake_verstuurd→gesprek_gepland vereist gesprek_datum
  // HERZIEN januari 2026 v2: nieuw→intake_verstuurd vereist geverifieerde documenten
  switch (`${fromStage}→${toStage}`) {
    case 'nieuw→intake_verstuurd': {
      // v1.2.0: Uitgebreide transitie vereisten voor Fase 1 → Fase 2
      // Kandidaat moet documenten aangeleverd EN geverifieerd hebben
      
      // Check 1: Welkomstmail moet verstuurd zijn
      if (!app.welcome_email_sent_at) {
        blockers.push('Welkomstmail niet verstuurd (welcome_email_sent_at is null)');
      }
      
      // Check 2: CV moet aanwezig zijn in application_documents
      const hasCV = documents.some(d => 
        d.document_type === 'cv' || 
        d.filename?.toLowerCase().includes('cv') ||
        d.filename?.toLowerCase().includes('curriculum')
      );
      if (!hasCV) {
        blockers.push('CV ontbreekt in application_documents');
      }
      
      // Check 3: Diploma moet aanwezig zijn
      const hasDiploma = documents.some(d => 
        d.document_type === 'diploma' || 
        d.filename?.toLowerCase().includes('diploma') ||
        d.filename?.toLowerCase().includes('certificaat')
      );
      if (!hasDiploma) {
        blockers.push('Diploma ontbreekt in application_documents');
      }
      
      // Check 4: Diploma moet GEVERIFIEERD zijn via Bright/DUO
      const diplomaVerified = documents.some(d => 
        (d.document_type === 'diploma' || d.filename?.toLowerCase().includes('diploma')) && 
        d.is_verified === true
      );
      if (hasDiploma && !diplomaVerified) {
        blockers.push('Diploma nog niet geverifieerd via DUO/Bright');
      }
      
      // Check 5: Completeness score minimaal 70%
      const completeness = app.completeness_score || 0;
      if (completeness < 70) {
        blockers.push(`Completeness score ${completeness}% is lager dan vereiste 70%`);
      }
      
      console.log(`[pipeline-controller] nieuw→intake_verstuurd check: hasCV=${hasCV}, hasDiploma=${hasDiploma}, diplomaVerified=${diplomaVerified}, completeness=${completeness}%, blockers=${blockers.length}`);
      break;
    }

    // HERZIEN: intake_verstuurd→gesprek_gepland vereist gesprek_datum (door recruiter of kandidaat slot keuze)
    case 'intake_verstuurd→gesprek_gepland': {
      const hasCV = documents.some(d => d.document_type === 'cv');
      const hasDiploma = documents.some(d => d.document_type === 'diploma');
      const completeness = app.completeness_score || 0;

      if (!hasCV) {
        blockers.push('CV ontbreekt in application_documents');
      }
      if (!hasDiploma) {
        blockers.push('Diploma ontbreekt in application_documents');
      }
      if (completeness < 70) {
        blockers.push(`Completeness score ${completeness}% is lager dan 70%`);
      }
      if (!app.gesprek_datum) {
        blockers.push('Gesprek datum niet bevestigd door kandidaat of recruiter');
      }
      break;
    }

    // LEGACY: docs_compleet→gesprek_gepland (voor oude applicaties)
    case 'docs_compleet→gesprek_gepland':
      if (!app.gesprek_datum) {
        blockers.push('Gesprek datum niet ingevuld door medewerker');
      }
      break;

    case 'gesprek_gepland→screening':
      if (app.gesprek_feedback !== 'positive') {
        blockers.push(`Geen positieve gesprek feedback (huidige waarde: ${app.gesprek_feedback || 'null'})`);
      }
      break;

    case 'screening→goedgekeurd': {
      const vogVerified = documents.some(d => 
        d.document_type === 'vog' && d.is_verified
      );
      if (!vogVerified) {
        blockers.push('VOG niet geverifieerd');
      }
      if (app.vog_validation_status !== 'verified') {
        blockers.push(`VOG validatie status is niet verified (huidige: ${app.vog_validation_status || 'null'})`);
      }
      break;
    }

    case 'goedgekeurd→geplaatst':
      // No automatic requirements - this is done via placement creation
      break;

    default:
      // Check if it's a valid forward transition
      const fromIndex = PIPELINE_STAGES.indexOf(fromStage as PipelineStage);
      const toIndex = PIPELINE_STAGES.indexOf(toStage as PipelineStage);
      
      if (fromIndex === -1 || toIndex === -1) {
        blockers.push(`Ongeldige stage: ${fromStage} of ${toStage}`);
      } else if (toIndex !== fromIndex + 1) {
        blockers.push(`Stage skip niet toegestaan: ${fromStage} → ${toStage}. Volgende stage moet ${PIPELINE_STAGES[fromIndex + 1]} zijn.`);
      }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    current_stage: fromStage,
    target_stage: toStage
  };
}

// ============================================================================
// CHECK FEATURE FLAG
// ============================================================================

async function isMultiAgentEnabled(supabase: any): Promise<boolean> {
  const { data } = await supabase
    .from('system_feature_flags')
    .select('is_enabled, rollout_percentage')
    .eq('feature_name', 'multi_agent_architecture')
    .single();

  if (!data) return false;
  
  // If fully enabled, return true
  if (data.is_enabled) return true;
  
  // If rollout percentage > 0, use random sampling
  if (data.rollout_percentage > 0) {
    return Math.random() * 100 < data.rollout_percentage;
  }
  
  return false;
}

// ============================================================================
// GET SPECIALIST AGENT FOR STAGE (single agent - for check/advance/status)
// ============================================================================

async function getSpecialistForStage(
  supabase: any,
  stage: string
): Promise<{ agent_name: string; target_stage: string; available_tools: string[]; email_types: string[] } | null> {
  // Get primary agent (lowest priority) for single-agent operations
  const { data: agents, error } = await supabase
    .from('agent_specialists')
    .select('agent_name, target_stage, available_tools, email_types')
    .eq('handles_stage', stage)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error(`[pipeline-stage-controller] Error fetching specialist for stage ${stage}:`, error);
    return null;
  }

  return agents && agents.length > 0 ? agents[0] : null;
}

// ============================================================================
// GET ALL SPECIALISTS FOR STAGE (multi-agent orchestration)
// ============================================================================

interface SpecialistAgent {
  agent_name: string;
  target_stage: string;
  available_tools: string[];
  email_types: string[];
  priority: number;
}

async function getAllSpecialistsForStage(
  supabase: any,
  stage: string
): Promise<SpecialistAgent[]> {
  const { data: agents, error } = await supabase
    .from('agent_specialists')
    .select('agent_name, target_stage, available_tools, email_types, priority')
    .eq('handles_stage', stage)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[pipeline-stage-controller] Error fetching specialists for stage ${stage}:`, error);
    return [];
  }

  return agents || [];
}

// ============================================================================
// CHECK IF AGENT-PLANNING SHOULD RUN
// ============================================================================

interface PlanningEligibility {
  eligible: boolean;
  reason: string;
  details: {
    has_cv: boolean;
    has_diploma: boolean;
    diploma_verified: boolean;
    completeness_score: number;
    interview_already_scheduled: boolean;
    slots_already_proposed: boolean;
  };
}

async function checkPlanningAgentEligibility(
  supabase: any,
  applicationId: string,
  app: any
): Promise<PlanningEligibility> {
  // Check documents in application_documents table
  const { data: docs } = await supabase
    .from('application_documents')
    .select('document_type, is_verified')
    .eq('application_id', applicationId);

  const hasCV = docs?.some((d: any) => d.document_type === 'cv') || false;
  const hasDiploma = docs?.some((d: any) => d.document_type === 'diploma') || false;
  const diplomaVerified = docs?.some((d: any) => d.document_type === 'diploma' && d.is_verified) || false;
  const completenessScore = app.completeness_score || 0;
  const interviewAlreadyScheduled = !!app.gesprek_datum;

  // Check if interview slots were already proposed (via application_conversations or notifications)
  const { data: slotsProposed } = await supabase
    .from('application_conversations')
    .select('id')
    .eq('application_id', applicationId)
    .eq('role', 'agent-planning')
    .limit(1);

  const slotsAlreadyProposed = (slotsProposed?.length || 0) > 0;

  const details = {
    has_cv: hasCV,
    has_diploma: hasDiploma,
    diploma_verified: diplomaVerified,
    completeness_score: completenessScore,
    interview_already_scheduled: interviewAlreadyScheduled,
    slots_already_proposed: slotsAlreadyProposed
  };

  // Determine eligibility
  if (interviewAlreadyScheduled) {
    return { eligible: false, reason: 'Interview al gepland', details };
  }

  if (slotsAlreadyProposed) {
    return { eligible: false, reason: 'Interview slots al voorgesteld', details };
  }

  if (!hasCV) {
    return { eligible: false, reason: 'CV ontbreekt', details };
  }

  if (!hasDiploma) {
    return { eligible: false, reason: 'Diploma ontbreekt', details };
  }

  if (!diplomaVerified) {
    return { eligible: false, reason: 'Diploma nog niet geverifieerd', details };
  }

  if (completenessScore < 70) {
    return { eligible: false, reason: `Compleetheid te laag (${completenessScore}% < 70%)`, details };
  }

  return { eligible: true, reason: 'Alle voorwaarden voldaan', details };
}

// ============================================================================
// LOG AUDIT TRAIL
// ============================================================================

async function logAudit(
  supabase: any,
  applicationId: string,
  triggerSource: string,
  action: object,
  executionTimeMs: number
) {
  try {
    await supabase.from('migration_audit_log').insert({
      application_id: applicationId,
      trigger_source: triggerSource,
      new_system_action: action,
      execution_time_ms: executionTimeMs,
      matched: true
    });
  } catch (e) {
    console.error('[pipeline-stage-controller] Failed to log audit:', e);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[pipeline-stage-controller] 🚀 Function invoked at ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { action, application_id, trigger, trigger_source, force_legacy } = body;

    console.log(`[pipeline-stage-controller] 📋 Action: ${action}, Application: ${application_id}, Trigger: ${trigger}, Source: ${trigger_source || 'unknown'}`);
    
    // Log invocation for observability (non-blocking)
    supabase.from('function_call_logs').insert({
      function_name: 'pipeline-stage-controller',
      org_id: null,
      execution_time_ms: 0,
      success: true,
      metadata: {
        action,
        application_id,
        trigger,
        trigger_source: trigger_source || 'unknown',
        invocation_time: new Date().toISOString()
      }
    });

    // Validate required fields
    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get application data
    const { data: app, error: appError } = await supabase
      .from('professional_applications')
      .select('id, pipeline_stage, welcome_email_sent_at, completeness_score, gesprek_datum, gesprek_feedback, vog_validation_status, org_id, extracted_data, email_from')
      .eq('id', application_id)
      .single();

    if (appError || !app) {
      return new Response(
        JSON.stringify({ error: "Application not found", details: appError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if multi-agent architecture is enabled
    const multiAgentEnabled = !force_legacy && await isMultiAgentEnabled(supabase);

    switch (action) {
      // =====================================================================
      // ACTION: CHECK - Validate if a transition is possible
      // =====================================================================
      case 'check': {
        const specialist = await getSpecialistForStage(supabase, app.pipeline_stage);
        
        if (!specialist) {
          return new Response(
            JSON.stringify({ 
              allowed: false, 
              blockers: [`Geen specialist agent gevonden voor stage: ${app.pipeline_stage}`],
              current_stage: app.pipeline_stage
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const result = await checkTransitionRequirements(
          supabase, 
          app, 
          app.pipeline_stage, 
          specialist.target_stage
        );

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =====================================================================
      // ACTION: ADVANCE - Execute stage transition with strict validation
      // =====================================================================
      case 'advance': {
        const specialist = await getSpecialistForStage(supabase, app.pipeline_stage);
        
        if (!specialist) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Geen specialist agent voor stage: ${app.pipeline_stage}`,
              current_stage: app.pipeline_stage
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate transition requirements
        const validation = await checkTransitionRequirements(
          supabase, 
          app, 
          app.pipeline_stage, 
          specialist.target_stage
        );

        if (!validation.allowed) {
          console.log(`[pipeline-stage-controller] Transition blocked: ${validation.blockers.join(', ')}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              blockers: validation.blockers,
              current_stage: app.pipeline_stage,
              target_stage: specialist.target_stage
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Execute transition
        const { error: updateError } = await supabase
          .from('professional_applications')
          .update({ 
            pipeline_stage: specialist.target_stage,
            updated_at: new Date().toISOString()
          })
          .eq('id', application_id);

        if (updateError) {
          console.error('[pipeline-stage-controller] Update error:', updateError);
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log audit trail
        await logAudit(supabase, application_id, trigger_source || 'advance', {
          action: 'stage_transition',
          from_stage: app.pipeline_stage,
          to_stage: specialist.target_stage,
          multi_agent_enabled: multiAgentEnabled
        }, Date.now() - startTime);

        console.log(`[pipeline-stage-controller] ✅ Transition successful: ${app.pipeline_stage} → ${specialist.target_stage}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            previous_stage: app.pipeline_stage,
            new_stage: specialist.target_stage
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =====================================================================
      // ACTION: ROUTE - Route to the correct specialist agent(s)
      // v1.5.0: Multi-Agent Orchestration - calls ALL agents for a stage sequentially
      // =====================================================================
      case 'route': {
        if (!multiAgentEnabled) {
          // Fallback to legacy system
          console.log('[pipeline-stage-controller] Multi-agent disabled, routing to legacy ai-agent-orchestrator');
          
          const { data: legacyResult, error: legacyError } = await supabase.functions.invoke('ai-agent-orchestrator', {
            body: {
              action: 'process_single_goal',
              application_id,
              trigger,
              context: body.context || {}
            }
          });

          return new Response(
            JSON.stringify({ 
              routed_to: 'legacy',
              result: legacyResult,
              error: legacyError
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // v1.5.0: Get ALL specialists for current stage (multi-agent orchestration)
        const specialists = await getAllSpecialistsForStage(supabase, app.pipeline_stage);
        
        if (specialists.length === 0) {
          console.log(`[pipeline-stage-controller] No specialists for stage: ${app.pipeline_stage}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Geen specialist voor stage: ${app.pipeline_stage}` 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[pipeline-stage-controller] v1.5.0 Multi-Agent: Found ${specialists.length} agents for stage ${app.pipeline_stage}`);

        // v1.3.0: ALWAYS enrich context from agent_goals for rejection_context and other data
        let enrichedContext = body.context || {};
        
        // Fetch most recent goal with context data for this application
        console.log(`[pipeline-stage-controller] v1.3.0: Fetching enriched context for application ${application_id}`);
        
        const { data: recentGoal } = await supabase
          .from('agent_goals')
          .select('input_data, goal_type, created_at')
          .eq('goal_type', 'send_reply_response')
          .or(`input_data->>application_id.eq.${application_id},input_data->context->>application_id.eq.${application_id}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (recentGoal?.input_data) {
          console.log(`[pipeline-stage-controller] Found goal context from ${recentGoal.created_at}`);
          const goalData = recentGoal.input_data;
          
          enrichedContext = {
            ...enrichedContext,
            rejection_context: goalData.rejection_context && Object.keys(goalData.rejection_context).length > 0 
              ? goalData.rejection_context 
              : (enrichedContext.rejection_context || {}),
            newly_extracted_data: goalData.newly_extracted_data || enrichedContext.newly_extracted_data || {},
            remaining_missing_info: goalData.remaining_missing_info || enrichedContext.remaining_missing_info || [],
            document_statuses: goalData.document_statuses || enrichedContext.document_statuses || {},
          };
        } else {
          enrichedContext = {
            ...enrichedContext,
            rejection_context: enrichedContext.rejection_context || {},
            newly_extracted_data: enrichedContext.newly_extracted_data || {},
            remaining_missing_info: enrichedContext.remaining_missing_info || [],
            document_statuses: enrichedContext.document_statuses || {},
          };
        }
        
        // v1.3.0: Query application_documents for recently uploaded docs (last 15 minutes)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentDocs } = await supabase
          .from('application_documents')
          .select('document_type, filename, is_verified, created_at')
          .eq('application_id', application_id)
          .gte('created_at', fifteenMinutesAgo)
          .order('created_at', { ascending: false });
        
        if (recentDocs && recentDocs.length > 0) {
          const documentsReceived = recentDocs.map((d: any) => {
            const type = d.document_type || d.filename?.toLowerCase();
            if (type?.includes('diploma')) return d.is_verified ? 'Diploma (geverifieerd ✓)' : 'Diploma';
            if (type?.includes('cv')) return 'CV';
            if (type?.includes('vog')) return d.is_verified ? 'VOG (geverifieerd ✓)' : 'VOG (in behandeling)';
            return d.filename || 'Document';
          });
          
          enrichedContext.documents_received = documentsReceived;
          console.log(`[pipeline-stage-controller] Added recent docs to context: ${documentsReceived.join(', ')}`);
        }

        // v1.5.0: Execute ALL agents sequentially with conditional logic
        const agentResults: Record<string, any> = {};
        let stageAdvanced = false;

        for (const specialist of specialists) {
          console.log(`[pipeline-stage-controller] Processing agent: ${specialist.agent_name} (priority: ${specialist.priority})`);
          
          // v1.5.0: Conditional logic for agent-planning
          if (specialist.agent_name === 'planning') {
            const eligibility = await checkPlanningAgentEligibility(supabase, application_id, app);
            
            if (!eligibility.eligible) {
              console.log(`[pipeline-stage-controller] ⏭️ Skipping agent-planning: ${eligibility.reason}`);
              agentResults['planning'] = { 
                skipped: true, 
                reason: eligibility.reason,
                details: eligibility.details
              };
              continue;
            }
            
            console.log(`[pipeline-stage-controller] ✅ agent-planning eligible: ${eligibility.reason}`);
          }

          // Invoke the specialist agent
          console.log(`[pipeline-stage-controller] 🚀 Invoking agent-${specialist.agent_name}`);
          
          const { data: specialistResult, error: specialistError } = await supabase.functions.invoke(`agent-${specialist.agent_name}`, {
            body: {
              application_id,
              application: app,
              trigger,
              allowed_tools: specialist.available_tools,
              allowed_email_types: specialist.email_types,
              target_stage: specialist.target_stage,
              context: enrichedContext,
              extracted_data: body.extracted_data || {},
              documents: body.documents || []
            }
          });

          if (specialistError) {
            console.error(`[pipeline-stage-controller] Agent ${specialist.agent_name} error:`, specialistError);
            agentResults[specialist.agent_name] = { 
              success: false, 
              error: specialistError.message 
            };
            // Continue to next agent even if one fails
            continue;
          }

          agentResults[specialist.agent_name] = { 
            success: true, 
            result: specialistResult 
          };

          // If this agent completed its task and stage transition is allowed, advance
          if (specialistResult?.stage_completed && !stageAdvanced) {
            console.log(`[pipeline-stage-controller] Agent ${specialist.agent_name} completed, checking transition`);
            
            // Refresh app data after agent execution
            const { data: refreshedApp } = await supabase
              .from('professional_applications')
              .select('completeness_score, gesprek_datum, gesprek_feedback, vog_validation_status')
              .eq('id', application_id)
              .single();
            
            const mergedApp = { ...app, ...refreshedApp, ...specialistResult.updated_fields };
            
            const advanceResult = await checkTransitionRequirements(
              supabase,
              mergedApp,
              app.pipeline_stage,
              specialist.target_stage
            );

            if (advanceResult.allowed) {
              const { error: updateError } = await supabase
                .from('professional_applications')
                .update({ 
                  pipeline_stage: specialist.target_stage,
                  updated_at: new Date().toISOString()
                })
                .eq('id', application_id);

              if (!updateError) {
                stageAdvanced = true;
                console.log(`[pipeline-stage-controller] ✅ Auto-advanced: ${app.pipeline_stage} → ${specialist.target_stage}`);
                agentResults[specialist.agent_name].stage_advanced = {
                  from: app.pipeline_stage,
                  to: specialist.target_stage
                };
              }
            }
          }
        }

        // Log audit trail
        await logAudit(supabase, application_id, trigger_source || trigger, {
          action: 'multi_agent_route',
          agents_executed: Object.keys(agentResults),
          stage: app.pipeline_stage,
          stage_advanced: stageAdvanced,
          results_summary: Object.entries(agentResults).map(([name, result]) => ({
            agent: name,
            success: result.success ?? false,
            skipped: result.skipped ?? false
          }))
        }, Date.now() - startTime);

        return new Response(
          JSON.stringify({ 
            success: true, 
            multi_agent: true,
            stage: app.pipeline_stage,
            agents_executed: agentResults,
            stage_advanced: stageAdvanced
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =====================================================================
      // ACTION: STATUS - Get current pipeline status and blockers
      // =====================================================================
      case 'status': {
        const specialist = await getSpecialistForStage(supabase, app.pipeline_stage);
        
        let nextTransitionStatus: TransitionResult | null = null;
        if (specialist) {
          nextTransitionStatus = await checkTransitionRequirements(
            supabase,
            app,
            app.pipeline_stage,
            specialist.target_stage
          );
        }

        // Get documents summary
        const { data: docs } = await supabase
          .from('application_documents')
          .select('document_type, is_verified, filename')
          .eq('application_id', application_id);

        return new Response(
          JSON.stringify({
            application_id,
            current_stage: app.pipeline_stage,
            stage_index: PIPELINE_STAGES.indexOf(app.pipeline_stage as PipelineStage),
            total_stages: PIPELINE_STAGES.length,
            specialist_agent: specialist?.agent_name || null,
            target_stage: specialist?.target_stage || null,
            transition_status: nextTransitionStatus,
            documents: docs || [],
            multi_agent_enabled: multiAgentEnabled
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =====================================================================
      // ACTION: CHECK_FASE1 - Validate Fase 1 requirements and auto-advance
      // v1.4.0: Called after DUO verification to check if ready for intake_verstuurd
      // =====================================================================
      case 'check_fase1': {
        console.log(`[pipeline-stage-controller] v1.4.0 check_fase1 for application ${application_id}`);
        
        // Only process if still in 'nieuw' stage
        if (app.pipeline_stage !== 'nieuw') {
          console.log(`[pipeline-stage-controller] Application not in 'nieuw' stage (${app.pipeline_stage}), skipping check_fase1`);
          return new Response(
            JSON.stringify({
              success: false,
              action: 'check_fase1_skipped',
              reason: `Application in stage '${app.pipeline_stage}', not 'nieuw'`,
              current_stage: app.pipeline_stage
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Fetch document counts from application_documents table
        const { data: docCounts } = await supabase
          .from('application_documents')
          .select('document_type, is_verified, filename')
          .eq('application_id', application_id);
        
        const documents = (docCounts || []) as DocumentData[];
        
        const hasCV = documents.some(d => 
          d.document_type === 'cv' || 
          d.filename?.toLowerCase().includes('cv') ||
          d.filename?.toLowerCase().includes('curriculum')
        );
        
        const diplomaDoc = documents.find(d => 
          d.document_type === 'diploma' || 
          d.filename?.toLowerCase().includes('diploma')
        );
        const hasDiploma = !!diplomaDoc;
        const diplomaVerified = diplomaDoc?.is_verified === true;
        
        // Fetch welcome email status and completeness
        const welcomeSent = !!app.welcome_email_sent_at;
        const completeness = app.completeness_score ?? 0;
        
        // Check all Fase 1 requirements
        const fase1Requirements = {
          welcome_email: welcomeSent,
          cv_registered: hasCV,
          diploma_registered: hasDiploma,
          diploma_verified: diplomaVerified,
          completeness_threshold: completeness >= 70
        };
        
        const allMet = Object.values(fase1Requirements).every(v => v === true);
        const blockers = Object.entries(fase1Requirements)
          .filter(([_, met]) => !met)
          .map(([req]) => req);
        
        console.log(`[pipeline-stage-controller] Fase 1 requirements:`, JSON.stringify(fase1Requirements));
        console.log(`[pipeline-stage-controller] All met: ${allMet}, Blockers: ${blockers.join(', ')}`);
        
        if (allMet) {
          // Advance to intake_verstuurd
          const { error: advanceError } = await supabase
            .from('professional_applications')
            .update({
              pipeline_stage: 'intake_verstuurd',
              updated_at: new Date().toISOString()
            })
            .eq('id', application_id);
          
          if (advanceError) {
            console.error('[pipeline-stage-controller] Fase 1 advance error:', advanceError);
            return new Response(
              JSON.stringify({
                success: false,
                action: 'check_fase1',
                error: advanceError.message
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          // Log the transition
          await supabase.from('system_events').insert({
            event_type: 'fase1_completed',
            entity_type: 'application',
            entity_id: application_id,
            org_id: app.org_id,
            event_data: {
              from_stage: 'nieuw',
              to_stage: 'intake_verstuurd',
              requirements_met: fase1Requirements,
              trigger: trigger,
              source: trigger_source || 'check_fase1'
            },
            metadata: {}
          });
          
          // Log audit trail
          await logAudit(supabase, application_id, trigger_source || 'check_fase1', {
            action: 'fase1_advanced',
            from_stage: 'nieuw',
            to_stage: 'intake_verstuurd',
            requirements: fase1Requirements
          }, Date.now() - startTime);
          
          console.log(`✅ [pipeline-stage-controller] Fase 1 completed: nieuw → intake_verstuurd`);
          
          return new Response(
            JSON.stringify({
              success: true,
              action: 'fase1_advanced',
              from_stage: 'nieuw',
              to_stage: 'intake_verstuurd',
              requirements: fase1Requirements
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            action: 'fase1_not_ready',
            current_stage: app.pipeline_stage,
            requirements: fase1Requirements,
            blockers: blockers
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Valid actions: check, advance, route, status, check_fase1` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error('[pipeline-stage-controller] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
