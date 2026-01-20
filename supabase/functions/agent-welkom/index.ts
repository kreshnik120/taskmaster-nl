/**
 * Agent Welkom v1.0.0
 * ===================
 * Specialist agent for the 'nieuw' stage.
 * Handles: nieuw → intake_verstuurd
 * 
 * Responsibilities:
 * - Send professional welcome email to new applicants
 * - Request missing information (CV, diploma if not present)
 * - Update welcome_email_sent_at timestamp (CRITICAL FIX)
 * 
 * This agent does NOTHING else:
 * - No document verification (Document Agent)
 * - No interview scheduling (Planning Agent)
 * - No VOG requests (Screening Agent)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Focused system prompt - 40 lines vs 196 in react-agent
const WELKOM_AGENT_PROMPT = `Je bent de Welkom Agent voor CitoZorg/ABCzorg recruitmentbureau.

## JOUW ENIGE TAAK
Stuur een professionele, warme welkomstmail naar nieuwe sollicitanten en vraag om ontbrekende informatie.

## STAGE TRANSITIE
Na het succesvol versturen van de welkomstmail: nieuw → intake_verstuurd

## BESCHIKBARE EMAIL TYPES
- welcome: Korte welkomst zonder intake vragen
- welcome_intake: Welkomst met intake vragen (standaard)

## WAT JE MOET DOEN
1. Analyseer de sollicitatie gegevens
2. Bepaal welke informatie ontbreekt (CV, diploma, werkervaring, beschikbaarheid)
3. Stuur een gepersonaliseerde welkomstmail met intake vragen

## WAT JE NIET DOET
- Geen documenten verifiëren (dat doet de Document Agent)
- Geen gesprekken plannen (dat doet de Planning Agent)
- Geen VOG aanvragen (dat doet de Screening Agent)
- Geen stage updates uitvoeren (dat doet de Pipeline Controller)

## TOON EN STIJL
- Professioneel maar warm en persoonlijk
- Noem de kandidaat bij voornaam
- Wees enthousiast over hun sollicitatie
- Maak duidelijk wat de volgende stappen zijn`;

interface ApplicationData {
  id: string;
  extracted_data: { naam?: string; functie?: string; regio?: string } | null;
  email_from: string | null;
  pipeline_stage: string;
  org_id: string;
  cv_file_path: string | null;
  diploma_file_path: string | null;
  completeness_score: number | null;
  raw_email_content: string | null;
  functie_interesse: string | null;
  regio_voorkeur: string | null;
}

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
      application,
      trigger,
      allowed_email_types = ['welcome', 'welcome_intake'],
      target_stage
    } = body;

    console.log(`[agent-welkom] Processing application: ${application_id}, trigger: ${trigger}`);

    // Validate we're in the correct stage
    if (application?.pipeline_stage !== 'nieuw') {
      console.log(`[agent-welkom] Wrong stage: ${application?.pipeline_stage}, expected: nieuw`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent Welkom handles 'nieuw' stage only, current: ${application?.pipeline_stage}`,
          stage_completed: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get full application data if not provided
    let app: ApplicationData = application;
    if (!app || !app.extracted_data?.naam) {
      const { data, error } = await supabase
        .from('professional_applications')
        .select('*')
        .eq('id', application_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ success: false, error: 'Application not found' }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      app = data;
    }

    // Determine what's missing
    const missingInfo: string[] = [];
    if (!app.cv_file_path) missingInfo.push('CV');
    if (!app.diploma_file_path) missingInfo.push('Diploma');
    if (!app.functie_interesse) missingInfo.push('Functie interesse');
    if (!app.regio_voorkeur) missingInfo.push('Regio voorkeur');

    // Determine email type
    const emailType = missingInfo.length > 0 ? 'welcome_intake' : 'welcome';

    // Validate email type is allowed
    if (!allowed_email_types.includes(emailType)) {
      console.log(`[agent-welkom] Email type ${emailType} not in allowed types: ${allowed_email_types}`);
    }

    // Extract candidate name from extracted_data
    const candidateName = app.extracted_data?.naam || null;
    const firstName = candidateName?.split(' ')[0] || 'daar';

    console.log(`[agent-welkom] Sending ${emailType} email to ${app.email_from}, missing: ${missingInfo.join(', ')}`);

    // Call send-ai-email
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-ai-email', {
      body: {
        application_id: app.id,
        email_type: emailType,
        recipient_email: app.email_from,
        recipient_name: candidateName,
        context: {
          candidate_name: candidateName,
          first_name: firstName,
          missing_info: missingInfo,
          functie_interesse: app.functie_interesse,
          regio_voorkeur: app.regio_voorkeur,
          has_cv: !!app.cv_file_path,
          has_diploma: !!app.diploma_file_path,
          completeness_score: app.completeness_score || 0,
          agent: 'welkom'
        }
      }
    });

    if (emailError) {
      console.error('[agent-welkom] Email error:', emailError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to send email: ${emailError.message}`,
          stage_completed: false
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL FIX: Update welcome_email_sent_at timestamp
    // This was missing in the original system!
    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({ 
        welcome_email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', app.id);

    if (updateError) {
      console.error('[agent-welkom] Failed to update welcome_email_sent_at:', updateError);
    } else {
      console.log('[agent-welkom] ✅ Updated welcome_email_sent_at');
    }

    // Log to function_call_logs for AI System Health Dashboard monitoring
    await supabase.from('function_call_logs').insert({
      function_name: 'agent-welkom',
      org_id: app.org_id,
      execution_time_ms: Date.now() - startTime,
      success: true,
      metadata: {
        application_id: app.id,
        email_type: emailType,
        missing_info: missingInfo,
        candidate_name: candidateName,
        pipeline_stage: 'nieuw',
        target_stage: 'intake_verstuurd'
      }
    });

    // Log to application_conversations for audit trail
    await supabase.from('application_conversations').insert({
      application_id: app.id,
      role: 'agent',
      content: `[Agent Welkom] Welkomstmail verstuurd (${emailType}). Ontbrekende info: ${missingInfo.join(', ') || 'geen'}`,
      metadata: {
        agent: 'welkom',
        email_type: emailType,
        missing_info: missingInfo,
        email_result: emailResult,
        execution_time_ms: Date.now() - startTime
      }
    });

    console.log(`[agent-welkom] ✅ Completed in ${Date.now() - startTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        stage_completed: true, // Signal to controller to advance stage
        email_sent: true,
        email_type: emailType,
        missing_info: missingInfo,
        updated_fields: {
          welcome_email_sent_at: new Date().toISOString()
        },
        execution_time_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[agent-welkom] Error:', error);
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
