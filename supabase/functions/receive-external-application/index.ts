import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limiting storage (in-memory, resets on function cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Zod-like validation helpers (manual implementation to avoid extra dependencies)
interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ExternalApplication {
  source: "citozorg" | "abczorg";
  type: "uitzendkracht" | "zzp";
  full_name: string;
  email: string;
  phone?: string;
  cv_base64?: string;
  cv_filename?: string;
  cv_content_type?: string;
  documents?: Array<{
    type: "kvk" | "verzekering" | "diploma" | "vog" | "other";
    base64: string;
    filename: string;
    content_type: string;
  }>;
  beschikbaarheid?: string;
  gewenste_regio?: string;
  opleiding?: string;
  ervaring?: string;
  motivatie?: string;
  bedrijfsnaam?: string;
  kvk_nummer?: string;
  vacancy_id?: string;
  form_submitted_at?: string;
}

function validatePayload(data: unknown): ValidationResult<ExternalApplication> {
  if (!data || typeof data !== "object") {
    return { success: false, error: "Request body must be a JSON object" };
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (!obj.source || !["citozorg", "abczorg"].includes(obj.source as string)) {
    return { success: false, error: "source must be 'citozorg' or 'abczorg'" };
  }
  if (!obj.type || !["uitzendkracht", "zzp"].includes(obj.type as string)) {
    return { success: false, error: "type must be 'uitzendkracht' or 'zzp'" };
  }
  if (!obj.full_name || typeof obj.full_name !== "string" || obj.full_name.length < 2 || obj.full_name.length > 100) {
    return { success: false, error: "full_name must be a string between 2 and 100 characters" };
  }
  if (!obj.email || typeof obj.email !== "string" || !obj.email.includes("@") || obj.email.length > 255) {
    return { success: false, error: "email must be a valid email address (max 255 characters)" };
  }

  // Optional fields validation
  if (obj.phone !== undefined && (typeof obj.phone !== "string" || obj.phone.length > 20)) {
    return { success: false, error: "phone must be a string of max 20 characters" };
  }
  if (obj.cv_base64 !== undefined) {
    if (typeof obj.cv_base64 !== "string" || obj.cv_base64.length > 15_000_000) {
      return { success: false, error: "cv_base64 must be a string of max ~10MB" };
    }
    if (!obj.cv_filename || typeof obj.cv_filename !== "string") {
      return { success: false, error: "cv_filename is required when cv_base64 is provided" };
    }
    if (!obj.cv_content_type || !["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(obj.cv_content_type as string)) {
      return { success: false, error: "cv_content_type must be PDF, DOC, or DOCX" };
    }
  }
  if (obj.beschikbaarheid !== undefined && (typeof obj.beschikbaarheid !== "string" || obj.beschikbaarheid.length > 500)) {
    return { success: false, error: "beschikbaarheid must be max 500 characters" };
  }
  if (obj.gewenste_regio !== undefined && (typeof obj.gewenste_regio !== "string" || obj.gewenste_regio.length > 200)) {
    return { success: false, error: "gewenste_regio must be max 200 characters" };
  }
  if (obj.opleiding !== undefined && (typeof obj.opleiding !== "string" || obj.opleiding.length > 500)) {
    return { success: false, error: "opleiding must be max 500 characters" };
  }
  if (obj.ervaring !== undefined && (typeof obj.ervaring !== "string" || obj.ervaring.length > 2000)) {
    return { success: false, error: "ervaring must be max 2000 characters" };
  }
  if (obj.motivatie !== undefined && (typeof obj.motivatie !== "string" || obj.motivatie.length > 2000)) {
    return { success: false, error: "motivatie must be max 2000 characters" };
  }
  if (obj.bedrijfsnaam !== undefined && (typeof obj.bedrijfsnaam !== "string" || obj.bedrijfsnaam.length > 200)) {
    return { success: false, error: "bedrijfsnaam must be max 200 characters" };
  }
  if (obj.kvk_nummer !== undefined && (typeof obj.kvk_nummer !== "string" || obj.kvk_nummer.length > 20)) {
    return { success: false, error: "kvk_nummer must be max 20 characters" };
  }
  if (obj.vacancy_id !== undefined && typeof obj.vacancy_id !== "string") {
    return { success: false, error: "vacancy_id must be a string (UUID)" };
  }

  // Validate documents array if present
  if (obj.documents !== undefined) {
    if (!Array.isArray(obj.documents) || obj.documents.length > 5) {
      return { success: false, error: "documents must be an array of max 5 items" };
    }
    for (const doc of obj.documents) {
      if (!doc || typeof doc !== "object") {
        return { success: false, error: "Each document must be an object" };
      }
      if (!["kvk", "verzekering", "diploma", "vog", "other"].includes(doc.type)) {
        return { success: false, error: "Document type must be kvk, verzekering, diploma, vog, or other" };
      }
      if (!doc.base64 || typeof doc.base64 !== "string" || doc.base64.length > 15_000_000) {
        return { success: false, error: "Document base64 must be provided (max ~10MB)" };
      }
      if (!doc.filename || typeof doc.filename !== "string") {
        return { success: false, error: "Document filename is required" };
      }
      if (!doc.content_type || typeof doc.content_type !== "string") {
        return { success: false, error: "Document content_type is required" };
      }
    }
  }

  return { success: true, data: obj as unknown as ExternalApplication };
}

// XSS sanitization helper - escapes HTML special characters to prevent injection
function escapeHtml(unsafe: string | undefined | null): string {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function checkRateLimit(apiKey: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(apiKey);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(apiKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const startTime = Date.now();
  let logData: Record<string, unknown> = {};

  try {
    // 1. Validate API Key
    const apiKey = req.headers.get("x-api-key") || req.headers.get("X-API-Key");
    const expectedApiKey = Deno.env.get("CITOZORG_API_KEY");

    if (!expectedApiKey) {
      console.error("[receive-external-application] CITOZORG_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      console.warn("[receive-external-application] Invalid or missing API key");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Rate limiting
    const rateCheck = checkRateLimit(apiKey);
    if (!rateCheck.allowed) {
      console.warn("[receive-external-application] Rate limit exceeded");
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded. Max 100 requests per minute." }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "Retry-After": "60"
          } 
        }
      );
    }

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validatePayload(body);
    if (!validation.success || !validation.data) {
      console.warn("[receive-external-application] Validation failed:", validation.error);
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = validation.data;
    logData = { source: data.source, type: data.type, email: data.email };

    console.log(`[receive-external-application] Processing ${data.type} application from ${data.source} for ${data.email}`);

    // 4. Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 5. Check for duplicate application (same email + source in last 24 hours)
    const { data: existingApp } = await supabase
      .from("professional_applications")
      .select("id, email_from, created_at")
      .eq("email_from", data.email.toLowerCase().trim())
      .eq("source_project", data.source)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .is("deleted_at", null)
      .limit(1)
      .single();

    if (existingApp) {
      console.warn(`[receive-external-application] Duplicate application detected for ${data.email}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Duplicate application: An application with this email was already submitted in the last 24 hours",
          existing_application_id: existingApp.id
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Upload CV to storage if provided
    let cvFilePath: string | null = null;
    if (data.cv_base64 && data.cv_filename && data.cv_content_type) {
      try {
        const cvBytes = Uint8Array.from(atob(data.cv_base64), c => c.charCodeAt(0));
        const timestamp = Date.now();
        const sanitizedFilename = data.cv_filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        cvFilePath = `external/${data.source}/${timestamp}_${sanitizedFilename}`;

        const { error: uploadError } = await supabase.storage
          .from("application-cvs")
          .upload(cvFilePath, cvBytes, {
            contentType: data.cv_content_type,
            upsert: false,
          });

        if (uploadError) {
          console.error("[receive-external-application] CV upload failed:", uploadError);
          // Continue without CV - not a blocking error
          cvFilePath = null;
        } else {
          console.log(`[receive-external-application] CV uploaded to ${cvFilePath}`);
        }
      } catch (e) {
        console.error("[receive-external-application] CV processing failed:", e);
        cvFilePath = null;
      }
    }

    // 7. Upload additional documents (for ZZP)
    const uploadedDocuments: Array<{ type: string; path: string }> = [];
    if (data.documents && data.documents.length > 0) {
      for (const doc of data.documents) {
        try {
          const docBytes = Uint8Array.from(atob(doc.base64), c => c.charCodeAt(0));
          const timestamp = Date.now();
          const sanitizedFilename = doc.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const docPath = `external/${data.source}/docs/${timestamp}_${doc.type}_${sanitizedFilename}`;

          const { error: docUploadError } = await supabase.storage
            .from("application-cvs")
            .upload(docPath, docBytes, {
              contentType: doc.content_type,
              upsert: false,
            });

          if (!docUploadError) {
            uploadedDocuments.push({ type: doc.type, path: docPath });
            console.log(`[receive-external-application] Document ${doc.type} uploaded to ${docPath}`);
          }
        } catch (e) {
          console.error(`[receive-external-application] Document ${doc.type} upload failed:`, e);
        }
      }
    }

    // 8. Determine source label
    const sourceLabel = data.type === "zzp" ? "[ZZP'ER]" : "[UITZENDKRACHT]";

    // 9. Build extracted_data JSON
    const extractedData: Record<string, unknown> = {
      naam: data.full_name,
      email: data.email,
      telefoon: data.phone,
      beschikbaarheid: data.beschikbaarheid,
      gewenste_regio: data.gewenste_regio,
      opleiding: data.opleiding,
      ervaring: data.ervaring,
      motivatie: data.motivatie,
    };

    // Add ZZP-specific fields
    if (data.type === "zzp") {
      extractedData.werkvorm = "ZZP";
      extractedData.bedrijfsnaam = data.bedrijfsnaam;
      extractedData.kvk_nummer = data.kvk_nummer;
    } else {
      extractedData.werkvorm = "Uitzendkracht";
    }

    // 10. Get default org_id (ABCzorg)
    const defaultOrgId = "550e8400-e29b-41d4-a716-446655440000";

    // 11. Calculate completeness score using same weights as process-application-email
    const fieldWeights: Record<string, number> = {
      full_name: 15,
      email: 10,
      telefoonnummer: 12,
      functie_niveau: 20,
      regio: 10,
      werkvorm: 8,
      skills: 5,
      jaren_ervaring: 5,
      ervaring_sector: 5,
      doelgroep_ervaring: 4,
      woonplaats: 3,
      beschikbaarheid: 2,
      motivatie: 3,
      gewenst_uurloon: extractedData.werkvorm === 'ZZP' ? 6 : 1,
      kvk_nummer: extractedData.werkvorm === 'ZZP' ? 3 : 0,
    };
    
    // Map form fields to extracted_data fields for scoring
    const fieldMapping: Record<string, unknown> = {
      full_name: extractedData.naam,
      email: extractedData.email,
      telefoonnummer: extractedData.telefoon,
      functie_niveau: extractedData.opleiding || extractedData.ervaring, // Inferred from CV/experience
      regio: extractedData.gewenste_regio,
      werkvorm: extractedData.werkvorm,
      woonplaats: extractedData.gewenste_regio, // Often same as regio
      beschikbaarheid: extractedData.beschikbaarheid,
      motivatie: extractedData.motivatie,
      gewenst_uurloon: null, // Not typically in initial form
      kvk_nummer: extractedData.kvk_nummer,
    };
    
    let earnedPoints = 0;
    let totalPoints = 0;
    
    for (const [field, weight] of Object.entries(fieldWeights)) {
      if (weight === 0) continue;
      totalPoints += weight;
      
      const value = fieldMapping[field];
      if (value !== null && value !== undefined && value !== '') {
        earnedPoints += weight;
      }
    }
    
    // CV bonus: adds significant points
    if (cvFilePath) {
      earnedPoints += 15;
      totalPoints += 15;
    } else {
      totalPoints += 15;
    }
    
    const completenessScore = Math.round((earnedPoints / totalPoints) * 100);
    console.log(`[receive-external-application] Completeness score: ${completenessScore}% (${earnedPoints}/${totalPoints} points)`);

    // 12. Insert into professional_applications
    const { data: newApplication, error: insertError } = await supabase
      .from("professional_applications")
      .insert({
        org_id: defaultOrgId,
        email_from: data.email.toLowerCase().trim(),
        email_subject: `${sourceLabel} via ${data.source}: ${data.full_name}`,
        email_body: data.motivatie || `Sollicitatie van ${data.full_name} via ${data.source}`,
        cv_file_path: cvFilePath,
        extracted_data: extractedData,
        pipeline_stage: "nieuw",
        status: "nieuw",
        source_project: data.source,
        source_label: sourceLabel,
        completeness_score: completenessScore,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[receive-external-application] Database insert failed:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save application" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[receive-external-application] Application created with ID: ${newApplication.id}`);

    // 12. Log to system_events for audit
    await supabase.from("system_events").insert({
      org_id: defaultOrgId,
      event_type: "external_application_received",
      entity_type: "professional_application",
      entity_id: newApplication.id,
      event_data: {
        source: data.source,
        source_label: sourceLabel,
        applicant_type: data.type,
        email: data.email,
        has_cv: !!cvFilePath,
        documents_count: uploadedDocuments.length,
      },
      metadata: {
        processing_time_ms: Date.now() - startTime,
        api_version: "1.0",
      },
    });

    // 13. Send INTERNAL notification to recruitment team (NOT the inbound webhook!)
    // This prevents circular email loops - recruitment@citozorg.nl is for human reading only
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        
        const typeEmoji = data.type === "zzp" ? "🧑‍💼" : "👤";
        const typeName = data.type === "zzp" ? "ZZP'er" : "Uitzendkracht";
        
        // Sanitize all user inputs to prevent XSS in email
        const safeName = escapeHtml(data.full_name);
        const safeEmail = escapeHtml(data.email);
        const safeEmailHref = encodeURIComponent(data.email);
        const safePhone = escapeHtml(data.phone) || "Niet opgegeven";
        const safeBedrijfsnaam = escapeHtml(data.bedrijfsnaam) || "Niet opgegeven";
        const safeKvk = escapeHtml(data.kvk_nummer) || "Niet opgegeven";
        const safeRegio = escapeHtml(data.gewenste_regio);
        const safeMotivatie = escapeHtml(data.motivatie);
        const safeSource = escapeHtml(data.source);
        const safeSourceLabel = escapeHtml(sourceLabel);
        
        // CRITICAL: Send to recruitment@citozorg.nl (NOT @inbound.citozorg.nl)
        // This prevents the notification from being processed as a new application
        await resend.emails.send({
          from: "Taskmaster <noreply@citozorg.nl>",
          to: ["recruitment@citozorg.nl"],
          subject: `Nieuwe ${safeSourceLabel} via ${safeSource}: ${safeName}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Nieuwe ${typeName} via ${safeSource}</h1>
              </div>
              
              <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef; border-top: none;">
                <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                  <p style="margin: 0 0 12px 0; font-size: 18px;">
                    <strong>Type:</strong> ${typeEmoji} ${typeName}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>Naam:</strong> ${safeName}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>Email:</strong> <a href="mailto:${safeEmailHref}" style="color: #667eea;">${safeEmail}</a>
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>Telefoon:</strong> ${safePhone}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>CV:</strong> ${cvFilePath ? "✅ Ja" : "❌ Nee"}
                  </p>
                  ${data.type === "zzp" ? `
                  <p style="margin: 0 0 8px 0;">
                    <strong>Bedrijfsnaam:</strong> ${safeBedrijfsnaam}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>KVK:</strong> ${safeKvk}
                  </p>
                  ` : ""}
                  ${safeRegio ? `
                  <p style="margin: 0 0 8px 0;">
                    <strong>Gewenste regio:</strong> ${safeRegio}
                  </p>
                  ` : ""}
                  ${uploadedDocuments.length > 0 ? `
                  <p style="margin: 0;">
                    <strong>Extra documenten:</strong> ${uploadedDocuments.map(d => escapeHtml(d.type)).join(", ")}
                  </p>
                  ` : ""}
                </div>
                
                ${safeMotivatie ? `
                <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                  <p style="margin: 0 0 8px 0;"><strong>Motivatie:</strong></p>
                  <p style="margin: 0; color: #666;">${safeMotivatie}</p>
                </div>
                ` : ""}
                
                <div style="text-align: center; margin-top: 24px;">
                  <a href="https://taskmaster.lovable.app/sollicitaties" 
                     style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    Bekijk in Taskmaster →
                  </a>
                </div>
              </div>
              
              <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
                Dit is een automatisch bericht van het Taskmaster recruitment systeem.
              </p>
            </body>
            </html>
          `,
        });
        
        console.log(`[receive-external-application] Internal notification sent to recruitment@citozorg.nl`);
      } catch (emailError) {
        console.error("[receive-external-application] Email notification failed:", emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.warn("[receive-external-application] RESEND_API_KEY not configured, skipping email notification");
    }

    // 14. Trigger CV extraction if CV was uploaded
    if (cvFilePath) {
      try {
        await supabase.functions.invoke("extract-cv-data", {
          body: {
            application_id: newApplication.id,
            file_path: cvFilePath,
          },
        });
        console.log(`[receive-external-application] CV extraction triggered for ${newApplication.id}`);
      } catch (e) {
        console.error("[receive-external-application] CV extraction trigger failed:", e);
      }
    }

    // 15. Welcome email handling
    // NOTE: Directe orchestrator calls zijn verwijderd om race conditions te voorkomen.
    // De database trigger maakt automatisch een 'send_welcome_and_intake' goal aan.
    // De master-scheduler cron (elke minuut) roept ai-agent-orchestrator aan met de juiste service role key.
    // Dit garandeert dat de database transactie is gecommit voordat het goal wordt verwerkt.
    console.log(`[receive-external-application] Goal 'send_welcome_and_intake' is aangemaakt via database trigger.`);
    console.log(`[receive-external-application] Welkomstmail wordt binnen 1-2 minuten verzonden via master-scheduler cron.`);

    // 16. Auto-trigger interview slots if completeness >= threshold (same as email flow)
    const INTERVIEW_THRESHOLD = parseInt(Deno.env.get('INTERVIEW_THRESHOLD') || '85');
    
    if (completenessScore >= INTERVIEW_THRESHOLD) {
      console.log(`[receive-external-application] Completeness ${completenessScore}% >= ${INTERVIEW_THRESHOLD}%, triggering auto-send-interview-slots...`);
      
      try {
        const { data: interviewResult, error: interviewError } = await supabase.functions.invoke('auto-send-interview-slots', {
          body: {
            application_id: newApplication.id,
            trigger_source: 'external_api',
          }
        });
        
        if (interviewError) {
          console.error("[receive-external-application] Auto interview slots error:", interviewError);
        } else {
          console.log("[receive-external-application] Auto interview slots result:", interviewResult);
        }
      } catch (interviewErr) {
        console.error("[receive-external-application] Exception triggering interview slots:", interviewErr);
      }
    } else {
      console.log(`[receive-external-application] Completeness ${completenessScore}% < ${INTERVIEW_THRESHOLD}%, follow-up via AI Agent Orchestrator`);
    }

    // 17. Return success response
    const processingTime = Date.now() - startTime;
    console.log(`[receive-external-application] Completed in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        application_id: newApplication.id,
        message: "Sollicitatie succesvol ontvangen",
        source_label: sourceLabel,
        cv_uploaded: !!cvFilePath,
        documents_uploaded: uploadedDocuments.length,
        completeness_score: completenessScore,
        interview_slots_triggered: completenessScore >= INTERVIEW_THRESHOLD,
        processing_time_ms: processingTime,
      }),
      { 
        status: 201, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": rateCheck.remaining.toString(),
        } 
      }
    );

  } catch (error) {
    console.error("[receive-external-application] Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Internal server error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
