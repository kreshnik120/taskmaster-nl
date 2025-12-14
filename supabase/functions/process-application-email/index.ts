import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { normalizeFunctieNiveau, normalizeWerkvorm, isPlaceholderPhone, getOrganizationById } from '../_shared/healthcare-mappings.ts';
// PDF parsing moved to separate parse-pdf-cv function
interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    created_at: string;
    email_id: string;
    from: string;
    subject: string;
    to: string[];
    html?: string;
    text?: string;
    headers?: Record<string, string>;
    attachments?: Array<{
      content?: string; // base64 - optional for inline images
      content_type: string;
      filename: string;
      size?: number;
      content_disposition?: string; // "inline" or "attachment"
      content_id?: string; // for inline images
    }>;
  };
}

const handler = async (req: Request): Promise<Response> => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    console.log(`\n🔵 [${requestId}] ========================================`);
    console.log(`🔵 [${requestId}] PROCESS-APPLICATION-EMAIL STARTED`);
    console.log(`🔵 [${requestId}] Timestamp: ${new Date().toISOString()}`);
    console.log(`🔵 [${requestId}] ========================================`);
    
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET");
    
    const supabase = createAdminClient();
    const resend = new Resend(resendApiKey);

    // 🔒 SECURITY: Verify webhook signature (if secret is configured)
    let payload: ResendWebhookPayload;
    
    if (webhookSecret) {
      const rawBody = await req.text();
      const { verifySvixSignature } = await import("../_shared/webhook-validator.ts");
      
      const isValid = await verifySvixSignature(rawBody, req.headers, webhookSecret);
      if (!isValid) {
        console.error("❌ Invalid webhook signature - potential attack attempt");
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Parse payload after verification
      payload = JSON.parse(rawBody);
    } else {
      console.warn("⚠️ RESEND_WEBHOOK_SIGNING_SECRET not configured - webhook verification disabled");
      payload = await req.json();
    }
    
    // 🔒 SECURITY: Validate webhook payload structure with Zod
    const ResendWebhookSchema = z.object({
      type: z.string(),
      created_at: z.string().optional(),
      data: z.object({
        created_at: z.string().optional(),
        email_id: z.string().optional(),
        from: z.string().email().max(255),
        subject: z.string().max(500),
        to: z.array(z.string().email()).max(100),
        html: z.string().max(1000000).optional(),
        text: z.string().max(1000000).optional(),
        headers: z.record(z.string()).optional(),
        attachments: z.array(z.object({
          content: z.string().max(20000000).optional(), // Optional for inline images (signatures)
          content_type: z.string().max(100),
          filename: z.string().max(255),
          size: z.number().int().positive().max(20000000).optional(), // Optional for inline
          content_disposition: z.string().optional(), // "inline" or "attachment"
          content_id: z.string().optional() // For inline images
        })).max(10).optional()
      })
    });
    
    const webhookValidation = ResendWebhookSchema.safeParse(payload);
    if (!webhookValidation.success) {
      const errors = webhookValidation.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.error("❌ Webhook payload validation failed:", errors);
      return new Response(
        JSON.stringify({ error: `Invalid payload: ${errors}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    payload = webhookValidation.data as ResendWebhookPayload;
    console.log(`🔵 [${requestId}] Webhook type: ${payload.type}`);
    console.log(`🔵 [${requestId}] From: ${payload.data?.from}`);
    console.log(`🔵 [${requestId}] Subject: ${payload.data?.subject}`);
    console.log(`🔵 [${requestId}] Attachments: ${payload.data?.attachments?.length || 0}`);

    if (payload.type !== "email.received") {
      console.log(`🔵 [${requestId}] Ignoring non-email event: ${payload.type}`);
      return new Response(JSON.stringify({ message: "Ignored - not email.received", request_id: requestId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailData = payload.data;
    const emailSubject = emailData.subject || "";

    // 📧 REPLY DETECTION: Check if this is a reply to an existing conversation
    const isReply = 
      emailSubject.toLowerCase().startsWith('re:') ||
      emailSubject.toLowerCase().startsWith('antw:') ||
      emailSubject.toLowerCase().startsWith('antwoord:') ||
      emailSubject.toLowerCase().startsWith('fw:') === false && // Not a forward
      (emailData.headers?.['in-reply-to'] || emailData.headers?.['references']);

    if (isReply) {
      console.log("📧 Detected REPLY email - forwarding to handle-application-reply");
      console.log("Subject:", emailSubject);
      console.log("From:", emailData.from);
      
      // Forward to handle-application-reply edge function with internal auth headers
      const forwardSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.substring(0, 32) || 'internal';
      const { data: replyData, error: replyError } = await supabase.functions.invoke('handle-application-reply', {
        body: payload,
        headers: {
          'x-internal-forward': 'true',
          'x-forward-secret': forwardSecret
        }
      });
      
      if (replyError) {
        console.error("❌ handle-application-reply error:", replyError);
        return errorResponse(`Reply processing failed: ${replyError.message}`, 500);
      }
      
      console.log("✅ Reply forwarded successfully:", replyData);
      return jsonResponse({ 
        success: true, 
        message: "Reply forwarded to handle-application-reply",
        data: replyData 
      });
    }

    // Process as NEW application
    console.log("📨 Processing as NEW application email");
    const applicantEmail = emailData.from;
    const emailBody = emailData.text || emailData.html || "";

    console.log("From:", applicantEmail);
    console.log("Subject:", emailSubject);
    
    // Filter out inline attachments (email signatures) - only process real attachments with content
    const realAttachments = emailData.attachments?.filter(att => 
      att.content && // Has actual content
      att.content_disposition !== 'inline' // Not an inline image (signature)
    ) || [];
    
    console.log("Total attachments:", emailData.attachments?.length || 0);
    console.log("Real attachments (excluding inline):", realAttachments.length);

    // Get org_id (assume first org for now - in production you'd map email domains to orgs)
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    if (!orgs || orgs.length === 0) {
      throw new Error("No organization found");
    }
    const orgId = orgs[0].id;

    // Get first user in org to assign as creator
    const { data: userOrgs } = await supabase
      .from("user_organizations")
      .select("user_id")
      .eq("org_id", orgId)
      .limit(1);
    
    if (!userOrgs || userOrgs.length === 0) {
      throw new Error("No users found in organization");
    }
    const userId = userOrgs[0].user_id;

    // Process CV attachment
    let cvFilePath: string | null = null;
    let cvFileName: string | null = null;
    let cvContent = "";

    if (realAttachments.length > 0) {
      const cvAttachment = realAttachments.find(att => 
        att.content && // Must have content
        (att.filename.toLowerCase().endsWith(".pdf") ||
         att.filename.toLowerCase().endsWith(".doc") ||
         att.filename.toLowerCase().endsWith(".docx"))
      );

      if (cvAttachment && cvAttachment.content) {
        console.log("📎 Processing CV attachment:", {
          filename: cvAttachment.filename,
          contentType: cvAttachment.content_type,
          size: cvAttachment.content.length || 0
        });
        
        // Decode base64 content
        const cvBuffer = Uint8Array.from(atob(cvAttachment.content), c => c.charCodeAt(0));
        
        // Upload to Storage
        const timestamp = Date.now();
        const safeName = cvAttachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        cvFileName = cvAttachment.filename;
        cvFilePath = `${orgId}/${applicantEmail.replace(/[^a-zA-Z0-9@.-]/g, "_")}_${timestamp}_${safeName}`;
        
        console.log("🔄 Attempting CV upload to storage:", {
          bucket: "application-cvs",
          path: cvFilePath,
          size: cvBuffer.length,
          contentType: cvAttachment.content_type,
          upsert: false
        });
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("application-cvs")
          .upload(cvFilePath, cvBuffer, {
            contentType: cvAttachment.content_type,
            upsert: false,
          });

        if (uploadError) {
          console.error("❌ CV upload failed:", {
            error: uploadError,
            message: uploadError.message,
            bucket: "application-cvs",
            path: cvFilePath,
            size: cvBuffer.length
          });
          throw uploadError;
        }

        console.log("✅ CV uploaded successfully:", {
          path: uploadData?.path || cvFilePath,
          fullPath: uploadData?.fullPath,
          size: cvBuffer.length,
          id: uploadData?.id
        });

        // Extract text from PDF using parse-pdf-cv function
        if (cvAttachment.content_type === "application/pdf") {
          try {
            console.log("📄 Calling parse-pdf-cv function...");
            
            // Call the lightweight PDF parser function
            const { data: pdfData, error: pdfError } = await supabase.functions.invoke(
              'parse-pdf-cv',
              {
                body: {
                  pdfBase64: cvAttachment.content,
                  filename: cvAttachment.filename
                }
              }
            );
            
            if (pdfError) {
              console.error("❌ PDF parsing failed:", pdfError);
              cvContent = emailBody; // Fallback to email body
            } else {
              cvContent = pdfData.text || emailBody;
              console.log(`✅ PDF text extracted: ${cvContent.length} characters, first 200: ${cvContent.substring(0, 200)}...`);
            }
          } catch (pdfError) {
            console.error("PDF parsing error:", pdfError);
            if (pdfError instanceof Error) {
              console.error("PDF error details:", pdfError.message, pdfError.stack);
            }
            cvContent = emailBody; // Fallback to email body
          }
        } else {
          cvContent = emailBody;
        }
      }
    }

    // AI Analysis with Lovable AI (Gemini 2.5 Flash)
    console.log("Starting AI analysis...");
    const aiPrompt = `Analyseer deze sollicitatie en CV en extract de volgende informatie in JSON formaat:

Email: ${applicantEmail}
Onderwerp: ${emailSubject}
Bericht: ${emailBody}
CV inhoud: ${cvContent.substring(0, 2000)}

Geef terug in dit EXACTE JSON formaat (geen extra tekst):
{
  "full_name": "Voor- en achternaam",
  "telefoonnummer": "06-12345678 of null",
  "email": "${applicantEmail}",
  "adres": "Straat + huisnummer of null",
  "postcode": "1234AB of null",
  "woonplaats": "Amsterdam of null",
  "functie_niveau": "VIG, VP3, VP4, HBO-V, of Helpende 2",
  "werkvorm": "ZZP of Uitzendkracht",
  "skills": ["skill1", "skill2"],
  "regio": "Utrecht, Amsterdam, etc",
  "gewenst_uurloon": 45,
  "vog_date": "2025-01-15 of null",
  "big_nummer": "123456789 of null",
  "heeft_auto": true,
  "heeft_rijbewijs": true,
  "kvk_nummer": "12345678 of null",
  "btw_nummer": "NL123456789B01 of null",
  "missing_info": ["VOG", "BIG-nummer", "Adres", "Telefoonnummer"],
  "confidence": 0.8
}

**KRITIEK - functie_niveau moet EXACT een van deze waarden zijn:**
- "VIG" (voor Verzorgende IG)
- "VP3" (voor Verzorgende Niveau 3)
- "VP4" (voor Verzorgende Niveau 4)
- "HBO-V" (voor HBO Verpleegkundige)
- "Helpende 2"

Belangrijk:
- functie_niveau: gebruik exact VIG, VP3, VP4, HBO-V, of Helpende 2
- werkvorm: gebruik exact ZZP of Uitzendkracht
- Als info ontbreekt, gebruik null
- missing_info moet een array zijn van ALLE ontbrekende zaken
- gewenst_uurloon is een getal (euro per uur)
- vog_date is een datum (YYYY-MM-DD format)
- heeft_auto en heeft_rijbewijs zijn boolean (true/false)`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Je bent een HR assistent die CV's analyseert voor zorgverleners. Geef altijd pure JSON terug zonder markdown code blocks." },
          { role: "user", content: aiPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    let extractedData;
    
    try {
      const aiContent = aiResult.choices[0].message.content;
      console.log("AI raw response:", aiContent);
      
      // Remove markdown code blocks if present
      const cleanContent = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      extractedData = JSON.parse(cleanContent);
      console.log("Extracted data:", extractedData);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback with minimal data
      extractedData = {
        full_name: applicantEmail.split("@")[0],
        telefoonnummer: null,
        email: applicantEmail,
        adres: null,
        postcode: null,
        woonplaats: null,
        functie_niveau: "VP4",
        werkvorm: "Uitzendkracht",
        skills: [],
        regio: null,
        gewenst_uurloon: null,
        vog_date: null,
        big_nummer: null,
        heeft_auto: false,
        heeft_rijbewijs: false,
        kvk_nummer: null,
        btw_nummer: null,
        missing_info: ["VOG", "BIG-nummer", "Tarief", "Regio", "Adres", "Telefoonnummer", "Auto", "Rijbewijs"],
        confidence: 0.3,
      };
    }

    // 🔧 POST-PROCESSING: Map functie_niveau variations to exact DB values
    if (extractedData.functie_niveau) {
      const functieNiveauMapping: Record<string, string> = {
        "verzorgende ig": "VIG",
        "verzorgende IG": "VIG",
        "vig": "VIG",
        "verzorgende niveau 3": "VP3",
        "verzorgende 3": "VP3",
        "vp3": "VP3",
        "verzorgende niveau 4": "VP4",
        "verzorgende 4": "VP4",
        "vp4": "VP4",
        "hbo verpleegkundige": "HBO-V",
        "hbo-v": "HBO-V",
        "hbov": "HBO-V",
        "helpende": "Helpende 2",
        "helpende 2": "Helpende 2",
        "helpende niveau 2": "Helpende 2",
      };

      const normalized = extractedData.functie_niveau.toLowerCase().trim();
      if (functieNiveauMapping[normalized]) {
        console.log(`Mapped functie_niveau: "${extractedData.functie_niveau}" → "${functieNiveauMapping[normalized]}"`);
        extractedData.functie_niveau = functieNiveauMapping[normalized];
      }
    }

    // 🧠 HR SPECIALIST POST-PROCESSING: Detect placeholder phones and generate smart missing_info
    const PLACEHOLDER_PHONE_PATTERNS = [
      /^06[-\s]?0{6,}$/,              // 06-00000000, 06 000000
      /^06[-\s]?1234567[89]?$/,       // 06-12345678, 06-123456789
      /^000/,                          // starts with 000
      /^06[-\s]?9{6,}$/,              // 06-99999999
      /^(\d)\1{7,}$/,                  // all same digit like 00000000
      /^0612345/,                      // obvious test pattern
    ];
    
    // Check for placeholder phone and set to null if detected
    if (extractedData.telefoonnummer) {
      const phone = extractedData.telefoonnummer;
      const cleanedPhone = phone.replace(/[\s-]/g, '');
      const isPlaceholder = PLACEHOLDER_PHONE_PATTERNS.some(p => p.test(phone) || p.test(cleanedPhone));
      
      if (isPlaceholder) {
        console.log(`🧠 HR Smart: Detected placeholder phone "${phone}" - setting to null`);
        extractedData.telefoonnummer = null;
        if (!extractedData.missing_info.includes('Telefoonnummer')) {
          extractedData.missing_info.push('Telefoonnummer');
        }
      }
    }
    
    // 💼 ZZP-specific required fields check
    if (extractedData.werkvorm === 'ZZP') {
      if (!extractedData.gewenst_uurloon && !extractedData.missing_info.includes('Uurtarief')) {
        console.log('🧠 HR Smart: ZZP missing uurtarief - adding to missing_info');
        extractedData.missing_info.push('Uurtarief');
      }
      if (!extractedData.kvk_nummer && !extractedData.missing_info.includes('KvK-nummer')) {
        console.log('🧠 HR Smart: ZZP missing KvK - adding to missing_info');
        extractedData.missing_info.push('KvK-nummer');
      }
      if (!extractedData.btw_nummer && !extractedData.missing_info.includes('BTW-nummer')) {
        console.log('🧠 HR Smart: ZZP missing BTW - adding to missing_info');
        extractedData.missing_info.push('BTW-nummer');
      }
      if (!extractedData.vog_date && !extractedData.missing_info.includes('VOG')) {
        console.log('🧠 HR Smart: ZZP missing VOG - adding to missing_info');
        extractedData.missing_info.push('VOG');
      }
    }
    
    // 🌙 Night/weekend availability check
    if (extractedData.nachtdienst_bereid === null || extractedData.nachtdienst_bereid === undefined) {
      if (!extractedData.missing_info.includes('Nachtdienst bereidheid')) {
        extractedData.missing_info.push('Nachtdienst bereidheid');
      }
    }
    if (extractedData.weekenddienst_bereid === null || extractedData.weekenddienst_bereid === undefined) {
      if (!extractedData.missing_info.includes('Weekenddienst bereidheid')) {
        extractedData.missing_info.push('Weekenddienst bereidheid');
      }
    }

    // Calculate completeness score (0-100%) - HR Specialist weighted scoring
    const fieldWeights: Record<string, number> = {
      full_name: 10,
      telefoonnummer: 8,
      email: 10,
      adres: 3,
      postcode: 3,
      woonplaats: 4,
      functie_niveau: 15,
      werkvorm: 10,
      skills: 4,
      regio: 10,
      // ZZP-specific weights (only count if ZZP)
      gewenst_uurloon: extractedData.werkvorm === 'ZZP' ? 8 : 2,
      kvk_nummer: extractedData.werkvorm === 'ZZP' ? 5 : 0,
      btw_nummer: extractedData.werkvorm === 'ZZP' ? 3 : 0,
      vog_date: 5,
      big_nummer: 3,
      nachtdienst_bereid: 3,
      weekenddienst_bereid: 3,
    };
    
    let earnedPoints = 0;
    let totalPoints = 0;
    
    for (const [field, weight] of Object.entries(fieldWeights)) {
      if (weight === 0) continue;
      totalPoints += weight;
      
      const value = extractedData[field];
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          earnedPoints += weight;
        } else if (!Array.isArray(value)) {
          earnedPoints += weight;
        }
      }
    }
    
    const completenessScore = Math.round((earnedPoints / totalPoints) * 100);
    
    console.log(`Completeness (HR-weighted): ${completenessScore}% (${earnedPoints}/${totalPoints} points)`);
    console.log(`Missing info count: ${extractedData.missing_info?.length || 0}`);

    // Insert application record (WITHOUT professional_id - will be created at 100% completeness)
    console.log("Creating application record...");
    const { data: application, error: appError } = await supabase
      .from("professional_applications")
      .insert({
        org_id: orgId,
        professional_id: null, // ⚠️ NULL - professional wordt pas aangemaakt bij 100% completeness
        email_from: applicantEmail,
        email_subject: emailSubject,
        email_body: emailBody,
        cv_file_path: cvFilePath,
        cv_file_name: cvFileName,
        status: "nieuw",
        completeness_score: completenessScore,
        missing_info: extractedData.missing_info || [],
        extracted_data: extractedData, // 🆕 Sla alle extracted data tijdelijk op
      })
      .select()
      .single();

    if (appError) {
      console.error("Application insert error:", appError);
      throw appError;
    }

    console.log("Application created:", application.id);

    // Generate follow-up questions based on missing info
    const missingInfo = extractedData.missing_info || [];
    let followUpQuestions = "";

    if (missingInfo.length > 0) {
      followUpQuestions = "\n\nOm je sollicitatie compleet te maken hebben we nog de volgende informatie nodig:\n\n";
      
      if (missingInfo.includes("VOG")) {
        followUpQuestions += "📋 **VOG (Verklaring Omtrent Gedrag)**: Heb je een geldige VOG? Zo ja, wat is de uitgiftedatum?\n\n";
      }
      if (missingInfo.includes("BIG-nummer")) {
        followUpQuestions += "🏥 **BIG-registratie**: Wat is je BIG-registratienummer?\n\n";
      }
      if (missingInfo.includes("Tarief") || missingInfo.includes("Uurloon")) {
        followUpQuestions += "💰 **Gewenst uurloon**: Wat is je gewenste uurloon (exclusief BTW)?\n\n";
      }
      if (missingInfo.includes("Regio")) {
        followUpQuestions += "📍 **Regio voorkeur**: In welke regio(s) wil je werken?\n\n";
      }
      if (missingInfo.includes("Adres")) {
        followUpQuestions += "🏠 **Adres**: Wat is je volledige adres (straat, nummer, postcode, woonplaats)?\n\n";
      }
      if (missingInfo.includes("Telefoonnummer")) {
        followUpQuestions += "📞 **Telefoonnummer**: Wat is je telefoonnummer?\n\n";
      }
      if (missingInfo.includes("Auto")) {
        followUpQuestions += "🚗 **Auto**: Heb je een eigen auto?\n\n";
      }
      if (missingInfo.includes("Rijbewijs")) {
        followUpQuestions += "🪪 **Rijbewijs**: Heb je een geldig rijbewijs?\n\n";
      }
      if (extractedData.werkvorm === "ZZP" && missingInfo.includes("KvK")) {
        followUpQuestions += "🏢 **KvK-nummer**: Wat is je KvK-nummer?\n\n";
      }
      if (extractedData.werkvorm === "ZZP" && missingInfo.includes("BTW")) {
        followUpQuestions += "📊 **BTW-nummer**: Wat is je BTW-nummer?\n\n";
      }
    }

    // Send follow-up email
    console.log("Sending follow-up email...");
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎉 Sollicitatie Ontvangen!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                Beste ${extractedData.full_name},
              </h2>
              <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Bedankt voor je sollicitatie bij <strong>CitoZorg</strong>! We hebben je CV en informatie ontvangen en bekijken je profiel momenteel.
              </p>
              ${followUpQuestions ? `
                <div style="background-color: #fef3c7; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #f59e0b;">
                  <p style="margin: 0 0 15px 0; color: #92400e; font-size: 16px; font-weight: 600;">
                    ⚠️ Aanvullende informatie nodig
                  </p>
                  <div style="color: #1a1a1a; font-size: 15px; line-height: 1.8;">
                    ${followUpQuestions.replace(/\n/g, "<br>")}
                  </div>
                </div>
              ` : `
                <div style="background-color: #d1fae5; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #10b981;">
                  <p style="margin: 0; color: #065f46; font-size: 16px; font-weight: 600;">
                    ✅ Je sollicitatie is compleet!
                  </p>
                  <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">
                    We nemen binnen 2 werkdagen contact met je op voor een kennismakingsgesprek.
                  </p>
                </div>
              `}
              <p style="margin: 25px 0 0 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Je kunt op deze email antwoorden met de gevraagde informatie. We kijken ernaar uit om met je kennis te maken!
              </p>
              <p style="margin: 30px 0 0 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Met vriendelijke groet,<br>
                <strong>Het CitoZorg Recruitment Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                CitoZorg - Kwaliteit in Zorg
              </p>
              <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">
                <a href="mailto:personeel@citozorg.nl" style="color: #667eea; text-decoration: none;">personeel@citozorg.nl</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const emailResult = await resend.emails.send({
      from: "CitoZorg Recruitment <personeel@citozorg.nl>",
      to: [applicantEmail],
      subject: `Re: ${emailSubject}`,
      html: emailHtml,
    });

    console.log("Email sent:", emailResult);

    // Log conversation
    await supabase.from("application_conversations").insert({
      application_id: application.id,
      role: "assistant",
      content: followUpQuestions || "Je sollicitatie is compleet ontvangen.",
      metadata: {
        email_id: emailResult.data?.id,
        missing_info: missingInfo,
        completeness_score: completenessScore,
      },
    });

    // Note: Auto-learning will happen when professional is created (at 100% completeness)

    console.log("=== Application Processing Complete ===");

    return new Response(
      JSON.stringify({
        success: true,
        professional_id: null, // Will be created when completeness reaches 100%
        application_id: application.id,
        completeness_score: completenessScore,
        missing_info: missingInfo,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Error processing application:", error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

Deno.serve(handler);
