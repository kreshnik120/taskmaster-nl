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
    email_id?: string; // Resend inbound email ID - CRITICAL for fetching body
    id?: string; // Alternative ID field
    from: string;
    subject: string;
    to: string[];
    html?: string;
    text?: string;
    headers?: Record<string, string>;
    in_reply_to?: string;
    message_id?: string;
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
          content_id: z.string().nullable().optional() // For inline images
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
      
      // 🔍 ENHANCED DEBUG: Log FULL payload.data for email ID discovery
      console.log("========================================");
      console.log("🔍 FULL PAYLOAD.DATA STRUCTURE:");
      console.log(JSON.stringify(emailData, null, 2));
      console.log("========================================");
      
      // 🔍 Log all available headers
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");
      
      console.log("🔍 WEBHOOK HEADERS:");
      console.log("   svix-id:", svixId);
      console.log("   svix-timestamp:", svixTimestamp);
      console.log("   svix-signature:", svixSignature ? "[present]" : "[missing]");
      
      // 🔑 EMAIL ID RESOLUTION: Try multiple sources
      // NOTE: svix-id is for webhook verification, NOT for Resend API!
      // The actual email_id should come from payload.data
      const emailId = (emailData as any).email_id 
                   || (emailData as any).id 
                   || (emailData as any).message_id
                   || null;
      
      console.log("========================================");
      console.log("📧 EMAIL ID RESOLUTION (FORWARD):");
      console.log("   emailData.email_id:", (emailData as any).email_id);
      console.log("   emailData.id:", (emailData as any).id);
      console.log("   emailData.message_id:", (emailData as any).message_id);
      console.log("   svix-id (NOT for API!):", svixId);
      console.log("   → RESOLVED email_id:", emailId);
      console.log("   → email_id type:", typeof emailId);
      console.log("========================================");
      
      // Forward to handle-application-reply edge function with internal auth headers
      // Include full payload with all fields including email_id
      const forwardSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.substring(0, 32) || 'internal';
      
      console.log("📤 Forwarding to handle-application-reply with email_id:", emailId);
      
      const { data: replyData, error: replyError } = await supabase.functions.invoke('handle-application-reply', {
        body: {
          ...payload,
          // 🔑 Forward the resolved email_id (from payload.data, NOT svix-id)
          _forwarded_email_id: emailId,
          _debug_svix_id: svixId, // Keep svix-id for debugging only
          data: {
            ...emailData,
            email_id: emailId
          }
        },
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
    let emailBody = emailData.text || emailData.html || "";

    console.log("From:", applicantEmail);
    console.log("Subject:", emailSubject);
    console.log("Initial email body length:", emailBody.length);
    
    // 📧 FETCH EMAIL BODY via Resend Receiving API if empty (common for inbound webhooks)
    if (!emailBody || emailBody.trim().length === 0) {
      console.log("⚠️ Email body is empty - fetching via Resend Receiving API...");
      
      // 🔑 CORRECT: Use email_id from payload.data, NOT svix-id (which is for webhook verification)
      // According to Resend docs: resend.emails.receiving.get(event.data.email_id)
      const emailId = (emailData as any).email_id || (emailData as any).id;
      console.log("📧 email_id for Resend Receiving API:", emailId);
      console.log("📧 Full emailData keys:", Object.keys(emailData));
      
      if (emailId) {
        try {
          // Resend Receiving API endpoint: /emails/receiving/{email_id}
          // NOT /emails/{svix-id} - that's the wrong endpoint!
          const emailFetchResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json"
            }
          });
          
          console.log("📧 Resend Receiving API response status:", emailFetchResponse.status);
          
          if (emailFetchResponse.ok) {
            const fullEmail = await emailFetchResponse.json();
            console.log("✅ Email fetched via Resend Receiving API:", {
              hasText: !!fullEmail.text,
              hasHtml: !!fullEmail.html,
              textLength: fullEmail.text?.length || 0,
              htmlLength: fullEmail.html?.length || 0
            });
            emailBody = fullEmail.text || fullEmail.html || "";
          } else {
            const errorBody = await emailFetchResponse.text();
            console.warn("⚠️ Could not fetch email via Resend Receiving API:", {
              status: emailFetchResponse.status,
              error: errorBody
            });
          }
        } catch (fetchError) {
          console.error("❌ Error fetching email body:", fetchError);
        }
      } else {
        console.warn("⚠️ No email_id available in webhook payload to fetch email body");
        console.log("📧 Available payload.data fields:", JSON.stringify(emailData, null, 2).substring(0, 500));
      }
      
      console.log("📧 Final email body length after fetch:", emailBody.length);
    }
    
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

        // 🚀 IMPROVED: Use extract-cv-data with Vision API for better PDF analysis
        // This bypasses the broken text extraction and uses Gemini Vision directly
        if (cvAttachment.content_type === "application/pdf") {
          try {
            console.log("📄 Calling extract-cv-data (Vision API) for PDF analysis...");
            
            // Call extract-cv-data which uses Gemini Vision for direct PDF analysis
            const { data: cvExtractionData, error: cvExtractionError } = await supabase.functions.invoke(
              'extract-cv-data',
              {
                body: {
                  pdfBase64: cvAttachment.content,
                  filename: cvAttachment.filename
                }
              }
            );
            
            if (cvExtractionError) {
              console.error("❌ CV Vision extraction failed:", cvExtractionError);
              cvContent = emailBody; // Fallback to email body
            } else if (cvExtractionData?.extractedData) {
              console.log("✅ CV extracted via Vision API with confidence:", cvExtractionData.extractedData?.global_confidence);
              // Store the extracted data for later use - skip the second AI call
              (req as any)._cvExtractionData = cvExtractionData.extractedData;
              cvContent = "[CV extracted via Vision API - structured data available]";
            } else {
              console.warn("⚠️ CV extraction returned no data, falling back to email body");
              cvContent = emailBody;
            }
          } catch (cvError) {
            console.error("CV extraction error:", cvError);
            if (cvError instanceof Error) {
              console.error("CV error details:", cvError.message, cvError.stack);
            }
            cvContent = emailBody; // Fallback to email body
          }
        } else {
          cvContent = emailBody;
        }
      }
    }

    // 🚀 IMPROVED: Use pre-extracted CV data if available, otherwise analyze email only
    let extractedData: any;
    const preExtractedCvData = (req as any)._cvExtractionData;
    
    // Helper to get value from new confidence format
    const getValue = (field: any) => {
      if (field === null || field === undefined) return null;
      if (typeof field === 'object' && 'value' in field) return field.value;
      return field;
    };
    
    if (preExtractedCvData) {
      console.log("📊 Using pre-extracted CV data from Vision API");
      console.log("Global confidence:", preExtractedCvData.global_confidence);
      
      // Convert from new per-field confidence format to flat format for compatibility
      extractedData = {
        full_name: getValue(preExtractedCvData.naam),
        telefoonnummer: getValue(preExtractedCvData.telefoon),
        email: getValue(preExtractedCvData.email) || applicantEmail,
        adres: null, // Not typically in CV
        postcode: getValue(preExtractedCvData.postcode),
        woonplaats: getValue(preExtractedCvData.woonplaats),
        functie_niveau: getValue(preExtractedCvData.functie_niveau),
        werkvorm: getValue(preExtractedCvData.werkvorm),
        skills: getValue(preExtractedCvData.certificaten) || [],
        regio: getValue(preExtractedCvData.regio),
        gewenst_uurloon: null, // Not typically in CV
        vog_date: null, // Requires separate document
        big_nummer: getValue(preExtractedCvData.BIG_nummer),
        heeft_auto: getValue(preExtractedCvData.eigen_vervoer),
        heeft_rijbewijs: getValue(preExtractedCvData.rijbewijs),
        kvk_nummer: null, // Requires separate lookup
        btw_nummer: null, // Requires separate lookup
        // Enhanced fields from Vision extraction
        jaren_ervaring: getValue(preExtractedCvData.jaren_ervaring),
        ervaring_sector: getValue(preExtractedCvData.ervaring_sector) || [],
        doelgroep_ervaring: getValue(preExtractedCvData.doelgroep_ervaring) || [],
        nachtdienst_bereid: getValue(preExtractedCvData.nachtdienst_bereid),
        weekenddienst_bereid: getValue(preExtractedCvData.weekenddienst_bereid),
        beschikbaarheid: getValue(preExtractedCvData.beschikbaarheid),
        talen: getValue(preExtractedCvData.talen) || [],
        has_profile_photo: getValue(preExtractedCvData.has_profile_photo),
        missing_info: [],
        confidence: preExtractedCvData.global_confidence || 0.7,
        _source: 'vision_api'
      };
      
      console.log("Converted extraction data:", JSON.stringify(extractedData, null, 2));
    } else {
      // Fallback: AI Analysis from email text only (no CV or CV parsing failed)
      console.log("📧 Analyzing from email text only (no CV data available)");
      const aiPrompt = `Analyseer deze sollicitatie email en extract de volgende informatie in JSON formaat:

Email: ${applicantEmail}
Onderwerp: ${emailSubject}
Bericht: ${emailBody}

Geef terug in dit EXACTE JSON formaat (geen extra tekst):
{
  "full_name": "Voor- en achternaam of null",
  "telefoonnummer": "06-12345678 of null",
  "email": "${applicantEmail}",
  "functie_niveau": "VIG, HBO-V, Verpleegkundige MBO, Helpende, Begeleider of null",
  "werkvorm": "ZZP of Uitzendkracht of null",
  "regio": "Utrecht, Amsterdam, etc of null",
  "skills": [],
  "confidence": 0.5
}

Belangrijk:
- Extract alleen info die EXPLICIET in de email staat
- Als info ontbreekt, gebruik null (niet gokken!)
- confidence: hoe zeker je bent over de extractie (0.0-1.0)`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Je bent een HR assistent. Geef altijd pure JSON terug zonder markdown code blocks. Wees conservatief: als iets niet expliciet staat, gebruik null." },
            { role: "user", content: aiPrompt }
          ],
          temperature: 0.2,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI API error:", errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiResult = await aiResponse.json();
      
      try {
        const aiContent = aiResult.choices[0].message.content;
        console.log("AI raw response:", aiContent);
        
        // Remove markdown code blocks if present
        const cleanContent = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        extractedData = JSON.parse(cleanContent);
        extractedData._source = 'email_only';
        console.log("Extracted data from email:", extractedData);
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        // Fallback with minimal data
        extractedData = {
          full_name: null,
          telefoonnummer: null,
          email: applicantEmail,
          adres: null,
          postcode: null,
          woonplaats: null,
          functie_niveau: null,
          werkvorm: null,
          skills: [],
          regio: null,
          gewenst_uurloon: null,
          vog_date: null,
          big_nummer: null,
          heeft_auto: null,
          heeft_rijbewijs: null,
          kvk_nummer: null,
          btw_nummer: null,
          missing_info: [],
          confidence: 0.2,
          _source: 'fallback'
        };
      }
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

    // 🔧 Ensure missing_info array exists
    if (!extractedData.missing_info || !Array.isArray(extractedData.missing_info)) {
      extractedData.missing_info = [];
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
      const phone = String(extractedData.telefoonnummer);
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
    
    // 📋 AUTO-GENERATE missing_info based on critical missing fields
    const criticalFields = [
      { field: 'full_name', label: 'Naam' },
      { field: 'telefoonnummer', label: 'Telefoonnummer' },
      { field: 'functie_niveau', label: 'Functie niveau' },
      { field: 'regio', label: 'Regio' },
    ];
    
    for (const { field, label } of criticalFields) {
      if (!extractedData[field] && !extractedData.missing_info.includes(label)) {
        extractedData.missing_info.push(label);
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
    }
    
    // 📄 Document verification fields (always important but not blocking)
    if (!extractedData.vog_date && !extractedData.missing_info.includes('VOG')) {
      extractedData.missing_info.push('VOG');
    }
    if (!extractedData.big_nummer && !extractedData.missing_info.includes('BIG-nummer')) {
      extractedData.missing_info.push('BIG-nummer');
    }

    // 🧮 IMPROVED: Calculate completeness score with REALISTIC weights
    // Velden die typisch WEL in een eerste sollicitatie zitten: hoge weight
    // Velden die typisch NIET in eerste email zitten: lage weight
    const fieldWeights: Record<string, number> = {
      // === ESSENTIEEL (altijd beschikbaar via email/CV) ===
      full_name: 15,          // Naam is kritiek - verhoogd van 10
      email: 10,              // Altijd beschikbaar
      telefoonnummer: 12,     // Essentieel voor contact - verhoogd van 8
      functie_niveau: 20,     // Kritiek voor matching - verhoogd van 15
      
      // === BELANGRIJK (vaak in CV) ===
      regio: 10,              // Belangrijk voor matching
      werkvorm: 8,            // ZZP vs uitzend - verlaagd van 10
      skills: 5,              // Certificaten uit CV - verhoogd van 4
      jaren_ervaring: 5,      // Nieuw: uit CV extractie
      ervaring_sector: 5,     // Nieuw: VVT/GGZ etc.
      doelgroep_ervaring: 4,  // Nieuw: ouderen/psychiatrie etc.
      
      // === MINDER KRITIEK (vaak niet in eerste email/CV) ===
      woonplaats: 3,          // Vaak afgeleid uit regio - verlaagd van 4
      postcode: 1,            // Zelden in eerste email - verlaagd van 3
      adres: 1,               // Zelden in eerste email - verlaagd van 3
      heeft_auto: 2,          // Nice to have
      heeft_rijbewijs: 2,     // Nice to have
      
      // === FOLLOW-UP VELDEN (niet verwacht in eerste email) ===
      vog_date: 2,            // Aparte document upload - verlaagd van 5
      big_nummer: 2,          // Aparte verificatie - verlaagd van 3
      nachtdienst_bereid: 1,  // Follow-up vraag - verlaagd van 3
      weekenddienst_bereid: 1, // Follow-up vraag - verlaagd van 3
      beschikbaarheid: 2,     // Nieuw: uren per week
      
      // === ZZP-SPECIFIEK (alleen relevant voor ZZP) ===
      gewenst_uurloon: extractedData.werkvorm === 'ZZP' ? 6 : 1,
      kvk_nummer: extractedData.werkvorm === 'ZZP' ? 3 : 0,
      btw_nummer: extractedData.werkvorm === 'ZZP' ? 2 : 0,
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
    
    // Log detailed breakdown for debugging
    console.log(`📊 Completeness (IMPROVED weights): ${completenessScore}% (${earnedPoints}/${totalPoints} points)`);
    console.log(`   Source: ${extractedData._source || 'unknown'}`);
    console.log(`   Essential fields found: naam=${!!extractedData.full_name}, email=${!!extractedData.email}, telefoon=${!!extractedData.telefoonnummer}, functie=${!!extractedData.functie_niveau}`);
    console.log(`   Missing info count: ${extractedData.missing_info?.length || 0}`);

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

    // =====================================================
    // 🎯 AUTOMATISCHE INTERVIEW SLOTS BIJ >= 85% COMPLETENESS
    // =====================================================
    const INTERVIEW_THRESHOLD = parseInt(Deno.env.get('INTERVIEW_THRESHOLD') || '85');
    
    if (completenessScore >= INTERVIEW_THRESHOLD) {
      console.log(`🎉 Completeness ${completenessScore}% >= threshold ${INTERVIEW_THRESHOLD}%, triggering auto-send-interview-slots...`);
      
      try {
        const { data: interviewResult, error: interviewError } = await supabase.functions.invoke('auto-send-interview-slots', {
          body: {
            application_id: application.id,
            trigger_source: 'initial_application',
          }
        });
        
        if (interviewError) {
          console.error("Error auto-sending interview slots:", interviewError);
        } else {
          console.log("✅ Auto interview slots result:", interviewResult);
        }
      } catch (interviewErr) {
        console.error("Exception auto-sending interview slots:", interviewErr);
      }
    } else {
      // ✅ Email verzending is verplaatst naar AI Agent Orchestrator
      // Dit voorkomt duplicate emails - de orchestrator handelt:
      // - Dynamische org branding (ABCzorg/CitoZorg)
      // - Follow-up counting (1/3, 2/3, 3/3)
      // - Deduplicatie checks
      // - Intelligente timing
      // 
      // De flow is nu:
      // 1. process-application-email: Creëert sollicitatie + logt system event
      // 2. process-system-events: Detecteert nieuwe sollicitatie → creëert application_intake_completion goal
      // 3. ai-agent-orchestrator: Verwerkt goal → stuurt gepersonaliseerde follow-up email
      
      const missingInfo = extractedData.missing_info || [];
      console.log(`📧 Completeness ${completenessScore}% < threshold ${INTERVIEW_THRESHOLD}% - follow-up via AI Agent Orchestrator`);
      console.log(`📋 Missing info voor orchestrator: ${missingInfo.join(', ') || 'geen'}`);
    }
    
    // Note: Auto-learning will happen when professional is created (at 100% completeness)

    console.log("=== Application Processing Complete ===");

    return new Response(
      JSON.stringify({
        success: true,
        professional_id: null, // Will be created when completeness reaches 100%
        application_id: application.id,
        completeness_score: completenessScore,
        missing_info: extractedData.missing_info || [],
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
