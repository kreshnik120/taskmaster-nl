/**
 * Agent Welkom v1.3.0
 * ===================
 * Specialist agent for the 'nieuw' stage.
 * Handles: nieuw → intake_verstuurd
 * 
 * Responsibilities:
 * - Send professional welcome email to new applicants
 * - Request missing information using DATABASE missing_info (not self-calculated)
 * - Update welcome_email_sent_at timestamp (CRITICAL)
 * 
 * v1.3.0 FIX: 
 * - ALWAYS fetch from database (orchestrator doesn't pass missing_info)
 * - Use template_data instead of context for send-ai-email
 * 
 * v1.2.0 FIX: Use database missing_info array instead of self-calculating
 * 
 * This agent does NOTHING else:
 * - No document verification (Document Agent)
 * - No interview scheduling (Planning Agent)
 * - No VOG requests (Screening Agent)
 */
console.log('[agent-welkom] v1.3.0 BOOTED at', new Date().toISOString());

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
2. Gebruik de missing_info uit de database (niet zelf berekenen!)
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
  missing_info: string[] | null;  // v1.2.0: Added - use this instead of calculating
  werkvorm: string | null;
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

    // v1.3.0 FIX: ALWAYS fetch from database!
    // The orchestrator does NOT pass missing_info in the application object
    console.log('[agent-welkom] v1.3.0: Force fetching from database for missing_info');
    
    const { data: fullApp, error: fetchError } = await supabase
      .from('professional_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (fetchError || !fullApp) {
      console.error('[agent-welkom] Failed to fetch application:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const app: ApplicationData = fullApp;
    console.log(`[agent-welkom] DB fetch complete - missing_info: ${JSON.stringify(app.missing_info)}`);
    console.log(`[agent-welkom] DB fetch complete - werkvorm: ${app.werkvorm}, completeness: ${app.completeness_score}%`);

    // v1.2.0 FIX: Use database missing_info instead of self-calculating
    // The missing_info is pre-calculated by extract-cv-data or the intake system
    const dbMissingInfo = app.missing_info || [];
    
    console.log(`[agent-welkom] Database missing_info: ${JSON.stringify(dbMissingInfo)}`);
    console.log(`[agent-welkom] CV present: ${!!app.cv_file_path}, Diploma present: ${!!app.diploma_file_path}`);
    console.log(`[agent-welkom] Completeness: ${app.completeness_score}%, Werkvorm: ${app.werkvorm}`);

    // Filter for email-relevant items (not technical field names)
    // Convert technical field names to human-readable labels
    const FIELD_LABEL_MAP: Record<string, string> = {
      'kvk_nummer': 'KvK-nummer',
      'iban': 'IBAN rekeningnummer',
      'bedrijfsnaam': 'Bedrijfsnaam',
      'beroepsaansprakelijkheidsverzekering': 'Beroepsaansprakelijkheidsverzekering',
      'vog_upload': 'Verklaring Omtrent Gedrag (VOG)',
      'diploma_upload': 'Diploma',
      'cv_upload': 'CV document',
      'id_bewijs': 'Identiteitsbewijs',
      'big_registratie': 'BIG-registratienummer',
      'rijbewijs': 'Rijbewijs',
      'telefoon': 'Telefoonnummer',
      'geboortedatum': 'Geboortedatum',
      'adres': 'Adresgegevens',
      'postcode': 'Postcode',
      'woonplaats': 'Woonplaats',
      'nationaliteit': 'Nationaliteit',
      'bsn': 'BSN-nummer',
    };

    // Transform database missing_info to readable labels
    const missingInfo: string[] = dbMissingInfo.map((item: string) => {
      // Check if it's a known field
      const lower = item.toLowerCase().replace(/[-_\s]/g, '_');
      return FIELD_LABEL_MAP[lower] || item;
    }).filter((item: string) => {
      // Filter out already-present items (defensive check)
      const lowerItem = item.toLowerCase();
      if (lowerItem.includes('cv') && app.cv_file_path) return false;
      if (lowerItem.includes('diploma') && app.diploma_file_path) return false;
      return true;
    });

    // Add basic document checks as fallback if not in missing_info
    if (!app.diploma_file_path && !missingInfo.some(m => m.toLowerCase().includes('diploma'))) {
      missingInfo.push('Diploma');
    }

    console.log(`[agent-welkom] Final missing_info for email: ${JSON.stringify(missingInfo)}`);

    // Determine email type based on completeness AND missing info
    const hasSignificantMissing = missingInfo.length > 0;
    const isProfileComplete = (app.completeness_score || 0) >= 85;
    
    let emailType = 'welcome_intake'; // Default: ask for more info
    if (isProfileComplete && !hasSignificantMissing) {
      emailType = 'welcome'; // Profile complete, just confirmation
    }

    // Validate email type is allowed
    if (!allowed_email_types.includes(emailType)) {
      console.log(`[agent-welkom] Email type ${emailType} not in allowed types: ${allowed_email_types}`);
    }

    // Extract candidate name from extracted_data
    const candidateName = app.extracted_data?.naam || null;
    const firstName = candidateName?.split(' ')[0] || 'daar';

    console.log(`[agent-welkom] Sending ${emailType} email to ${app.email_from}, missing items: ${missingInfo.length}`);

    // v1.3.0 FIX: Use template_data instead of context!
    // send-ai-email reads from template_data.fields_to_ask, not context.missing_info
    console.log(`[agent-welkom] v1.3.0: Calling send-ai-email with template_data.fields_to_ask (${missingInfo.length} items)`);
    
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-ai-email', {
      body: {
        application_id: app.id,
        email_type: emailType,
        recipient_email: app.email_from,
        recipient_name: candidateName,
        // v1.3.0 FIX: send-ai-email reads from template_data, NOT context!
        template_data: {
          fields_to_ask: missingInfo,           // PRIMARY: send-ai-email uses this
          missing_info: missingInfo,             // FALLBACK: for backwards compat
          candidate_name: candidateName,
          first_name: firstName,
          extracted_data: app.extracted_data,    // Show what we already have
          functie_interesse: app.functie_interesse,
          regio_voorkeur: app.regio_voorkeur,
          has_cv: !!app.cv_file_path,
          has_diploma: !!app.diploma_file_path,
          completeness_score: app.completeness_score || 0,
          werkvorm: app.werkvorm,
          agent: 'welkom'
        },
        org_id: app.org_id
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
