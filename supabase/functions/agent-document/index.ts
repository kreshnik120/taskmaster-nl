/**
 * Agent Document v1.0.1
 * =====================
 * Specialist agent for the 'intake_verstuurd' stage.
 * 
 * NOTE: Kandidaten blijven op 'intake_verstuurd' tot recruiter gesprek plant.
 * Er is GEEN automatische transitie naar 'docs_compleet' (deze stage bestaat niet meer in 6-stage pipeline).
 * 
 * Responsibilities:
 * - Process documents sent by candidates (CV, Diploma)
 * - Register ALL documents in application_documents table (CRITICAL FIX)
 * - Trigger DUO/EMREX verification for diplomas
 * - Request missing documents via email
 * - Track completeness score
 * - Notify recruiter when CV + verified diploma are ready for interview scheduling
 * 
 * This agent does NOTHING else:
 * - No welcome emails (Welkom Agent)
 * - No interview scheduling (Planning Agent) - gesprek planning is HANDMATIG
 * - No VOG requests (Screening Agent - VOG is requested at screening stage)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Focused system prompt
const DOCUMENT_AGENT_PROMPT = `Je bent de Document Agent voor CitoZorg/ABCzorg recruitmentbureau.

## JOUW ENIGE TAAK
Verwerk documenten die kandidaten insturen en zorg dat ze correct geregistreerd worden.

## STAGE TRANSITIE VEREISTEN (alle moeten waar zijn)
1. CV aanwezig in application_documents
2. Diploma aanwezig in application_documents
3. Diploma is geverifieerd (DUO, EMREX of handmatig)
4. Completeness score >= 70%

## BESCHIKBARE EMAIL TYPES
- followup_question: Vraag om ontbrekende informatie
- document_request: Vraag specifiek document
- documents_received_confirmation: Bevestig ontvangst + toon voortgang

## WAT JE MOET DOEN
1. Check welke documenten al geregistreerd zijn
2. Registreer nieuwe documenten in application_documents
3. Trigger verificatie voor diploma's
4. Stuur bevestiging of verzoek om ontbrekende documenten

## WAT JE NIET DOET
- Geen welkomstmail (dat deed de Welkom Agent)
- Geen gesprekken plannen (dat doet de Planning Agent)
- Geen VOG aanvragen (dat doet de Screening Agent)`;

interface DocumentInfo {
  id?: string;
  filename: string;
  file_path: string;
  type: string; // 'cv', 'diploma', 'vog', 'kvk', etc.
  source?: string;
}

interface ApplicationDocument {
  id: string;
  document_type: string | null;
  is_verified: boolean;
  filename: string;
  file_path: string;
  verified_at: string | null;
}

// ============================================================================
// CRITICAL FIX: Register documents in application_documents table
// This was missing in handle-application-reply!
// ============================================================================

async function registerDocument(
  supabase: any,
  applicationId: string,
  doc: DocumentInfo
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Check if document already exists
    const { data: existing } = await supabase
      .from('application_documents')
      .select('id')
      .eq('application_id', applicationId)
      .eq('document_type', doc.type)
      .single();

    if (existing) {
      // Update existing document
      const { error } = await supabase
        .from('application_documents')
        .update({
          filename: doc.filename,
          file_path: doc.file_path,
          source: doc.source || 'email_reply',
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) {
        console.error('[agent-document] Failed to update document:', error);
        return { success: false, error: error.message };
      }

      console.log(`[agent-document] Updated existing ${doc.type} document`);
      return { success: true, id: existing.id };
    }

    // Insert new document
    const { data, error } = await supabase
      .from('application_documents')
      .insert({
        application_id: applicationId,
        filename: doc.filename,
        file_path: doc.file_path,
        document_type: doc.type,
        category: 'basis',
        source: doc.source || 'email_reply',
        is_verified: false,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('[agent-document] Failed to insert document:', error);
      return { success: false, error: error.message };
    }

    console.log(`[agent-document] ✅ Registered new ${doc.type} document: ${doc.filename}`);
    return { success: true, id: data.id };

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('[agent-document] Exception in registerDocument:', e);
    return { success: false, error: errorMessage };
  }
}

async function markDocumentVerified(
  supabase: any,
  applicationId: string,
  docType: string,
  verificationMethod: string
): Promise<boolean> {
  const { error } = await supabase
    .from('application_documents')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
      metadata: { verification_method: verificationMethod }
    })
    .eq('application_id', applicationId)
    .eq('document_type', docType);

  if (error) {
    console.error('[agent-document] Failed to mark document verified:', error);
    return false;
  }

  console.log(`[agent-document] ✅ Marked ${docType} as verified (${verificationMethod})`);
  return true;
}

async function getRegisteredDocuments(
  supabase: any,
  applicationId: string
): Promise<ApplicationDocument[]> {
  const { data, error } = await supabase
    .from('application_documents')
    .select('id, document_type, is_verified, filename, file_path, verified_at')
    .eq('application_id', applicationId);

  if (error) {
    console.error('[agent-document] Failed to get documents:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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
      allowed_email_types = ['followup_question', 'document_request', 'documents_received_confirmation'],
      documents = [],
      extracted_data = {}
    } = body;

    console.log(`[agent-document] Processing application: ${application_id}, trigger: ${trigger}, documents: ${documents.length}`);

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
    if (app.pipeline_stage !== 'intake_verstuurd') {
      console.log(`[agent-document] Wrong stage: ${app.pipeline_stage}, expected: intake_verstuurd`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent Document handles 'intake_verstuurd' stage only, current: ${app.pipeline_stage}`,
          stage_completed: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Register any new documents from the request
    const registrationResults: { type: string; success: boolean }[] = [];
    
    for (const doc of documents) {
      const result = await registerDocument(supabase, application_id, doc);
      registrationResults.push({ type: doc.type, success: result.success });
    }

    // Also check if application has file paths that aren't registered yet
    if (app.cv_file_path) {
      const cvDocs = await supabase
        .from('application_documents')
        .select('id')
        .eq('application_id', application_id)
        .eq('document_type', 'cv')
        .single();

      if (!cvDocs.data) {
        await registerDocument(supabase, application_id, {
          filename: 'CV',
          file_path: app.cv_file_path,
          type: 'cv',
          source: 'application_field'
        });
      }
    }

    if (app.diploma_file_path) {
      const diplomaDocs = await supabase
        .from('application_documents')
        .select('id')
        .eq('application_id', application_id)
        .eq('document_type', 'diploma')
        .single();

      if (!diplomaDocs.data) {
        await registerDocument(supabase, application_id, {
          filename: 'Diploma',
          file_path: app.diploma_file_path,
          type: 'diploma',
          source: 'application_field'
        });
      }
    }

    // Step 2: Get current document status
    const registeredDocs = await getRegisteredDocuments(supabase, application_id);
    
    const hasCV = registeredDocs.some(d => d.document_type === 'cv');
    const hasDiploma = registeredDocs.some(d => d.document_type === 'diploma');
    const isDiplomaVerified = registeredDocs.some(d => 
      d.document_type === 'diploma' && d.is_verified
    );

    console.log(`[agent-document] Document status - CV: ${hasCV}, Diploma: ${hasDiploma}, Verified: ${isDiplomaVerified}`);

    // Step 3: Trigger DUO verification if diploma exists but not verified
    if (hasDiploma && !isDiplomaVerified) {
      console.log('[agent-document] Triggering DUO verification...');
      
      try {
        const { error: duoError } = await supabase.functions.invoke('verify-diploma-duo', {
          body: {
            application_id,
            diploma_file_path: app.diploma_file_path
          }
        });

        if (duoError) {
          console.error('[agent-document] DUO verification failed:', duoError);
        } else {
          console.log('[agent-document] DUO verification triggered');
        }
      } catch (e) {
        console.error('[agent-document] Failed to trigger DUO verification:', e);
      }
    }

    // Step 4: Determine what's missing and what email to send
    const missingDocs: string[] = [];
    if (!hasCV) missingDocs.push('CV');
    if (!hasDiploma) missingDocs.push('Diploma');

    let emailSent = false;
    let emailType: string | null = null;

    // Extract candidate name from extracted_data
    const candidateName = app.extracted_data?.naam || null;
    const firstName = candidateName?.split(' ')[0] || 'daar';

    if (missingDocs.length > 0) {
      // Request missing documents
      emailType = 'document_request';
      
      const { error: emailError } = await supabase.functions.invoke('send-ai-email', {
        body: {
          application_id,
          email_type: emailType,
          recipient_email: app.email_from,
          recipient_name: candidateName,
          context: {
            candidate_name: candidateName,
            first_name: firstName,
            missing_documents: missingDocs,
            has_cv: hasCV,
            has_diploma: hasDiploma,
            is_diploma_verified: isDiplomaVerified,
            completeness_score: app.completeness_score || 0,
            agent: 'document'
          }
        }
      });

      emailSent = !emailError;
      if (emailError) {
        console.error('[agent-document] Failed to send document request email:', emailError);
      }

    } else if (hasCV && hasDiploma && !isDiplomaVerified) {
      // Documents received, waiting for verification
      emailType = 'documents_received_confirmation';
      
      const { error: emailError } = await supabase.functions.invoke('send-ai-email', {
        body: {
          application_id,
          email_type: emailType,
          recipient_email: app.email_from,
          recipient_name: candidateName,
          context: {
            candidate_name: candidateName,
            first_name: firstName,
            verification_pending: true,
            completeness_score: app.completeness_score || 0,
            agent: 'document'
          }
        }
      });

      emailSent = !emailError;
    }

    // Step 5: Check if we can advance to next stage
    const completeness = app.completeness_score || 0;
    const canAdvance = hasCV && hasDiploma && isDiplomaVerified && completeness >= 70;

    // Log to application_conversations
    await supabase.from('application_conversations').insert({
      application_id,
      role: 'agent',
      content: `[Agent Document] Status check - CV: ${hasCV}, Diploma: ${hasDiploma}, Verified: ${isDiplomaVerified}, Completeness: ${completeness}%. ${canAdvance ? 'Klaar voor volgende stage.' : `Wachtend op: ${missingDocs.join(', ') || 'diploma verificatie'}`}`,
      metadata: {
        agent: 'document',
        registered_docs: registeredDocs.map(d => d.document_type),
        missing_docs: missingDocs,
        email_sent: emailSent,
        email_type: emailType,
        can_advance: canAdvance,
        execution_time_ms: Date.now() - startTime
      }
    });

    console.log(`[agent-document] ✅ Completed in ${Date.now() - startTime}ms, canAdvance: ${canAdvance}`);

    return new Response(
      JSON.stringify({
        success: true,
        stage_completed: canAdvance,
        documents_registered: registrationResults,
        document_status: {
          has_cv: hasCV,
          has_diploma: hasDiploma,
          is_diploma_verified: isDiplomaVerified,
          completeness_score: completeness,
          registered_count: registeredDocs.length
        },
        missing_documents: missingDocs,
        email_sent: emailSent,
        email_type: emailType,
        can_advance: canAdvance,
        execution_time_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[agent-document] Error:', error);
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
