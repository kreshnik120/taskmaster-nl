import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { normalizeFunctieNiveau, normalizeWerkvorm, getOrganizationById, getEmailConfig } from '../_shared/healthcare-mappings.ts';

interface ResendWebhookPayload {
  type: string;
  _forwarded_email_id?: string; // Email ID from process-application-email forward
  data: {
    email_id?: string; // Resend inbound email ID - CRITICAL for fetching body via Receiving API
    id?: string; // Alternative ID field
    from: string;
    to?: string | string[];
    subject: string;
    text?: string;
    html?: string;
    in_reply_to?: string;
    references?: string;
    message_id?: string;
    headers?: Record<string, string>;
    attachments?: Array<{
      filename: string;
      content?: string;
      content_type: string;
      content_disposition?: string;
      content_id?: string;
      size?: number;
    }>;
  };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET");

    const supabase = createAdminClient();

    // 🔒 SECURITY: Check for internal forward from process-application-email
    let payload: ResendWebhookPayload;
    const isInternalForward = req.headers.get('x-internal-forward') === 'true';
    const forwardSecret = req.headers.get('x-forward-secret');
    const expectedSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.substring(0, 32);
    
    if (isInternalForward && forwardSecret === expectedSecret) {
      // ✅ Internal forward from process-application-email - already verified
      console.log("✅ Internal forward detected - skipping signature verification");
      payload = await req.json();
    } else if (webhookSecret) {
      // 🔒 Direct Resend webhook call - verify signature
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
    const ResendReplyWebhookSchema = z.object({
      type: z.string(),
      data: z.object({
        from: z.string().email().max(255),
        to: z.union([z.string(), z.array(z.string())]).optional(),
        subject: z.string().max(500),
        text: z.string().max(500000).optional(),
        html: z.string().max(500000).optional(),
        in_reply_to: z.string().max(255).optional(),
        references: z.string().max(1000).optional(),
        message_id: z.string().max(255).optional(),
        headers: z.record(z.string()).optional(),
        attachments: z.array(z.object({
          filename: z.string().max(255),
          content: z.string().max(20000000).optional(),
          content_type: z.string().max(100),
          content_disposition: z.string().optional(),
          content_id: z.string().nullable().optional(),
          size: z.number().optional()
        })).max(10).optional(),
        email_id: z.string().optional(),
        id: z.string().optional()
      })
    });
    
    const replyValidation = ResendReplyWebhookSchema.safeParse(payload);
    if (!replyValidation.success) {
      const errors = replyValidation.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.error("❌ Webhook payload validation failed:", errors);
      return new Response(
        JSON.stringify({ error: `Invalid payload: ${errors}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    payload = replyValidation.data as ResendWebhookPayload;
    console.log("=== Processing Application Reply ===");
    console.log("Webhook type:", payload.type);

    // Only process email.received events
    if (payload.type !== "email.received") {
      console.log("Ignoring non-email event");
      return new Response(JSON.stringify({ message: "Event ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { from, to, subject, in_reply_to, message_id } = payload.data;
    
    // 🔍 ENHANCED DEBUG LOGGING: Full webhook payload analysis
    console.log("========================================");
    console.log("🔍 FULL WEBHOOK PAYLOAD ANALYSIS");
    console.log("========================================");
    console.log("📋 Top-level payload keys:", Object.keys(payload).join(', '));
    console.log("📋 payload.data keys:", Object.keys(payload.data).join(', '));
    
    // Log all payload.data fields (except large content)
    for (const [key, value] of Object.entries(payload.data)) {
      if (key === 'attachments') continue; // Handle separately
      if (key === 'html' || key === 'text') {
        const strVal = String(value || '');
        console.log(`📧 ${key}: ${strVal.length} chars - "${strVal.substring(0, 100)}..."`);
      } else if (typeof value === 'object') {
        console.log(`📧 ${key}:`, JSON.stringify(value).substring(0, 200));
      } else {
        console.log(`📧 ${key}: ${value}`);
      }
    }
    
    // 🔍 DETAILED ATTACHMENT ANALYSIS
    const attachments = payload.data.attachments || [];
    console.log("========================================");
    console.log(`📎 ATTACHMENTS ANALYSIS: ${attachments.length} attachments`);
    console.log("========================================");
    
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      console.log(`📎 Attachment ${i + 1}:`);
      console.log(`   - filename: ${att.filename}`);
      console.log(`   - content_type: ${att.content_type}`);
      console.log(`   - content_disposition: ${att.content_disposition || 'N/A'}`);
      console.log(`   - size: ${att.size || 'N/A'} bytes`);
      console.log(`   - content_id: ${att.content_id || 'N/A'}`);
      console.log(`   - has content: ${att.content ? 'YES' : 'NO'}`);
      if (att.content) {
        console.log(`   - content length: ${att.content.length} chars`);
        console.log(`   - content preview (first 200): ${att.content.substring(0, 200)}...`);
        
        // If it's a text file or .eml, try to decode
        if (att.content_type.includes('text') || att.filename.endsWith('.eml') || att.content_type.includes('message')) {
          try {
            // Try base64 decode
            const decoded = atob(att.content);
            console.log(`   - DECODED content (first 500): ${decoded.substring(0, 500)}...`);
          } catch (e) {
            console.log(`   - Content appears to be raw text, not base64`);
            console.log(`   - Raw content (first 500): ${att.content.substring(0, 500)}...`);
          }
        }
      }
    }
    
    // Check for any additional fields that might contain body
    const dataAny = payload.data as any;
    const potentialBodyFields = ['body', 'content', 'raw', 'message', 'email_body', 'plain_text', 'html_content'];
    console.log("========================================");
    console.log("🔍 CHECKING ALTERNATIVE BODY FIELDS");
    console.log("========================================");
    for (const field of potentialBodyFields) {
      if (dataAny[field]) {
        const val = String(dataAny[field]);
        console.log(`✅ Found '${field}': ${val.length} chars - "${val.substring(0, 100)}..."`);
      }
    }
    
    // Check for nested structures
    if (dataAny.email) {
      console.log("📧 Found nested 'email' object:", JSON.stringify(dataAny.email).substring(0, 500));
    }
    if (dataAny.payload) {
      console.log("📧 Found nested 'payload' object:", JSON.stringify(dataAny.payload).substring(0, 500));
    }
    
    console.log("========================================");
    console.log("🔍 END PAYLOAD ANALYSIS");
    console.log("========================================");
    
    // 📧 CRITICAL FIX: Resend webhook doesn't include email body!
    // Must use resend.emails.receiving.get(email_id) to fetch content
    let emailText = '';
    
    // 🔑 PRIORITY: Check forwarded email_id from process-application-email first
    const forwardedEmailId = (payload as any)._forwarded_email_id;
    const dataEmailId = payload.data.email_id;
    const dataId = payload.data.id;
    const emailId = forwardedEmailId || dataEmailId || dataId || message_id;
    
    console.log("========================================");
    console.log("📧 EMAIL ID RESOLUTION:");
    console.log("   _forwarded_email_id:", forwardedEmailId);
    console.log("   payload.data.email_id:", dataEmailId);
    console.log("   payload.data.id:", dataId);
    console.log("   message_id:", message_id);
    console.log("   → RESOLVED email_id:", emailId);
    console.log("========================================");
    
    // First check if body is in webhook payload (sometimes Resend includes it)
    if (payload.data.text?.trim() || payload.data.html?.trim()) {
      emailText = payload.data.text || payload.data.html || '';
      console.log(`✅ Email body found in webhook payload (${emailText.length} chars)`);
    }
    
    // Check if body might be in an attachment (some email systems send body as attachment)
    if (!emailText.trim() && attachments.length > 0) {
      console.log("📎 Checking attachments for email body...");
      for (const att of attachments) {
        // Check for .eml files or text content that might contain the email body
        if (att.content && (att.content_type.includes('text/plain') || att.content_type.includes('text/html'))) {
          try {
            emailText = atob(att.content);
            console.log(`✅ Found email body in attachment ${att.filename}: ${emailText.length} chars`);
            break;
          } catch {
            emailText = att.content;
            console.log(`✅ Found raw email body in attachment ${att.filename}: ${emailText.length} chars`);
            break;
          }
        }
      }
    }
    
    // If body is empty, fetch via Resend Receiving API (the correct endpoint!)
    if (!emailText.trim() && emailId) {
      console.log("========================================");
      console.log("📧 RESEND API CALL DEBUG:");
      console.log("   Email ID value:", emailId);
      console.log("   Email ID type:", typeof emailId);
      console.log("   Email ID length:", emailId?.length);
      console.log("   Looks like UUID?:", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emailId || ''));
      console.log("   Looks like msg_xxx?:", /^msg_/.test(emailId || ''));
      console.log("========================================");
      
      const apiUrl = `https://api.resend.com/emails/receiving/${emailId}`;
      console.log("📧 Fetching email body from:", apiUrl);
      
      try {
        // 🔑 CORRECT API: Use /emails/receiving/{email_id} endpoint for inbound emails
        const emailResponse = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          console.log("✅ Successfully fetched email via Resend Receiving API");
          console.log("   Response fields:", Object.keys(emailData).join(', '));
          
          // Extract text or html content
          emailText = emailData.text || emailData.html || '';
          
          if (emailText) {
            console.log(`📄 Retrieved email body (${emailText.length} chars)`);
            console.log(`   First 200 chars: ${emailText.substring(0, 200)}...`);
          } else {
            console.log("⚠️ Email fetched but body fields empty");
            console.log("   Full response:", JSON.stringify(emailData).substring(0, 500));
          }
        } else {
          const errorText = await emailResponse.text();
          console.log(`⚠️ Resend Receiving API returned ${emailResponse.status}: ${errorText}`);
          
          // Fallback: Try the regular emails endpoint
          console.log("📧 Trying fallback: regular emails endpoint...");
          const fallbackResponse = await fetch(`https://api.resend.com/emails/${emailId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            emailText = fallbackData.text || fallbackData.html || '';
            if (emailText) {
              console.log(`✅ Fallback worked! Retrieved ${emailText.length} chars`);
            }
          }
        }
      } catch (apiError) {
        console.error("❌ Error fetching email via Resend API:", apiError);
      }
    }
    
    // Final check - if still empty, log debug info
    if (!emailText.trim()) {
      console.log("⚠️ Email body still empty after all attempts");
      console.log("   Available payload fields:", Object.keys(payload.data).join(', '));
      const debugPayload = { ...payload.data, attachments: `[${payload.data.attachments?.length || 0} items]` };
      console.log("   Full payload (debug):", JSON.stringify(debugPayload));
    }
    
    // Filter out inline attachments (Outlook signatures, embedded images)
    const realAttachments = payload.data.attachments?.filter(att => 
      att.content && att.content_disposition !== 'inline'
    ) || [];
    
    console.log("From:", from);
    console.log("Subject:", subject);
    console.log("In-Reply-To:", in_reply_to);
    console.log("Email body length:", emailText.length, "chars");
    console.log("Real attachments (excluding inline):", realAttachments.length);

    // Find the original conversation by matching in_reply_to with the email_id in metadata
    let applicationId: string | null = null;

    if (in_reply_to) {
      console.log("Looking up conversation by in_reply_to:", in_reply_to);
      const { data: conversations, error: convError } = await supabase
        .from("application_conversations")
        .select("application_id, metadata")
        .not("metadata", "is", null);

      if (convError) {
        console.error("Error fetching conversations:", convError);
      } else {
        console.log(`Found ${conversations?.length || 0} conversations to check`);
        
        // Find conversation where metadata.email_id matches in_reply_to
        const matchingConv = conversations?.find((conv) => {
          const metadata = conv.metadata as { email_id?: string };
          return metadata?.email_id === in_reply_to;
        });

        if (matchingConv) {
          applicationId = matchingConv.application_id;
          console.log("Found application_id via in_reply_to:", applicationId);
        }
      }
    }

    // Fallback 1: match by exact email address and subject
    if (!applicationId) {
      console.log("Trying fallback 1: matching by exact email and subject");
      const cleanSubject = subject.replace(/^(Re:|Antw:|Antwoord:)\s*/i, "").trim();
      
      const { data: application, error: appError } = await supabase
        .from("professional_applications")
        .select("id, email_from, email_subject")
        .eq("email_from", from)
        .ilike("email_subject", `%${cleanSubject}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (appError) {
        console.error("Error finding application:", appError);
      }

      if (application) {
        applicationId = application.id;
        console.log("Found application_id via exact email match:", applicationId);
      }
    }

    // Fallback 2: Fuzzy match on email local-part (before @) to handle domain variations
    // e.g., k.atashi@citozorg.nl vs k.atashi@exactzorg.nl
    if (!applicationId) {
      const emailLocalPart = from.split('@')[0]; // Extract "k.atashi" from "k.atashi@exactzorg.nl"
      console.log(`Trying fallback 2: fuzzy matching on local-part "${emailLocalPart}"`);
      
      const { data: fuzzyMatches, error: fuzzyError } = await supabase
        .from("professional_applications")
        .select("id, email_from, email_subject, created_at")
        .ilike("email_from", `${emailLocalPart}@%`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

      if (fuzzyError) {
        console.error("Error in fuzzy email search:", fuzzyError);
      }

      if (fuzzyMatches && fuzzyMatches.length > 0) {
        // Take most recent application matching the local-part
        const matchedApp = fuzzyMatches[0];
        applicationId = matchedApp.id;
        console.log(`Fuzzy match found! Email discrepancy detected:`);
        console.log(`  - Incoming email: ${from}`);
        console.log(`  - Stored email: ${matchedApp.email_from}`);
        console.log(`  - Application ID: ${applicationId}`);
        
        // Log this discrepancy for future reference
        if (matchedApp.email_from !== from) {
          console.log(`[EMAIL_DISCREPANCY] Local-part "${emailLocalPart}" matched across different domains`);
        }
      }
    }

    // Fallback 3: Match by extracted name in recent applications
    if (!applicationId) {
      console.log("Trying fallback 3: matching by recent applications with similar sender name");
      const senderName = from.split('@')[0].replace(/[._]/g, ' ').toLowerCase();
      
      const { data: recentApps, error: recentError } = await supabase
        .from("professional_applications")
        .select("id, email_from, extracted_data, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!recentError && recentApps) {
        for (const app of recentApps) {
          const extractedName = (app.extracted_data as any)?.naam?.toLowerCase() || '';
          const storedLocalPart = app.email_from?.split('@')[0].replace(/[._]/g, ' ').toLowerCase() || '';
          
          if (extractedName.includes(senderName) || storedLocalPart.includes(senderName)) {
            applicationId = app.id;
            console.log(`Found application via name matching: ${applicationId}`);
            console.log(`  - Sender: ${from} → matched to: ${app.email_from}`);
            break;
          }
        }
      }
    }

    if (!applicationId) {
      console.error("Could not find application for this reply after all fallback attempts");
      console.error(`  - From: ${from}`);
      console.error(`  - Subject: ${subject}`);
      console.error(`  - In-Reply-To: ${in_reply_to || 'none'}`);
      return new Response(
        JSON.stringify({ 
          error: "Application not found for this reply",
          details: {
            from,
            subject,
            in_reply_to,
            hint: "Email address may not match any known application"
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Get full application details
    console.log("Fetching application details...");
    const { data: application, error: appDetailsError } = await supabase
      .from("professional_applications")
      .select(`
        *,
        professionals (*)
      `)
      .eq("id", applicationId)
      .single();

    if (appDetailsError || !application) {
      console.error("Error fetching application details:", appDetailsError);
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    console.log("Application found:", application.id);
    console.log("Current completeness:", application.completeness_score);
    console.log("Current missing_info:", application.missing_info);

    // 🏢 Get organization info for dynamic branding
    const orgInfo = getOrganizationById(application.org_id);
    const emailConfig = getEmailConfig(application.org_id);
    console.log(`🏢 Organization branding: ${orgInfo.displayName} (org_id: ${application.org_id})`);
    console.log(`📧 Email config: from=${emailConfig.from}, replyTo=${emailConfig.replyTo}`);

    // Save the applicant's reply to conversations
    // 🔑 FIX: Store the correct emailId (Resend UUID) for API retrieval, not message_id
    console.log("========================================");
    console.log("💾 SAVING USER CONVERSATION:");
    console.log("   application_id:", applicationId);
    console.log("   emailText length:", emailText?.length || 0);
    console.log("   emailId (Resend UUID):", emailId);
    console.log("   message_id (Email header):", message_id);
    console.log("   subject:", subject);
    console.log("========================================");
    
    const { error: replyInsertError } = await supabase
      .from("application_conversations")
      .insert({
        application_id: applicationId,
        role: "user",
        content: emailText || '', // Ensure content is never null
        metadata: {
          email_id: emailId,        // 🔑 CORRECT: Resend UUID for API calls
          message_id: message_id,   // Original email header for audit
          subject: subject,
          fetched_body: emailText?.length > 0, // Track if body was successfully fetched
        },
      });

    if (replyInsertError) {
      console.error("❌ Error saving reply:", replyInsertError);
    } else {
      console.log("✅ User conversation saved successfully");
    }

    // Check if this is a response to interview slot selection
    const offeredSlots = application.extracted_data?.interview_slots_offered as Array<{date: string, time: string}> | undefined;
    const hasOfferedSlots = offeredSlots && offeredSlots.length > 0;
    
    // =====================================================
    // SMART MISSING INFO: Define critical fields for intake
    // =====================================================
    const CRITICAL_INTAKE_FIELDS = ['naam', 'email', 'telefoonnummer', 'functie_niveau', 'werkvorm', 'regio', 'beschikbaarheid'];
    
    // Determine which conditional fields are needed based on current data
    const currentData = application.extracted_data || {};
    const conditionalFields: string[] = [];
    
    // BIG-nummer only needed for HBO-V or VIG
    if (currentData.functie_niveau === 'HBO-V' || currentData.functie_niveau === 'VIG') {
      conditionalFields.push('big_nummer');
    }
    
    // KVK/BTW only needed for ZZP
    if (currentData.werkvorm === 'ZZP') {
      conditionalFields.push('kvk_nummer');
      // BTW is optional for ZZP, don't require it
    }
    
    // VOG is only required AFTER interview is scheduled (not in intake phase)
    const hasInterviewScheduled = currentData.interview_status === 'scheduled' || currentData.interview_confirmed;
    if (hasInterviewScheduled) {
      conditionalFields.push('vog');
    }
    
    // Calculate which critical fields are already filled
    const filledCriticalFields = CRITICAL_INTAKE_FIELDS.filter(field => {
      // Handle naam/full_name as aliases (same field, different names)
      if (field === 'naam') {
        const nameValue = currentData.naam || currentData.full_name;
        return nameValue !== null && nameValue !== undefined && nameValue !== '';
      }
      const value = currentData[field];
      return value !== null && value !== undefined && value !== '';
    });
    
    // Smart missing info for AI prompt (only ask for relevant fields)
    const smartMissingFields = [
      ...CRITICAL_INTAKE_FIELDS.filter(f => !filledCriticalFields.includes(f)),
      ...conditionalFields.filter(f => !currentData[f])
    ];
    
    console.log("🧠 Smart Missing Info Analysis:");
    console.log("   Critical fields:", CRITICAL_INTAKE_FIELDS);
    console.log("   Filled critical:", filledCriticalFields);
    console.log("   Conditional fields:", conditionalFields);
    console.log("   Smart missing:", smartMissingFields);

    // Use AI to analyze the reply and extract new information
    console.log("Analyzing reply with AI...");
    const analysisPrompt = `
Je bent een recruitment assistant voor een thuiszorg organisatie. Analyseer deze email van een sollicitant en extract de volgende informatie:

**KRITIEKE VELDEN DIE NOG NODIG ZIJN:** ${JSON.stringify(smartMissingFields)}
**Huidige extracted_data:** ${JSON.stringify(currentData)}
${hasOfferedSlots ? `\n**BELANGRIJK - Aangeboden interview tijdsloten:**\n${offeredSlots.map((slot: {date: string, time: string}, i: number) => `${i + 1}. ${slot.date} om ${slot.time}`).join('\n')}\n` : ''}

**Email van sollicitant:**
${emailText}

**Instructies:**
1. Extract ALLEEN informatie die in de email staat - verzin niets
2. Focus op de KRITIEKE VELDEN die nog nodig zijn
3. Detecteer of de sollicitant vraagt om een gesprek/interview
${hasOfferedSlots ? `4. **KRITIEK**: Check of de kandidaat een tijdslot kiest! Kijk naar nummers, dagen, tijden` : ''}

**KRITIEK - functie_niveau moet EXACT een van deze waarden zijn:**
- "VIG" (Verzorgende IG)
- "VP3" (Verzorgende Niveau 3)  
- "VP4" (Verzorgende Niveau 4)
- "HBO-V" (HBO Verpleegkundige)
- "Helpende 2"
- "Begeleider"
- "Persoonlijk begeleider"
- "GGZ-agoog"
- "Verpleegkundige MBO"

**KRITIEK - werkvorm moet EXACT een van deze waarden zijn:**
- "ZZP"
- "Uitzendkracht"
- "ABCito constructie"

**NIEUW - Extract ook VOG en BIG informatie als aanwezig:**
- vog_datum: Datum van VOG afgifte (formaat: YYYY-MM-DD of DD-MM-YYYY)
- vog_bevestigd: true als sollicitant zegt dat ze een geldige VOG hebben
- big_nummer: 11-cijferig BIG-registratienummer (voor verpleegkundigen/verzorgenden)

Patronen om te herkennen:
- "VOG afgiftedatum 15 januari 2025" → vog_datum: "2025-01-15"
- "Ik heb een geldige VOG" → vog_bevestigd: true
- "BIG-nummer: 12345678901" → big_nummer: "12345678901"

**KRITIEK - remaining_missing_info:**
Return ALLEEN velden uit deze lijst die NIET in new_data zitten EN nog steeds nodig zijn:
${JSON.stringify(smartMissingFields)}

NIET opnemen (irrelevant voor intake): VOG, diploma, certificaten, ID-bewijs (pas na interview)

Return JSON in dit formaat:
\`\`\`json
{
  "filled_info": ["telefoonnummer"],
  "new_data": {
    "telefoonnummer": "06-12345678",
    "functie_niveau": "VIG",
    "werkvorm": "Uitzendkracht",
    "regio": "Eindhoven",
    "beschikbaarheid": "32-40 uur",
    "vog_datum": "2025-01-15",
    "vog_bevestigd": true,
    "big_nummer": "12345678901"
  },
  "requests_interview": false,
  "remaining_missing_info": ["naam", "email"],
  "selected_slot_index": null,
  "confidence": 0.95
}
\`\`\`
`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Je bent een recruitment assistant. Return alleen valid JSON zonder extra tekst.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    console.log("AI analysis:", aiContent);

    // Parse AI response
    let analysis;
    try {
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiContent;
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      analysis = {
        filled_info: [],
        new_data: {},
        requests_interview: emailText.toLowerCase().includes("gesprek") || 
                           emailText.toLowerCase().includes("interview") ||
                           emailText.toLowerCase().includes("afspraak"),
        has_questions: false,
        remaining_missing_info: application.missing_info || [],
        confidence: 0.5,
      };
    }

    // 🔧 POST-PROCESSING: Use shared healthcare-mappings for normalization
    if (analysis.new_data?.functie_niveau) {
      const normalized = normalizeFunctieNiveau(analysis.new_data.functie_niveau);
      if (normalized !== analysis.new_data.functie_niveau) {
        console.log(`Mapped functie_niveau: "${analysis.new_data.functie_niveau}" → "${normalized}"`);
        analysis.new_data.functie_niveau = normalized;
      }
    }
    
    if (analysis.new_data?.werkvorm) {
      const normalized = normalizeWerkvorm(analysis.new_data.werkvorm);
      if (normalized !== analysis.new_data.werkvorm) {
        console.log(`Mapped werkvorm: "${analysis.new_data.werkvorm}" → "${normalized}"`);
        analysis.new_data.werkvorm = normalized;
      }
    }
    
    // 🔧 FASE 2 FIX: Regex fallback voor VOG en BIG extractie
    if (!analysis.new_data?.vog_datum && emailText) {
      // VOG datum regex patterns
      const vogPatterns = [
        /VOG[:\s]*(?:afgiftedatum|datum|van)?[:\s]*(\d{1,2}[-\/\s]?\w+[-\/\s]?\d{4})/i,
        /(?:afgiftedatum|afgifte)[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i,
        /VOG[:\s]*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
      ];
      
      for (const pattern of vogPatterns) {
        const match = emailText.match(pattern);
        if (match) {
          // Try to parse the date
          const dateStr = match[1].trim();
          console.log(`📅 VOG datum regex match: "${dateStr}"`);
          
          // Convert to ISO format
          let isoDate = null;
          // Try ISO format (2025-01-15)
          if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(dateStr)) {
            isoDate = dateStr.replace(/\//g, '-');
          }
          // Try EU format (15-01-2025)
          else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(dateStr)) {
            const parts = dateStr.split(/[-\/]/);
            isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          
          if (isoDate) {
            analysis.new_data = analysis.new_data || {};
            analysis.new_data.vog_datum = isoDate;
            analysis.new_data.vog_bevestigd = true;
            console.log(`✅ VOG datum extracted via regex: ${isoDate}`);
            break;
          }
        }
      }
    }
    
    // Check for "ik heb een geldige VOG" type statements
    if (!analysis.new_data?.vog_bevestigd && emailText) {
      if (/(?:heb|bezit|beschik)[^.]*(?:geldige?|actuele?)[^.]*VOG/i.test(emailText) ||
          /VOG[^.]*(?:geldig|actueel|recent)/i.test(emailText)) {
        analysis.new_data = analysis.new_data || {};
        analysis.new_data.vog_bevestigd = true;
        console.log(`✅ VOG bevestigd via tekst patroon`);
      }
    }
    
    // BIG nummer regex
    if (!analysis.new_data?.big_nummer && emailText) {
      const bigMatch = emailText.match(/BIG[-\s]?(?:nummer|nr|registratie)?[:\s]*(\d{11})/i);
      if (bigMatch) {
        analysis.new_data = analysis.new_data || {};
        analysis.new_data.big_nummer = bigMatch[1];
        console.log(`✅ BIG nummer extracted via regex: ${bigMatch[1]}`);
      }
    }
    
    // 🔧 FASE 3 FIX: Detecteer placeholder telefoonnummers
    if (analysis.new_data?.telefoonnummer) {
      const phone = analysis.new_data.telefoonnummer;
      const placeholderPatterns = [
        /^06[-\s]?0{6,}$/,              // 06-00000000
        /^06[-\s]?1234567[89]?$/,       // 06-12345678
        /^000/,                          // starts with 000
        /^06[-\s]?9{6,}$/,              // 06-99999999
        /^(\d)\1{7,}$/,                  // all same digit
      ];
      
      const isPlaceholder = placeholderPatterns.some(p => p.test(phone.replace(/[\s-]/g, '')));
      if (isPlaceholder) {
        console.log(`⚠️ Placeholder telefoonnummer gedetecteerd: ${phone}`);
        // Remove placeholder and add to missing info
        delete analysis.new_data.telefoonnummer;
        if (!analysis.remaining_missing_info?.includes('telefoonnummer')) {
          analysis.remaining_missing_info = analysis.remaining_missing_info || [];
          analysis.remaining_missing_info.push('telefoonnummer (echt nummer, geen placeholder)');
        }
      }
    }

    // =====================================================
    // DOCUMENT ATTACHMENT PROCESSING
    // =====================================================
    const processedDocuments: Array<{
      filename: string;
      file_path: string;
      document_type: string;
      vog_expiry_status?: string;
    }> = [];

    if (realAttachments.length > 0) {
      console.log(`📎 Processing ${realAttachments.length} real attachments (excluding inline images)...`);
      
      for (const attachment of realAttachments) {
        try {
          console.log(`📄 Attachment: ${attachment.filename} (${attachment.content_type})`);
          
          // Skip if no content
          if (!attachment.content) {
            console.log(`⚠️ Skipping attachment without content: ${attachment.filename}`);
            continue;
          }
          
          // Detect document type from filename
          const detectDocType = (filename: string): 'vog' | 'diploma' | 'certificate' | 'cv' | 'id' | 'other' => {
            const lower = filename.toLowerCase();
            if (lower.includes('vog') || lower.includes('verklaring omtrent') || lower.includes('verklaring_omtrent')) return 'vog';
            if (lower.includes('diploma') || lower.includes('getuigschrift')) return 'diploma';
            if (lower.includes('certificaat') || lower.includes('certificate') || lower.includes('bhv') || lower.includes('ehbo')) return 'certificate';
            if (lower.includes('cv') || lower.includes('curriculum') || lower.includes('resume')) return 'cv';
            if (lower.includes('id') || lower.includes('paspoort') || lower.includes('rijbewijs') || lower.includes('identiteit')) return 'id';
            return 'other';
          };

          const documentType = detectDocType(attachment.filename);
          
          // Decode base64 content
          const fileBuffer = Uint8Array.from(atob(attachment.content), c => c.charCodeAt(0));
          const filePath = `${applicationId}/${Date.now()}_${attachment.filename}`;
          
          // Upload to Storage
          const { error: uploadError } = await supabase.storage
            .from('application-documents')
            .upload(filePath, fileBuffer, { 
              contentType: attachment.content_type,
              upsert: false 
            });
          
          if (uploadError) {
            console.error(`❌ Failed to upload ${attachment.filename}:`, uploadError);
            continue;
          }
          
          console.log(`✅ Uploaded: ${filePath}`);
          
          // Determine VOG expiry status if it's a VOG document
          let vogExpiryStatus: string | null = null;
          let vogIssueDate: string | null = null;
          
          if (documentType === 'vog') {
            // Try to extract date from filename
            const extractDateFromFilename = (filename: string): Date | null => {
              const isoMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
              if (isoMatch) {
                const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
                if (!isNaN(date.getTime())) return date;
              }
              const euMatch = filename.match(/(\d{2})[-.]?(\d{2})[-.]?(\d{4})/);
              if (euMatch) {
                const date = new Date(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`);
                if (!isNaN(date.getTime())) return date;
              }
              return null;
            };

            const parsedDate = extractDateFromFilename(attachment.filename);
            
            if (parsedDate) {
              vogIssueDate = parsedDate.toISOString().split('T')[0];
              
              // Check if VOG is expired (older than 3 months)
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              
              if (parsedDate < threeMonthsAgo) {
                vogExpiryStatus = 'expired';
                console.log(`⚠️ VOG is EXPIRED (issued ${vogIssueDate})`);
              } else {
                // Check if expiring soon (within 2 weeks)
                const expiryDate = new Date(parsedDate);
                expiryDate.setMonth(expiryDate.getMonth() + 3);
                const twoWeeksFromNow = new Date();
                twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
                
                if (expiryDate <= twoWeeksFromNow) {
                  vogExpiryStatus = 'expiring_soon';
                  console.log(`⚠️ VOG expiring soon (issued ${vogIssueDate})`);
                } else {
                  vogExpiryStatus = 'valid';
                  console.log(`✅ VOG is valid (issued ${vogIssueDate})`);
                }
              }
            } else {
              // Date not found in filename - assume valid for now, but flag for manual review
              vogExpiryStatus = 'valid';
              console.log(`ℹ️ VOG uploaded, date not detected in filename - assuming valid`);
            }
          }
          
          // Insert document record into database
          const { error: docInsertError } = await supabase
            .from('application_documents')
            .insert({
              application_id: applicationId,
              filename: attachment.filename,
              file_path: filePath,
              content_type: attachment.content_type,
              document_type: documentType,
              vog_issue_date: vogIssueDate,
              vog_expiry_status: vogExpiryStatus,
              metadata: {
                uploaded_via: 'email_reply',
                original_email_id: message_id,
              }
            });
          
          if (docInsertError) {
            console.error(`❌ Failed to log document:`, docInsertError);
          } else {
            processedDocuments.push({
              filename: attachment.filename,
              file_path: filePath,
              document_type: documentType,
              vog_expiry_status: vogExpiryStatus || undefined,
            });
            
            // Update extracted_data based on document type
            if (documentType === 'vog' && vogExpiryStatus === 'valid') {
              analysis.new_data.vog_file_path = filePath;
              analysis.new_data.vog_uploaded = true;
              if (vogIssueDate) {
                analysis.new_data.vog_date = vogIssueDate;
              }
              // Remove 'vog' from remaining_missing_info
              if (analysis.remaining_missing_info) {
                analysis.remaining_missing_info = analysis.remaining_missing_info
                  .filter((item: string) => !item.toLowerCase().includes('vog'));
              }
              console.log(`✅ VOG validated and linked to application`);
            } else if (documentType === 'vog' && vogExpiryStatus === 'expired') {
              // VOG is expired - don't remove from missing_info
              analysis.new_data.vog_file_path = filePath;
              analysis.new_data.vog_expired = true;
              console.log(`⚠️ VOG expired - still in missing_info`);
            }
          }
        } catch (attachmentError) {
          console.error(`❌ Error processing attachment ${attachment.filename}:`, attachmentError);
        }
      }
      
      console.log(`📎 Processed ${processedDocuments.length} documents`);
      
      // =====================================================
      // PHASE 3: Update Professional with Documents (if exists)
      // =====================================================
      if (application.professional_id && processedDocuments.length > 0) {
        console.log(`📄 [Phase 3] Updating professional ${application.professional_id} with documents...`);
        
        const updateData: Record<string, any> = {};
        let hasVog = false;
        let hasDiploma = false;
        
        for (const doc of processedDocuments) {
          if (doc.document_type === 'vog' && doc.vog_expiry_status === 'valid') {
            updateData.vog_file_path = doc.file_path;
            hasVog = true;
          }
          if (doc.document_type === 'diploma' || doc.document_type === 'certificate') {
            hasDiploma = true;
          }
        }
        
        // Get current professional to check existing documents
        const { data: currentProfessional } = await supabase
          .from('professionals')
          .select('status, vog_file_path')
          .eq('id', application.professional_id)
          .single();
        
        const existingVog = !!currentProfessional?.vog_file_path || hasVog;
        
        // If professional has pending_documents status, check if they're now complete
        if (currentProfessional?.status === 'beschikbaar_pending_documents') {
          // For now, just VOG is required - diplomas are nice-to-have
          if (existingVog) {
            updateData.status = 'beschikbaar';
            console.log(`✅ [Phase 3] Professional documents complete! Status → beschikbaar`);
          }
        }
        
        if (Object.keys(updateData).length > 0) {
          const { error: profUpdateError } = await supabase
            .from('professionals')
            .update({
              ...updateData,
              updated_at: new Date().toISOString()
            })
            .eq('id', application.professional_id);
          
          if (profUpdateError) {
            console.error('❌ [Phase 3] Failed to update professional:', profUpdateError);
          } else {
            console.log(`✅ [Phase 3] Professional updated successfully`);
            
            // Log system event for AI learning
            await supabase.from('system_events').insert({
              event_type: 'professional_documents_received',
              entity_type: 'professional',
              entity_id: application.professional_id,
              org_id: application.org_id,
              event_data: {
                documents_received: processedDocuments.map(d => d.document_type),
                has_vog: existingVog,
                has_diploma: hasDiploma,
                new_status: updateData.status || currentProfessional?.status,
                source: 'email_reply'
              },
              metadata: {}
            });
          }
        }
      }
    }

    // =====================================================
    // SMART COMPLETENESS CALCULATION
    // Based on CRITICAL fields filled, not arbitrary totalFields count
    // =====================================================
    
    // Merge new data with existing extracted_data FIRST
    const mergedData = {
      ...(application.extracted_data || {}),
      ...(analysis.new_data || {}),
    };
    
    // Normalize naam/full_name: ensure naam is set if full_name exists
    if (!mergedData.naam && mergedData.full_name) {
      mergedData.naam = mergedData.full_name;
      console.log("📝 Normalized naam from full_name:", mergedData.naam);
    }
    
    // Calculate completeness based on CRITICAL intake fields
    const criticalFieldsFilled = CRITICAL_INTAKE_FIELDS.filter(field => {
      // Handle naam/full_name as aliases (same field, different names)
      if (field === 'naam') {
        const nameValue = mergedData.naam || mergedData.full_name;
        return nameValue !== null && nameValue !== undefined && nameValue !== '';
      }
      const value = mergedData[field];
      return value !== null && value !== undefined && value !== '';
    });
    
    // Base score from critical fields (0-100)
    const baseScore = Math.round((criticalFieldsFilled.length / CRITICAL_INTAKE_FIELDS.length) * 100);
    
    // Smart remaining_missing_info: filter out filled fields and irrelevant fields
    const smartRemainingMissing = smartMissingFields.filter(field => {
      // Handle naam/full_name as aliases
      if (field === 'naam') {
        const nameValue = mergedData.naam || mergedData.full_name;
        return nameValue === null || nameValue === undefined || nameValue === '';
      }
      const value = mergedData[field];
      return value === null || value === undefined || value === '';
    });
    
    // Override AI's remaining_missing_info with our smart calculation
    const finalRemainingMissing = smartRemainingMissing;
    
    const newCompletenessScore = Math.max(0, Math.min(100, baseScore));

    console.log("🧮 Smart Completeness Calculation:");
    console.log("   Critical fields:", CRITICAL_INTAKE_FIELDS);
    console.log("   Critical filled:", criticalFieldsFilled);
    console.log("   Base score:", baseScore);
    console.log("   Final remaining missing:", finalRemainingMissing);
    console.log("   New completeness score:", newCompletenessScore);


    // =====================================================
    // EXPERT PANEL FLOW: Interview-first, geen automatische professional creation
    // Flow: NIEUW → INTERVIEW → SCREENING → GOEDGEKEURD → Professional
    // =====================================================
    
    const pipelineStage = application.pipeline_stage || 'nieuw';
    const interviewStatus = mergedData.interview_status;
    
    console.log(`📊 Current pipeline stage: ${pipelineStage}, Interview status: ${interviewStatus}`);
    
    // =====================================================
    // STAP 1: ALTIJD update application record EERST
    // =====================================================
    console.log("Updating application record...");
    const { error: appUpdateError } = await supabase
      .from("professional_applications")
      .update({
        missing_info: finalRemainingMissing,
        completeness_score: newCompletenessScore,
        extracted_data: mergedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      console.error("Error updating application:", appUpdateError);
    }

    // =====================================================
    // STAP 2: SCREENING Stage - Document Validation
    // Als stage = SCREENING, check documenten en transition naar GOEDGEKEURD
    // =====================================================
    if (pipelineStage === 'screening') {
      console.log("📋 SCREENING stage - checking document completeness...");
      
      const missingDocs: string[] = [];
      
      // VOG check met 3-maanden validatie
      if (!mergedData.vog_file_path) {
        missingDocs.push('VOG (Verklaring Omtrent Gedrag) - max 3 maanden oud');
      } else if (mergedData.vog_date) {
        const vogDate = new Date(mergedData.vog_date);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        if (vogDate < threeMonthsAgo) {
          missingDocs.push('VOG (je huidige VOG is helaas ouder dan 3 maanden, kun je een nieuwe aanvragen?)');
        }
      }
      
      // Diploma check
      if (!mergedData.diploma_file_path) {
        missingDocs.push('Diploma of certificaat van je opleiding');
      }
      
      console.log(`📋 Missing documents: ${missingDocs.length > 0 ? missingDocs.join(', ') : 'NONE'}`);
      
      if (missingDocs.length === 0) {
        // ✅ Documenten compleet → stage naar GOEDGEKEURD
        console.log("✅ All documents complete! Transitioning to GOEDGEKEURD...");
        
        await supabase
          .from("professional_applications")
          .update({ 
            pipeline_stage: 'goedgekeurd',
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);
          
        console.log("✅ Stage transitioned to GOEDGEKEURD - Professional creation will be triggered by database");
      } else {
        // 📧 Stuur document request email via goal
        console.log("📧 Creating document request goal...");
        
        const { data: existingDocGoal } = await supabase
          .from("agent_goals")
          .select("id")
          .eq("goal_type", "request_documents")
          .in("status", ["pending", "planning", "executing", "in_progress"])
          .filter("input_data->application_id", "eq", applicationId)
          .maybeSingle();
        
        if (!existingDocGoal) {
          const professionalName = mergedData.naam || mergedData.full_name || from.split("@")[0];
          
          await supabase
            .from("agent_goals")
            .insert({
              org_id: application.org_id,
              goal_type: "request_documents",
              goal_description: `Documenten opvragen voor ${professionalName}`,
              priority: 95,
              input_data: {
                application_id: applicationId,
                candidate_email: from,
                candidate_name: professionalName,
                documents: missingDocs,
              },
              status: "pending"
            });
            
          console.log("✅ Document request goal created");
        }
      }
    }

    // =====================================================
    // STAP 3: Check for Interview Slot Selection (any stage)
    // =====================================================
    if (analysis.selected_slot_index && offeredSlots && offeredSlots.length > 0) {
      const slotIndex = parseInt(analysis.selected_slot_index) - 1;
      if (slotIndex >= 0 && slotIndex < offeredSlots.length) {
        const selectedSlot = offeredSlots[slotIndex];
        console.log(`🎉 Kandidaat koos interview slot: ${selectedSlot.date} om ${selectedSlot.time}`);
        
        // Call schedule-interview to confirm the slot
        try {
          const { data: confirmResult, error: confirmError } = await supabase.functions.invoke('schedule-interview', {
            body: {
              action: 'confirm_slot',
              application_id: applicationId,
              selected_slot: {
                date: selectedSlot.date,
                time: selectedSlot.time
              }
            }
          });
          
          if (confirmError) {
            console.error("Error confirming interview slot:", confirmError);
          } else {
            console.log("✅ Interview slot confirmed:", confirmResult);
            
            // Send confirmation email
            await supabase.functions.invoke('schedule-interview', {
              body: {
                action: 'send_confirmation',
                application_id: applicationId
              }
            });
          }
        } catch (scheduleError) {
          console.error("Error scheduling interview:", scheduleError);
        }
      }
    }

    // =====================================================
    // STAP 4: NIEUW Stage - Auto-transition to INTERVIEW when ready (≥100%)
    // KRITIEK FIX: Bij 100% completeness → stage naar INTERVIEW + direct interview email
    // =====================================================
    if (pipelineStage === 'nieuw' && newCompletenessScore >= 100 && interviewStatus !== 'scheduled' && !analysis.selected_slot_index) {
      console.log("🎉 NIEUW stage + Completeness = 100%, transitioning to INTERVIEW stage...");
      
      const professionalName = mergedData.naam || mergedData.full_name || from.split("@")[0];
      
      // 🔧 FIX: Update pipeline_stage to 'interview' immediately
      const { error: stageUpdateError } = await supabase
        .from("professional_applications")
        .update({
          pipeline_stage: 'interview',
          status: 'in_gesprek',
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
      
      if (stageUpdateError) {
        console.error("Error updating stage to interview:", stageUpdateError);
      } else {
        console.log("✅ Stage updated to INTERVIEW");
        
        // 🔧 FIX: Direct interview email versturen (niet wachten op goal execution)
        try {
          console.log("📧 Sending interview availability request immediately...");
          const { data: scheduleResult, error: scheduleError } = await supabase.functions.invoke('schedule-interview', {
            body: {
              action: 'request_availability',
              application_id: applicationId,
              interview_type: 'video',
            }
          });
          
          if (scheduleError) {
            console.error("Error sending interview request:", scheduleError);
          } else {
            console.log("✅ Interview availability request sent:", scheduleResult);
          }
        } catch (scheduleErr) {
          console.error("Exception sending interview request:", scheduleErr);
        }
        
        // Log stage audit event
        await supabase.from("application_stage_audit").insert({
          application_id: applicationId,
          from_stage: 'nieuw',
          to_stage: 'interview',
          reason: 'Automatische transitie: 100% completeness bereikt',
          performed_by: null, // System action
          metadata: {
            completeness_score: newCompletenessScore,
            trigger: 'handle-application-reply',
          }
        });
      }
    } 
    // 🔧 FIX: Ook interview goal aanmaken bij 80-99% als backup
    else if (pipelineStage === 'nieuw' && newCompletenessScore >= 80 && newCompletenessScore < 100 && interviewStatus !== 'scheduled' && !analysis.selected_slot_index) {
      console.log("🗓️ NIEUW stage + Completeness >= 80%, creating interview goal for manual review...");
      
      const professionalName = mergedData.naam || mergedData.full_name || from.split("@")[0];
      
      // Check for existing active interview goal to prevent duplicates
      const { data: existingInterviewGoal } = await supabase
        .from("agent_goals")
        .select("id, status")
        .eq("goal_type", "schedule_interview")
        .in("status", ["pending", "planning", "executing", "in_progress"])
        .filter("input_data->application_id", "eq", applicationId)
        .maybeSingle();
      
      if (existingInterviewGoal) {
        console.log(`⏭️ Skipping interview goal - existing active goal found: ${existingInterviewGoal.id} (${existingInterviewGoal.status})`);
      } else {
        const { error: interviewGoalError } = await supabase
          .from("agent_goals")
          .insert({
            org_id: application.org_id,
            goal_type: "schedule_interview",
            goal_description: `Plan interview met ${professionalName}`,
            priority: 90,
            input_data: {
              application_id: applicationId,
              candidate_email: from,
              candidate_name: professionalName,
              current_completeness: newCompletenessScore,
            },
            status: "pending"
          });

        if (interviewGoalError) {
          console.error("Error creating interview goal:", interviewGoalError);
        } else {
          console.log(`✅ Created interview scheduling goal for application ${applicationId}`);
        }
      }
    }
    
    // =====================================================
    // STAP 5: NIEUW Stage - Follow-up if < 80%
    // =====================================================
    if (pipelineStage === 'nieuw' && newCompletenessScore < 80 && finalRemainingMissing.length > 0) {
      console.log("Completeness still < 80%, checking for existing follow-up goal...");
      
      // Check for existing ACTIVE follow-up goals
      const { data: existingActiveFollowup } = await supabase
        .from("agent_goals")
        .select("id, status")
        .eq("goal_type", "application_intake_completion")
        .in("status", ["pending", "planning", "executing", "in_progress"])
        .filter("input_data->application_id", "eq", applicationId)
        .maybeSingle();
      
      if (existingActiveFollowup) {
        console.log(`⏭️ Skipping follow-up goal - existing active goal found: ${existingActiveFollowup.id} (${existingActiveFollowup.status})`);
      } else {
        // Count total follow-ups for rate limiting
        const { count: totalFollowups } = await supabase
          .from("agent_goals")
          .select("*", { count: "exact", head: true })
          .eq("goal_type", "application_intake_completion")
          .filter("input_data->application_id", "eq", applicationId);

        const followUpCount = totalFollowups || 0;

        // Max 3 follow-ups per applicatie
        if (followUpCount < 3) {
          const professionalName = mergedData.naam || mergedData.full_name || from.split("@")[0];
          
          const { error: goalError } = await supabase
            .from("agent_goals")
            .insert({
              org_id: application.org_id,
              goal_type: "application_intake_completion",
              goal_description: `Vervolg follow-up voor ${professionalName} (${followUpCount + 1}/3)`,
              priority: 100 - newCompletenessScore,
              input_data: {
                application_id: applicationId,
                candidate_email: from,
                candidate_name: professionalName,
                missing_info: finalRemainingMissing,
                current_completeness: newCompletenessScore,
                follow_up_count: followUpCount,
              },
              status: "pending"
            });

          if (goalError) {
            console.error("Error creating follow-up goal:", goalError);
          } else {
            console.log(`✅ Created follow-up goal #${followUpCount + 1} for application ${applicationId}`);
          }
        } else {
          console.log(`⚠️ Max follow-ups (3) reached for application ${applicationId}`);
        }
      }
    }

    // =====================================================
    // STAP 6: Generate intelligent response based on stage
    // =====================================================
    console.log("Generating response email...");
    let responseSubject = `Re: ${subject}`;
    let responseBody = "";

    const professionalName = mergedData.naam || mergedData.full_name || application.email_from.split("@")[0];

    // Response templates based on STAGE (not completeness)
    if (pipelineStage === 'screening') {
      // SCREENING: bedanken voor interview, documenten gevraagd
      responseSubject = `Re: ${subject} - Documenten nodig`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Bedankt voor je reactie!</p>
        
        <p>Om je profiel compleet te maken hebben we nog enkele documenten nodig:</p>
        <ul>
          <li>VOG (Verklaring Omtrent Gedrag) - mag maximaal 3 maanden oud zijn</li>
          <li>Diploma of certificaat van je opleiding</li>
        </ul>
        
        <p>Je kunt deze documenten als bijlage naar deze email sturen.</p>
        
        <p>Met vriendelijke groet,<br>
        Het ${orgInfo.displayName} Recruitment Team<br>
        <a href="mailto:${emailConfig.from}">${emailConfig.from}</a></p>
      `;
    } else if (pipelineStage === 'interview' || interviewStatus === 'scheduled') {
      // INTERVIEW: interview staat gepland
      responseSubject = `Re: ${subject}`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Bedankt voor je bericht!</p>
        
        <p>Je interview staat gepland. We kijken ernaar uit om je te ontmoeten!</p>
        
        <p>Heb je nog vragen? Laat het gerust weten.</p>
        
        <p>Met vriendelijke groet,<br>
        Het ${orgInfo.displayName} Recruitment Team<br>
        <a href="mailto:${emailConfig.from}">${emailConfig.from}</a></p>
      `;
    } else if (newCompletenessScore >= 80) {
      // NIEUW + ≥80%: interview gaat gepland worden
      responseSubject = `Re: ${subject} - Tijd voor een gesprek!`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Super, we hebben genoeg informatie om verder te gaan! 🎉</p>
        
        <p>We sturen je binnenkort een uitnodiging voor een (video)gesprek zodat we elkaar kunnen leren kennen.</p>
        
        <p>We kijken ernaar uit!</p>
        
        <p>Met vriendelijke groet,<br>
        Het ${orgInfo.displayName} Recruitment Team<br>
        <a href="mailto:${emailConfig.from}">${emailConfig.from}</a></p>
      `;
    } else if (finalRemainingMissing.length > 0) {
      // NIEUW + <80%: meer info nodig
      responseSubject = `Re: ${subject} - Aanvullende informatie nodig`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Bedankt voor je snelle reactie!</p>
        
        <p>We hebben nog de volgende informatie nodig om je sollicitatie compleet te maken:</p>
        <ul>
          ${finalRemainingMissing.map((item: string) => `<li>${item}</li>`).join("")}
        </ul>
        
        <p>Zou je deze informatie kunnen aanvullen? Dan kunnen we snel verder met je sollicitatie.</p>
        
        <p>Met vriendelijke groet,<br>
        Het ${orgInfo.displayName} Recruitment Team<br>
        <a href="mailto:${emailConfig.from}">${emailConfig.from}</a></p>
      `;
    } else {
      // Standard acknowledgment
      responseSubject = `Re: ${subject}`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Bedankt voor je bericht! We hebben je reactie ontvangen.</p>
        
        <p>Heb je nog vragen? Laat het gerust weten!</p>
        
        <p>Met vriendelijke groet,<br>
        Het ${orgInfo.displayName} Recruitment Team<br>
        <a href="mailto:${emailConfig.from}">${emailConfig.from}</a></p>
      `;
    }

    // Send response email via Resend API
    console.log(`Sending response email from ${orgInfo.displayName}...`);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${orgInfo.displayName} Recruitment <${emailConfig.from}>`,
        to: from,
        subject: responseSubject,
        html: responseBody,
        reply_to: emailConfig.replyTo,
      }),
    });

    let emailData: any = null;
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Error sending email:", emailResponse.status, errorText);
    } else {
      emailData = await emailResponse.json();
      console.log("Email sent:", emailData);
    }

    // Save assistant response to conversations
    console.log("Saving assistant response...");
    const { error: responseInsertError } = await supabase
      .from("application_conversations")
      .insert({
        application_id: applicationId,
        role: "assistant",
        content: responseBody.replace(/<[^>]*>/g, ""), // Strip HTML for text version
        metadata: {
          email_id: emailData?.id,
          subject: responseSubject,
          completeness_score: newCompletenessScore,
          requests_interview: analysis.requests_interview,
        },
      });

    if (responseInsertError) {
      console.error("Error saving response:", responseInsertError);
    }

    console.log("=== Reply Processing Complete ===");

    return new Response(
      JSON.stringify({
        success: true,
        application_id: applicationId,
        completeness_score: newCompletenessScore,
        remaining_missing_info: finalRemainingMissing,
        email_sent: !!emailData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing reply:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
