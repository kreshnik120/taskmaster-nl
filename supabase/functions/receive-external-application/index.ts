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

    // 11. Insert into professional_applications
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
        completeness_score: cvFilePath ? 60 : 40,
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

    // 13. Send email notification to recruitment@inbound.citozorg.nl
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        
        const typeEmoji = data.type === "zzp" ? "🧑‍💼" : "👤";
        const typeName = data.type === "zzp" ? "ZZP'er" : "Uitzendkracht";
        
        await resend.emails.send({
          from: "Taskmaster <noreply@citozorg.nl>",
          to: ["recruitment@inbound.citozorg.nl"],
          subject: `Nieuwe ${sourceLabel} via ${data.source}: ${data.full_name}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Nieuwe ${typeName} via ${data.source}</h1>
              </div>
              
              <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef; border-top: none;">
                <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                  <p style="margin: 0 0 12px 0; font-size: 18px;">
                    <strong>Type:</strong> ${typeEmoji} ${typeName}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>Naam:</strong> ${data.full_name}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>Email:</strong> <a href="mailto:${data.email}" style="color: #667eea;">${data.email}</a>
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>Telefoon:</strong> ${data.phone || "Niet opgegeven"}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>CV:</strong> ${cvFilePath ? "✅ Ja" : "❌ Nee"}
                  </p>
                  ${data.type === "zzp" ? `
                  <p style="margin: 0 0 8px 0;">
                    <strong>Bedrijfsnaam:</strong> ${data.bedrijfsnaam || "Niet opgegeven"}
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    <strong>KVK:</strong> ${data.kvk_nummer || "Niet opgegeven"}
                  </p>
                  ` : ""}
                  ${data.gewenste_regio ? `
                  <p style="margin: 0 0 8px 0;">
                    <strong>Gewenste regio:</strong> ${data.gewenste_regio}
                  </p>
                  ` : ""}
                  ${uploadedDocuments.length > 0 ? `
                  <p style="margin: 0;">
                    <strong>Extra documenten:</strong> ${uploadedDocuments.map(d => d.type).join(", ")}
                  </p>
                  ` : ""}
                </div>
                
                ${data.motivatie ? `
                <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                  <p style="margin: 0 0 8px 0;"><strong>Motivatie:</strong></p>
                  <p style="margin: 0; color: #666;">${data.motivatie}</p>
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
        
        console.log(`[receive-external-application] Email notification sent to recruitment@inbound.citozorg.nl`);
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

    // 15. Return success response
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
