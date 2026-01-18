/**
 * Pipeline Stage Controller v1.0.0
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
  switch (`${fromStage}→${toStage}`) {
    case 'nieuw→intake_verstuurd':
      if (!app.welcome_email_sent_at) {
        blockers.push('Welkomstmail niet verstuurd (welcome_email_sent_at is null)');
      }
      break;

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
// GET SPECIALIST AGENT FOR STAGE
// ============================================================================

async function getSpecialistForStage(
  supabase: any,
  stage: string
): Promise<{ agent_name: string; target_stage: string; available_tools: string[]; email_types: string[] } | null> {
  const { data } = await supabase
    .from('agent_specialists')
    .select('agent_name, target_stage, available_tools, email_types')
    .eq('handles_stage', stage)
    .eq('is_active', true)
    .single();

  return data;
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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { action, application_id, trigger, trigger_source, force_legacy } = body;

    console.log(`[pipeline-stage-controller] Action: ${action}, Application: ${application_id}, Trigger: ${trigger}`);

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
      // ACTION: ROUTE - Route to the correct specialist agent
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

        // Get specialist for current stage
        const specialist = await getSpecialistForStage(supabase, app.pipeline_stage);
        
        if (!specialist) {
          console.log(`[pipeline-stage-controller] No specialist for stage: ${app.pipeline_stage}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Geen specialist voor stage: ${app.pipeline_stage}` 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[pipeline-stage-controller] Routing to agent-${specialist.agent_name}`);

        // Invoke specialist agent
        const { data: specialistResult, error: specialistError } = await supabase.functions.invoke(`agent-${specialist.agent_name}`, {
          body: {
            application_id,
            application: app,
            trigger,
            allowed_tools: specialist.available_tools,
            allowed_email_types: specialist.email_types,
            target_stage: specialist.target_stage,
            context: body.context || {},
            extracted_data: body.extracted_data || {},
            documents: body.documents || []
          }
        });

        if (specialistError) {
          console.error(`[pipeline-stage-controller] Specialist error:`, specialistError);
          
          // Log failure
          await logAudit(supabase, application_id, trigger_source || trigger, {
            action: 'route_failed',
            agent: specialist.agent_name,
            error: specialistError.message
          }, Date.now() - startTime);

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: specialistError.message,
              agent: specialist.agent_name
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log success
        await logAudit(supabase, application_id, trigger_source || trigger, {
          action: 'route_success',
          agent: specialist.agent_name,
          result: specialistResult
        }, Date.now() - startTime);

        // If specialist completed its task, try to advance to next stage
        if (specialistResult?.stage_completed) {
          console.log(`[pipeline-stage-controller] Agent ${specialist.agent_name} completed, attempting advance`);
          
          const advanceResult = await checkTransitionRequirements(
            supabase,
            { ...app, ...specialistResult.updated_fields },
            app.pipeline_stage,
            specialist.target_stage
          );

          if (advanceResult.allowed) {
            await supabase
              .from('professional_applications')
              .update({ 
                pipeline_stage: specialist.target_stage,
                updated_at: new Date().toISOString()
              })
              .eq('id', application_id);

            console.log(`[pipeline-stage-controller] ✅ Auto-advanced: ${app.pipeline_stage} → ${specialist.target_stage}`);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            routed_to: specialist.agent_name,
            result: specialistResult
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

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Valid actions: check, advance, route, status` }),
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
