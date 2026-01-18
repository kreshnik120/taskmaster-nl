/**
 * Agent Placement v1.0.0
 * ======================
 * Specialist agent for the 'screening' stage.
 * Handles: screening → goedgekeurd
 * 
 * Responsibilities:
 * - Verify VOG is present and valid
 * - Check all required documents are complete
 * - Send approval notification
 * - Prepare for professional creation
 * 
 * IMPORTANT:
 * - This agent requires human approval for stage transition
 * - VOG must be verified before advancement
 * - Final approval creates a professional record
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Focused system prompt
const PLACEMENT_AGENT_PROMPT = `Je bent de Placement Agent voor CitoZorg/ABCzorg recruitmentbureau.

## JOUW ENIGE TAAK
Controleer of alle documenten compleet en geverifieerd zijn voor definitieve goedkeuring.

## STAGE TRANSITIE VEREISTEN
1. VOG aanwezig en geverifieerd
2. Alle verplichte documenten compleet
3. Completeness score >= 95%

## BESCHIKBARE EMAIL TYPES
- approval_notification: Bevestig goedkeuring aan kandidaat

## WAT ER GEBEURT BIJ GOEDKEURING
- Professional record wordt aangemaakt
- Kandidaat krijgt goedkeurings email
- Klaar voor plaatsing bij klant`;

Deno.serve(async (req) => {
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
    const { 
      application_id, 
      trigger,
      allowed_email_types = ['approval_notification']
    } = body;

    console.log(`[agent-placement] Processing application: ${application_id}, trigger: ${trigger}`);

    // Get full application data
    const { data: app, error: appError } = await supabase
      .from('professional_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !app) {
      return new Response(
        JSON.stringify({ success: false, error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate we're in the correct stage
    if (app.pipeline_stage !== 'screening') {
      console.log(`[agent-placement] Wrong stage: ${app.pipeline_stage}, expected: screening`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent Placement handles 'screening' stage only, current: ${app.pipeline_stage}`,
          stage_completed: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all documents
    const { data: docs } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', application_id);

    const documents = docs || [];

    // Check document status
    const hasCV = documents.some(d => d.document_type === 'cv');
    const hasDiploma = documents.some(d => d.document_type === 'diploma');
    const isDiplomaVerified = documents.some(d => d.document_type === 'diploma' && d.is_verified);
    const hasVOG = documents.some(d => d.document_type === 'vog' && d.file_path);
    const isVOGVerified = documents.some(d => d.document_type === 'vog' && d.is_verified);

    // Also check application-level VOG status
    const vogVerified = isVOGVerified || app.vog_validation_status === 'verified';

    console.log(`[agent-placement] Document status - CV: ${hasCV}, Diploma: ${hasDiploma}/${isDiplomaVerified}, VOG: ${hasVOG}/${vogVerified}`);

    // Build blockers list
    const blockers: string[] = [];
    
    if (!hasCV) blockers.push('CV ontbreekt');
    if (!hasDiploma) blockers.push('Diploma ontbreekt');
    if (!isDiplomaVerified) blockers.push('Diploma niet geverifieerd');
    if (!hasVOG) blockers.push('VOG niet aangeleverd');
    if (!vogVerified) blockers.push('VOG niet geverifieerd');
    
    const completeness = app.completeness_score || 0;
    if (completeness < 95) {
      blockers.push(`Completeness score ${completeness}% is lager dan 95%`);
    }

    if (blockers.length > 0) {
      console.log(`[agent-placement] Cannot advance, blockers: ${blockers.join(', ')}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: false,
          blockers,
          document_status: {
            has_cv: hasCV,
            has_diploma: hasDiploma,
            is_diploma_verified: isDiplomaVerified,
            has_vog: hasVOG,
            is_vog_verified: vogVerified,
            completeness_score: completeness
          },
          message: 'Waiting for document completion'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All requirements met - can advance to goedgekeurd
    console.log('[agent-placement] All requirements met, advancing to goedgekeurd');

    // Extract candidate name from extracted_data
    const candidateName = app.extracted_data?.naam || null;
    const firstName = candidateName?.split(' ')[0] || 'daar';

    // Send approval notification email
    const { error: emailError } = await supabase.functions.invoke('send-ai-email', {
      body: {
        application_id: app.id,
        email_type: 'approval_notification',
        recipient_email: app.email_from,
        recipient_name: candidateName,
        context: {
          candidate_name: candidateName,
          first_name: firstName,
          functie_interesse: app.functie_interesse,
          agent: 'placement'
        }
      }
    });

    const emailSent = !emailError;
    if (emailError) {
      console.error('[agent-placement] Failed to send approval email:', emailError);
    }

    // Create notification for recruiter
    await supabase.from('recruiter_notifications').insert({
      org_id: app.org_id,
      type: 'candidate_approved',
      title: 'Kandidaat goedgekeurd',
      message: `${candidateName || 'Kandidaat'} is volledig gescreend en goedgekeurd voor plaatsing.`,
      application_id: app.id,
      is_read: false
    });

    // Log to conversations
    await supabase.from('application_conversations').insert({
      application_id,
      role: 'agent',
      content: `[Agent Placement] Alle documenten compleet en geverifieerd. Kandidaat is goedgekeurd voor plaatsing!`,
      metadata: {
        agent: 'placement',
        documents_verified: true,
        email_sent: emailSent,
        execution_time_ms: Date.now() - startTime
      }
    });

    console.log(`[agent-placement] ✅ Completed in ${Date.now() - startTime}ms, candidate approved`);

    return new Response(
      JSON.stringify({
        success: true,
        stage_completed: true, // Can advance to 'goedgekeurd' stage
        updated_fields: {},
        email_sent: emailSent,
        document_status: {
          has_cv: hasCV,
          has_diploma: hasDiploma,
          is_diploma_verified: isDiplomaVerified,
          has_vog: hasVOG,
          is_vog_verified: vogVerified,
          completeness_score: completeness
        },
        message: 'Candidate approved for placement',
        execution_time_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[agent-placement] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        stage_completed: false
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
