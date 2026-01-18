/**
 * Agent Screening v1.0.0
 * ======================
 * Specialist agent for the 'gesprek_gepland' stage.
 * Handles: gesprek_gepland → screening
 * 
 * Responsibilities:
 * - Wait for positive interview feedback (human-in-the-loop)
 * - Trigger VOG request after positive feedback
 * - Handle negative feedback with human review queue
 * - Send status update emails
 * 
 * IMPORTANT:
 * - This agent requires human approval for stage transition
 * - Negative feedback creates a human_review_queue entry
 * - VOG is only requested AFTER positive interview (3-month validity rule)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Focused system prompt
const SCREENING_AGENT_PROMPT = `Je bent de Screening Agent voor CitoZorg/ABCzorg recruitmentbureau.

## JOUW ENIGE TAAK
Na een positief gesprek: start de screening fase en vraag om VOG.

## HUMAN-IN-THE-LOOP
- Afwijzingen gaan ALTIJD via human_review_queue
- Je wijst NOOIT zelf kandidaten af
- Je wacht op gesprek_feedback van de recruiter

## STAGE TRANSITIE
- Alleen na positieve gesprek_feedback
- Dan: vraag VOG aan (mag max 3 maanden oud zijn bij plaatsing)

## BESCHIKBARE EMAIL TYPES
- vog_request: Vraag om VOG aan te leveren
- status_update: Algemene status update

## WAT JE NIET DOET
- Geen documenten verwerken (behalve VOG)
- Geen gesprekken plannen
- Geen kandidaten afwijzen zonder human review`;

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
      allowed_email_types = ['vog_request', 'status_update']
    } = body;

    console.log(`[agent-screening] Processing application: ${application_id}, trigger: ${trigger}`);

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
    if (app.pipeline_stage !== 'gesprek_gepland') {
      console.log(`[agent-screening] Wrong stage: ${app.pipeline_stage}, expected: gesprek_gepland`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent Screening handles 'gesprek_gepland' stage only, current: ${app.pipeline_stage}`,
          stage_completed: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check interview feedback
    const feedback = app.gesprek_feedback;
    
    if (!feedback) {
      // No feedback yet, waiting for human input
      console.log('[agent-screening] No interview feedback yet, waiting for human input');
      
      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: false,
          message: 'Waiting for interview feedback from recruiter',
          gesprek_datum: app.gesprek_datum,
          gesprek_feedback: null
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (feedback === 'negative') {
      // Negative feedback - create human review queue entry
      console.log('[agent-screening] Negative feedback received, creating human review entry');
      
      // Check if already in review queue
      const { data: existingReview } = await supabase
        .from('human_review_queue')
        .select('id')
        .eq('application_id', application_id)
        .eq('status', 'pending')
        .single();

      if (!existingReview) {
        await supabase.from('human_review_queue').insert({
          application_id,
          org_id: app.org_id,
          review_type: 'rejection',
          status: 'pending',
          priority: 1,
          context: {
            reason: 'Negatieve gesprek feedback',
            gesprek_datum: app.gesprek_datum,
            gesprek_feedback: feedback,
            candidate_name: app.extracted_data?.naam
          }
        });
      }

      // Update application
      await supabase
        .from('professional_applications')
        .update({ pending_human_review: true })
        .eq('id', application_id);

      // Log to conversations
      await supabase.from('application_conversations').insert({
        application_id,
        role: 'agent',
        content: `[Agent Screening] Negatieve gesprek feedback ontvangen. Human review aangemaakt voor definitieve beslissing.`,
        metadata: {
          agent: 'screening',
          feedback: feedback,
          human_review_created: true
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: false,
          message: 'Negative feedback - human review queue entry created',
          human_review_required: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (feedback === 'positive') {
      // Positive feedback - proceed with VOG request
      console.log('[agent-screening] Positive feedback received, requesting VOG');
      
      // Extract candidate name from extracted_data
      const candidateName = app.extracted_data?.naam || null;
      const firstName = candidateName?.split(' ')[0] || 'daar';
      
      // Send VOG request email
      const { error: emailError } = await supabase.functions.invoke('send-ai-email', {
        body: {
          application_id: app.id,
          email_type: 'vog_request',
          recipient_email: app.email_from,
          recipient_name: candidateName,
          context: {
            candidate_name: candidateName,
            first_name: firstName,
            gesprek_datum: app.gesprek_datum,
            agent: 'screening'
          }
        }
      });

      const emailSent = !emailError;
      if (emailError) {
        console.error('[agent-screening] Failed to send VOG request email:', emailError);
      }

      // Register VOG as requested document
      await supabase.from('application_documents').upsert({
        application_id,
        document_type: 'vog',
        filename: 'VOG (aangevraagd)',
        file_path: '',
        category: 'compliance',
        source: 'agent_screening',
        is_verified: false,
        metadata: {
          requested_at: new Date().toISOString(),
          request_reason: 'positive_interview'
        }
      }, { onConflict: 'application_id,document_type' });

      // Create notification for recruiter
      await supabase.from('recruiter_notifications').insert({
        org_id: app.org_id,
        type: 'vog_requested',
        title: 'VOG aangevraagd',
        message: `VOG is aangevraagd bij ${candidateName || 'kandidaat'} na positief gesprek.`,
        application_id: app.id,
        is_read: false
      });

      // Log to conversations
      await supabase.from('application_conversations').insert({
        application_id,
        role: 'agent',
        content: `[Agent Screening] Positieve gesprek feedback! VOG aanvraag verstuurd naar kandidaat.`,
        metadata: {
          agent: 'screening',
          feedback: feedback,
          vog_requested: true,
          email_sent: emailSent,
          execution_time_ms: Date.now() - startTime
        }
      });

      console.log(`[agent-screening] ✅ Completed in ${Date.now() - startTime}ms, VOG requested`);

      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: true, // Can advance to 'screening' stage
          updated_fields: {
            gesprek_feedback: 'positive'
          },
          vog_requested: true,
          email_sent: emailSent,
          message: 'Positive feedback processed, VOG request sent',
          execution_time_ms: Date.now() - startTime
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown feedback value
    console.log(`[agent-screening] Unknown feedback value: ${feedback}`);
    return new Response(
      JSON.stringify({
        success: false,
        stage_completed: false,
        error: `Unknown feedback value: ${feedback}`,
        valid_values: ['positive', 'negative']
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[agent-screening] Error:', error);
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
