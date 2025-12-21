import { createAdminClient, corsHeaders, jsonResponse, errorResponse, handleCors, logInfo, logSuccess, logError, logWarning } from '../_shared/core.ts';

/**
 * auto-send-interview-slots
 * 
 * Centrale functie voor automatische interview slot verzending.
 * 
 * Features:
 * - Configureerbare threshold (default 85%)
 * - Controleert interview_status voordat slots worden gestuurd
 * - Support voor alternative slots bij afwijzing
 * - Kan getriggerd worden vanuit:
 *   - process-application-email (bij nieuwe sollicitatie >= threshold)
 *   - handle-application-reply (na reply met nieuwe data >= threshold)
 *   - Database trigger (bij score update)
 */

interface AutoInterviewRequest {
  application_id: string;
  trigger_source: 'initial_application' | 'reply_update' | 'manual' | 'alternative_request';
  force?: boolean; // Skip status checks (for alternative slots)
  alternative_attempt?: number; // Track alternative slot attempts
}

// Configuratie via environment variables
const INTERVIEW_THRESHOLD = parseInt(Deno.env.get('INTERVIEW_THRESHOLD') || '85');
const MAX_ALTERNATIVE_REQUESTS = parseInt(Deno.env.get('MAX_ALTERNATIVE_REQUESTS') || '2');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();
    const body: AutoInterviewRequest = await req.json();
    const { 
      application_id, 
      trigger_source = 'manual',
      force = false,
      alternative_attempt = 0
    } = body;

    if (!application_id) {
      return errorResponse('application_id is required', 400);
    }

    logInfo('AutoSendInterviewSlots', `Processing request`, { 
      application_id, 
      trigger_source,
      threshold: INTERVIEW_THRESHOLD
    });

    // Fetch application details
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, name, email, completeness_score, interview_status, pipeline_stage, extracted_data, assigned_organization, org_id')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      logError('AutoSendInterviewSlots', 'Application not found', appError);
      return errorResponse(`Application not found: ${appError?.message}`, 404);
    }

    const extractedData = application.extracted_data as Record<string, unknown> || {};
    const currentInterviewStatus = application.interview_status || extractedData.interview_status as string || null;
    const completenessScore = application.completeness_score || 0;
    const pipelineStage = application.pipeline_stage || 'nieuw';

    // Track alternative request count from extracted_data
    const currentAltCount = (extractedData.interview_alternative_request_count as number) || 0;
    const effectiveAltAttempt = alternative_attempt || currentAltCount;

    logInfo('AutoSendInterviewSlots', 'Application state', {
      completeness_score: completenessScore,
      threshold: INTERVIEW_THRESHOLD,
      current_interview_status: currentInterviewStatus,
      pipeline_stage: pipelineStage,
      alternative_attempt: effectiveAltAttempt,
      force
    });

    // ================================================================
    // VALIDATION CHECKS (skip if force=true for alternative slots)
    // ================================================================
    
    if (!force) {
      // Check 1: Completeness threshold
      if (completenessScore < INTERVIEW_THRESHOLD) {
        logWarning('AutoSendInterviewSlots', `Completeness ${completenessScore}% below threshold ${INTERVIEW_THRESHOLD}%`);
        return jsonResponse({
          success: false,
          reason: 'below_threshold',
          completeness_score: completenessScore,
          threshold: INTERVIEW_THRESHOLD,
          message: `Completeness score ${completenessScore}% is below threshold ${INTERVIEW_THRESHOLD}%`
        });
      }

      // Check 2: Interview status - prevent duplicate slot emails
      const skipStatuses = ['slots_offered', 'alternative_slots_offered', 'scheduled', 'confirmed'];
      if (currentInterviewStatus && skipStatuses.includes(currentInterviewStatus)) {
        logWarning('AutoSendInterviewSlots', `Interview already in progress: ${currentInterviewStatus}`);
        return jsonResponse({
          success: false,
          reason: 'already_in_progress',
          interview_status: currentInterviewStatus,
          message: `Interview flow already active with status: ${currentInterviewStatus}`
        });
      }

      // Check 3: Pipeline stage - only process 'nieuw' or 'screening' applications
      const validStages = ['nieuw', 'screening'];
      if (!validStages.includes(pipelineStage)) {
        logWarning('AutoSendInterviewSlots', `Invalid pipeline stage for auto-interview: ${pipelineStage}`);
        return jsonResponse({
          success: false,
          reason: 'invalid_stage',
          pipeline_stage: pipelineStage,
          message: `Application not in valid stage for auto-interview`
        });
      }
    }

    // ================================================================
    // ALTERNATIVE SLOTS: Check max attempts
    // ================================================================
    
    if (trigger_source === 'alternative_request') {
      if (effectiveAltAttempt >= MAX_ALTERNATIVE_REQUESTS) {
        logWarning('AutoSendInterviewSlots', `Max alternative requests reached: ${effectiveAltAttempt}/${MAX_ALTERNATIVE_REQUESTS}`);
        
        // Create manual intervention goal
        await supabase.from('agent_goals').insert({
          org_id: application.org_id || application.assigned_organization,
          goal_type: 'manual_interview_scheduling',
          goal_description: `Handmatige interview planning nodig voor ${application.name || extractedData.naam}`,
          priority: 100,
          input_data: {
            application_id: application_id,
            reason: 'max_alternative_requests_exceeded',
            alternative_attempts: effectiveAltAttempt,
            candidate_name: application.name || extractedData.naam,
            candidate_email: application.email || extractedData.email,
          },
          status: 'pending'
        });

        // Update application status
        await supabase
          .from('professional_applications')
          .update({
            interview_status: 'awaiting_manual_intervention',
            extracted_data: {
              ...extractedData,
              interview_alternative_request_count: effectiveAltAttempt,
              interview_awaiting_manual_since: new Date().toISOString()
            }
          })
          .eq('id', application_id);

        return jsonResponse({
          success: false,
          reason: 'max_alternatives_exceeded',
          alternative_attempts: effectiveAltAttempt,
          max_attempts: MAX_ALTERNATIVE_REQUESTS,
          message: 'Max alternative slot requests exceeded, manual intervention required',
          goal_created: true
        });
      }
    }

    // ================================================================
    // SEND INTERVIEW SLOTS via schedule-interview
    // ================================================================
    
    logInfo('AutoSendInterviewSlots', 'Invoking schedule-interview', { application_id });

    const isAlternative = trigger_source === 'alternative_request';
    
    const { data: scheduleResult, error: scheduleError } = await supabase.functions.invoke('schedule-interview', {
      body: {
        action: isAlternative ? 'request_alternative_availability' : 'request_availability',
        application_id: application_id,
        interview_type: 'video',
        alternative_attempt: isAlternative ? effectiveAltAttempt + 1 : 0,
      }
    });

    if (scheduleError) {
      logError('AutoSendInterviewSlots', 'schedule-interview failed', scheduleError);
      return errorResponse(`Failed to send interview slots: ${scheduleError.message}`, 500);
    }

    // ================================================================
    // UPDATE APPLICATION STATUS
    // ================================================================
    
    const newStatus = isAlternative ? 'alternative_slots_offered' : 'slots_offered';
    const newAltCount = isAlternative ? effectiveAltAttempt + 1 : 0;
    
    await supabase
      .from('professional_applications')
      .update({
        interview_status: newStatus,
        updated_at: new Date().toISOString(),
        extracted_data: {
          ...extractedData,
          interview_alternative_request_count: newAltCount,
          [`interview_${newStatus}_at`]: new Date().toISOString(),
          interview_trigger_source: trigger_source,
        }
      })
      .eq('id', application_id);

    // Log system event
    await supabase.from('system_events').insert({
      event_type: isAlternative ? 'interview_alternative_slots_sent' : 'interview_slots_auto_sent',
      entity_type: 'professional_application',
      entity_id: application_id,
      event_data: {
        trigger_source,
        completeness_score: completenessScore,
        threshold: INTERVIEW_THRESHOLD,
        alternative_attempt: newAltCount,
        interview_status: newStatus,
      },
      org_id: application.org_id || application.assigned_organization,
    });

    logSuccess('AutoSendInterviewSlots', 'Interview slots sent successfully', {
      application_id,
      status: newStatus,
      alternative_attempt: newAltCount,
      trigger_source
    });

    return jsonResponse({
      success: true,
      action: isAlternative ? 'alternative_slots_sent' : 'slots_sent',
      interview_status: newStatus,
      completeness_score: completenessScore,
      threshold: INTERVIEW_THRESHOLD,
      alternative_attempt: newAltCount,
      schedule_result: scheduleResult,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('AutoSendInterviewSlots', 'Unexpected error', error);
    return errorResponse(`Unexpected error: ${errorMessage}`, 500);
  }
});
