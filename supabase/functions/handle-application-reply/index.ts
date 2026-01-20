import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { 
  normalizeFunctieNiveau, 
  normalizeWerkvorm, 
  getOrganizationById, 
  getEmailConfig,
  isPlaceholderPhone,
  MAX_FOLLOWUP_EMAILS,
  APPLICATION_GOAL_TYPES,
  ACTIVE_GOAL_STATUSES,
  recalculateMissingInfo,
  // Document validation helpers (Phase 1)
  isValidPdf,
  validateVogContent,
  validateDiplomaContent,
  calculateContentHash,
  extractBasicTextFromPdf,
  type DocumentValidationResult,
  // Phase 2a: Name cross-validation
  fuzzyNameMatch,
  type NameMatchResult,
  type IdentityValidationResult,
  // Phase 6: Compliance gates and document awareness
  validateStageTransition,
  STAGE_COMPLIANCE_GATES,
  getPresentDocuments,
  hasField,
  calculateDocumentAwareCompleteness,
  // v1.4.0: Fase 1 completeness check for nieuw → intake_verstuurd
  checkFase1Completeness,
  tryAdvanceFase1,
} from '../_shared/healthcare-mappings.ts';
// Fase 1: Quick Wins - Modulaire detection & audit
import { stripQuotedContent, detectSlotWithRegex, detectInterviewSlot, type SlotDetectionInput } from '../_shared/slot-detection.ts';
import { classifyEmailIntent, shouldBypassCooldown } from '../_shared/intent-classifier.ts';
import { checkIdempotency, markProcessingComplete, releaseLock, type ProcessingResult } from '../_shared/idempotency-guard.ts';

// =====================================================
// PHASE 2A: AI VISION NAME EXTRACTION FROM DOCUMENTS
// =====================================================

/**
 * Extracts the name from a document using AI Vision (Gemini 2.5 Flash)
 * Works with VOG, Diploma, and Certificate documents
 */
async function extractNameFromDocumentVision(
  pdfBase64: string,
  documentType: 'vog' | 'diploma' | 'certificate' | 'cv' | 'id' | 'other',
  lovableApiKey: string
): Promise<{ name: string | null; confidence: number; error?: string; method: 'ai_vision' | 'text_extraction' }> {
  // Build specific prompt based on document type
  let extractionPrompt: string;
  
  switch (documentType) {
    case 'vog':
      extractionPrompt = `This is a Dutch "Verklaring Omtrent het Gedrag" (VOG) - Certificate of Good Conduct.
Extract the FULL NAME of the person for whom this VOG was issued.

Look for:
- "Betrokkene" or "Subject" section
- Name fields like "Naam:", "Geslachtsnaam:", "Voornamen:"
- The name is typically a Dutch name with possible particles like "van", "de", "van der"

Return ONLY the full name, nothing else. If you cannot extract the name with confidence, return "NOT_FOUND".`;
      break;
      
    case 'diploma':
    case 'certificate':
      extractionPrompt = `This is a Dutch diploma or educational certificate.
Extract the FULL NAME of the person to whom this diploma/certificate was issued.

Look for:
- Graduation name or "uitgereikt aan" (issued to)
- Student name fields
- Name at the top or in the main body

Return ONLY the full name, nothing else. If you cannot extract the name with confidence, return "NOT_FOUND".`;
      break;
      
    case 'id':
      extractionPrompt = `This is an identity document.
Extract the FULL NAME of the person shown on this document.

Look for surname and given names fields.

Return ONLY the full name (given names + surname), nothing else. If you cannot extract the name with confidence, return "NOT_FOUND".`;
      break;
      
    default:
      extractionPrompt = `Extract the FULL NAME of the primary person mentioned in this document.
Return ONLY the full name, nothing else. If you cannot extract a clear name, return "NOT_FOUND".`;
  }

  // =====================================================
  // PHASE 2A FIX: Try AI Vision first, fallback to text extraction
  // =====================================================
  
  // ATTEMPT 1: Try AI Vision API (works for images and some PDFs)
  try {
    console.log(`🔍 Attempting AI Vision extraction for ${documentType} document...`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: extractionPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  // Try as PDF first - Gemini 2.5 Flash should support PDFs
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const extractedText = data.choices?.[0]?.message?.content?.trim() || '';
      
      console.log(`🔍 AI Vision extracted text: "${extractedText}"`);
      
      // Check if extraction succeeded
      if (extractedText && extractedText !== 'NOT_FOUND' && extractedText.length >= 2) {
        // Clean up the extracted name
        const cleanedName = extractedText
          .replace(/^(naam:|name:|betrokkene:|uitgereikt aan:)/i, '')
          .replace(/\n/g, ' ')
          .trim();
        
        // Basic validation: should look like a name (2-100 chars, contains letters)
        if (cleanedName.length >= 2 && cleanedName.length <= 100 && /[a-zA-Z]/.test(cleanedName)) {
          // Estimate confidence based on document type and extraction quality
          let confidence = 0.85; // Base confidence for successful extraction
          
          // Lower confidence if name seems unusual
          if (cleanedName.split(' ').length === 1) confidence -= 0.15;
          if (cleanedName.length < 5) confidence -= 0.10;
          if (/\d/.test(cleanedName)) confidence -= 0.20;
          
          console.log(`✅ AI Vision extraction succeeded: "${cleanedName}" (confidence: ${confidence})`);
          return { name: cleanedName, confidence: Math.max(0.3, confidence), method: 'ai_vision' };
        }
      }
      
      console.log(`⚠️ AI Vision returned but name not found or invalid`);
    } else {
      const errorText = await response.text();
      console.log(`⚠️ AI Vision API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }
  } catch (visionError) {
    console.log(`⚠️ AI Vision extraction failed:`, visionError instanceof Error ? visionError.message : 'Unknown');
  }

  // ATTEMPT 2: Fallback to text-based extraction from PDF
  console.log(`📝 Falling back to text-based extraction for ${documentType} document...`);
  
  try {
    // Decode the PDF and extract text
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    const extractedText = extractBasicTextFromPdf(pdfBytes);
    
    if (extractedText && extractedText.length > 10) {
      console.log(`📝 Extracted ${extractedText.length} chars from PDF, searching for name...`);
      
      // Try to find name patterns in extracted text
      let foundName: string | null = null;
      let confidence = 0.6; // Lower confidence for text extraction
      
      // Pattern matching based on document type
      if (documentType === 'vog') {
        // Look for "Betrokkene:", "Naam:", etc.
        const vogPatterns = [
          /(?:betrokkene|subject|naam|name|geslachtsnaam)[:\s]+([A-Za-zÀ-ÿ\s\-'.]+)/i,
          /(?:voornamen?)[:\s]+([A-Za-zÀ-ÿ\s\-'.]+)/i,
        ];
        
        for (const pattern of vogPatterns) {
          const match = extractedText.match(pattern);
          if (match && match[1]) {
            foundName = match[1].trim();
            if (foundName.length >= 3 && foundName.length <= 80) break;
          }
        }
      } else if (documentType === 'diploma' || documentType === 'certificate') {
        // Look for "uitgereikt aan", "naam:", etc.
        const diplomaPatterns = [
          /(?:uitgereikt aan|verleend aan|toegekend aan|naam)[:\s]+([A-Za-zÀ-ÿ\s\-'.]+)/i,
          /(?:de heer|mevrouw|mr\.|ms\.)[:\s]+([A-Za-zÀ-ÿ\s\-'.]+)/i,
        ];
        
        for (const pattern of diplomaPatterns) {
          const match = extractedText.match(pattern);
          if (match && match[1]) {
            foundName = match[1].trim();
            if (foundName.length >= 3 && foundName.length <= 80) break;
          }
        }
      }
      
      if (foundName && foundName.length >= 3 && /[a-zA-Z]/.test(foundName)) {
        // Clean up
        foundName = foundName
          .replace(/[^A-Za-zÀ-ÿ\s\-'.]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 80);
        
        if (foundName.length >= 3) {
          console.log(`✅ Text extraction found name: "${foundName}" (confidence: ${confidence})`);
          return { name: foundName, confidence, method: 'text_extraction' };
        }
      }
    }
  } catch (textError) {
    console.log(`⚠️ Text extraction failed:`, textError instanceof Error ? textError.message : 'Unknown');
  }

  console.log(`❌ All name extraction methods failed for ${documentType} document`);
  return { name: null, confidence: 0, error: 'Name extraction failed (AI Vision and text extraction)', method: 'text_extraction' };
}

interface AttachmentData {
  id?: string; // Resend attachment ID for fetching via API
  filename: string;
  content?: string; // Base64 encoded content (may be empty in webhook, fetched later)
  content_type: string;
  content_disposition?: string;
  content_id?: string;
  size?: number;
}

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
    attachments?: AttachmentData[];
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
    const isInternalTest = req.headers.get('x-internal-test') === 'true';
    const forwardSecret = req.headers.get('x-forward-secret');
    const expectedSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.substring(0, 32);
    
    if (isInternalForward && forwardSecret === expectedSecret) {
      // ✅ Internal forward from process-application-email - already verified
      console.log("✅ Internal forward detected - skipping signature verification");
      payload = await req.json();
    } else if (isInternalTest) {
      // ✅ Internal test from EmailReplyTestPanel - skip signature for testing
      console.log("🧪 Internal test mode detected - skipping signature verification");
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
          id: z.string().optional(), // Resend attachment ID for fetching via API
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
    
    // =====================================================
    // 🔧 FIX: FETCH ATTACHMENT CONTENT VIA RESEND API
    // Resend webhook payload bevat GEEN attachment content!
    // We moeten de content ophalen via de Receiving API
    // =====================================================
    let realAttachments: AttachmentData[] = [];
    const webhookAttachments = payload.data.attachments || [];
    
    console.log("========================================");
    console.log(`📎 ATTACHMENT CONTENT FETCH: ${webhookAttachments.length} attachments in webhook`);
    console.log("========================================");
    
    if (webhookAttachments.length > 0 && emailId) {
      console.log(`📎 Fetching attachment content via Resend Receiving API for email: ${emailId}`);
      
      try {
        // Step 1: Get list of attachments with download URLs
        const attachmentsListUrl = `https://api.resend.com/emails/receiving/${emailId}/attachments`;
        console.log(`📎 Fetching attachment list from: ${attachmentsListUrl}`);
        
        const attachmentsListResponse = await fetch(attachmentsListUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (attachmentsListResponse.ok) {
          const attachmentsList = await attachmentsListResponse.json();
          console.log(`📎 Attachment list response:`, JSON.stringify(attachmentsList).substring(0, 500));
          
          // Resend returns { data: [{ id, filename, content_type, download_url }] }
          const attachmentsData = attachmentsList.data || attachmentsList || [];
          
          if (Array.isArray(attachmentsData) && attachmentsData.length > 0) {
            console.log(`📎 Found ${attachmentsData.length} attachments with download URLs`);
            
            for (const attInfo of attachmentsData) {
              // Skip inline attachments early
              if (attInfo.content_disposition === 'inline') {
                console.log(`📎 Skipping inline attachment: ${attInfo.filename}`);
                continue;
              }
              
              console.log(`📎 Processing attachment: ${attInfo.filename} (${attInfo.content_type})`);
              
              // Download the attachment content
              if (attInfo.download_url) {
                try {
                  console.log(`📎 Downloading from: ${attInfo.download_url}`);
                  const contentResponse = await fetch(attInfo.download_url);
                  
                  if (contentResponse.ok) {
                    const arrayBuffer = await contentResponse.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    // Convert to base64
                    let base64Content = '';
                    const chunkSize = 8192;
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                      const chunk = uint8Array.slice(i, i + chunkSize);
                      base64Content += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64Content = btoa(base64Content);
                    
                    console.log(`✅ Downloaded ${attInfo.filename}: ${arrayBuffer.byteLength} bytes → ${base64Content.length} chars base64`);
                    
                    realAttachments.push({
                      id: attInfo.id,
                      filename: attInfo.filename,
                      content: base64Content,
                      content_type: attInfo.content_type,
                      content_disposition: attInfo.content_disposition,
                      size: arrayBuffer.byteLength
                    });
                  } else {
                    console.error(`❌ Failed to download ${attInfo.filename}: ${contentResponse.status}`);
                  }
                } catch (downloadError) {
                  console.error(`❌ Error downloading ${attInfo.filename}:`, downloadError);
                }
              } else {
                console.log(`⚠️ No download_url for ${attInfo.filename}`);
              }
            }
          } else {
            console.log("⚠️ No attachments in API response or unexpected format");
          }
        } else {
          const errorText = await attachmentsListResponse.text();
          console.log(`⚠️ Failed to fetch attachments list: ${attachmentsListResponse.status} - ${errorText}`);
          
          // Fallback: Try to use webhook attachments if they have content
          console.log("📎 Fallback: checking webhook attachments for content...");
          realAttachments = webhookAttachments.filter(att => 
            att.content && att.content_disposition !== 'inline'
          );
          console.log(`📎 Fallback found ${realAttachments.length} attachments with content in webhook`);
        }
      } catch (attachmentFetchError) {
        console.error("❌ Error fetching attachments via API:", attachmentFetchError);
        
        // Fallback: Use webhook attachments if available
        realAttachments = webhookAttachments.filter(att => 
          att.content && att.content_disposition !== 'inline'
        );
        console.log(`📎 Error fallback: ${realAttachments.length} attachments from webhook`);
      }
    } else if (webhookAttachments.length > 0) {
      // No emailId available, try webhook attachments directly
      console.log("📎 No emailId available, using webhook attachments directly");
      realAttachments = webhookAttachments.filter(att => 
        att.content && att.content_disposition !== 'inline'
      );
    }
    
    console.log("========================================");
    console.log(`📎 FINAL: ${realAttachments.length} real attachments ready for processing`);
    for (const att of realAttachments) {
      console.log(`   - ${att.filename} (${att.content_type}): ${att.content?.length || 0} chars content`);
    }
    console.log("========================================");
    
    console.log("From:", from);
    console.log("Subject:", subject);
    console.log("In-Reply-To:", in_reply_to);
    console.log("Email body length:", emailText.length, "chars");
    console.log("Real attachments (fetched via API):", realAttachments.length);

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

    // =====================================================
    // 🔒 FASE 1: IDEMPOTENCY GUARD - Voorkom dubbele verwerking
    // =====================================================
    const idempotencyCheck = await checkIdempotency(supabase, emailId, message_id, applicationId!, application.org_id);
    
    if (idempotencyCheck.alreadyProcessed) {
      console.log("✅ Email already processed, returning cached result");
      return jsonResponse({
        success: true,
        message: "Email already processed",
        cached: true,
        previousResult: idempotencyCheck.previousResult,
      });
    }
    
    if (idempotencyCheck.processingLocked) {
      console.log("🔒 Email currently being processed by another instance");
      return jsonResponse({
        success: true,
        message: "Email processing in progress",
        locked: true,
      });
    }
    
    const lockId = idempotencyCheck.lockId;
    
    // =====================================================
    // 🔒 TRY-FINALLY WRAPPER: Garanteer lock release
    // =====================================================
    try {
    
    // =====================================================
    // 🎯 FASE 1: INTENT CLASSIFICATION + URGENCY DETECTION
    // =====================================================
    const strippedReply = stripQuotedContent(emailText);
    
    const intentResult = await classifyEmailIntent(
      supabase,
      strippedReply,
      applicationId!,
      emailId,
      application.last_ai_response_at ? new Date(application.last_ai_response_at) : null,
      application.ai_response_count || 0,
      application.org_id
    );
    
    console.log("========================================");
    console.log("🎯 INTENT CLASSIFICATION RESULT:");
    console.log("   Primary intent:", intentResult.primaryIntent);
    console.log("   Confidence:", intentResult.primaryConfidence);
    console.log("   Is urgent:", intentResult.isUrgent);
    console.log("   Urgency score:", intentResult.urgencyScore);
    console.log("   Bypass cooldown:", intentResult.bypassCooldown);
    console.log("   Frustration indicators:", intentResult.frustrationIndicators);
    console.log("========================================");

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
          intent_classification: intentResult,
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
    // 🎯 FASE 1: SLOT DETECTION MET AUDIT LOGGING (uses imported modules)
    // =====================================================
    
    // Pre-AI regex detection met confidence scoring
    // 🔧 FASE 1 FIX: Gebruik detectInterviewSlot (met audit logging) ipv detectSlotWithRegex
    let slotDetectionResult: Awaited<ReturnType<typeof detectInterviewSlot>> | null = null;
    let regexDetectedSlot: number | null = null;
    
    if (hasOfferedSlots && strippedReply) {
      console.log("========================================");
      console.log("🎯 SLOT DETECTION (FASE 1 - MET AUDIT):");
      console.log("   Original email length:", emailText.length, "chars");
      console.log("   Stripped reply length:", strippedReply.length, "chars");
      console.log("   Stripped reply content:", strippedReply.substring(0, 200));
      console.log("   Number of offered slots:", offeredSlots.length);
      console.log("========================================");
      
      // Stap 1: Pre-AI regex detection voor snelle detectie
      const regexOnlyResult = detectSlotWithRegex(strippedReply, offeredSlots.length);
      regexDetectedSlot = regexOnlyResult.slot;
      
      if (regexDetectedSlot !== null) {
        console.log(`✅ REGEX SLOT DETECTION: Kandidaat koos slot ${regexDetectedSlot} (confidence: ${regexOnlyResult.confidence})`);
      } else {
        console.log("⏭️ Regex detection found no match, AI analysis will follow");
      }
    }
    
    // =====================================================
    // FASE 1 FIX: SMART MISSING INFO - Extended critical fields
    // Inclusief diploma vereisten en placeholder telefoon detectie
    // =====================================================
    
    // Base critical intake fields - ALLE nodig voor Fase 1 compleet
    const BASE_CRITICAL_FIELDS = ['naam', 'email', 'telefoonnummer', 'functie_niveau', 'werkvorm', 'regio', 'beschikbaarheid'];
    
    // Diploma is nu verplicht voor intake (zorg-gerelateerd diploma vereist)
    const DIPLOMA_FIELDS = ['diploma_type'];
    
    // Build dynamic critical fields list
    const CRITICAL_INTAKE_FIELDS = [...BASE_CRITICAL_FIELDS, ...DIPLOMA_FIELDS];
    
    // Determine which conditional fields are needed based on current data
    const currentData = application.extracted_data || {};
    const conditionalFields: string[] = [];
    
    // BIG-nummer verplicht voor verpleegkundige/verzorgende functies
    const BIG_REQUIRED_FUNCTIES = ['VIG', 'HBO-V', 'Verpleegkundige MBO', 'Verpleegkundige', 'VP3', 'VP4'];
    if (BIG_REQUIRED_FUNCTIES.includes(currentData.functie_niveau as string)) {
      conditionalFields.push('big_nummer');
    }
    
    // KVK verplicht voor ZZP
    if (currentData.werkvorm === 'ZZP') {
      conditionalFields.push('kvk_nummer');
    }
    
    // VOG is alleen verplicht NA interview (screening fase)
    const hasInterviewScheduled = currentData.interview_status === 'scheduled' || currentData.interview_confirmed;
    if (hasInterviewScheduled) {
      conditionalFields.push('vog');
    }
    
    // 🔧 FASE 1 FIX: Placeholder telefoon detectie - using imported isPlaceholderPhone from healthcare-mappings
    
    // Calculate which critical fields are already filled (met placeholder telefoon check)
    const filledCriticalFields = CRITICAL_INTAKE_FIELDS.filter(field => {
      // Handle naam/full_name as aliases
      if (field === 'naam') {
        const nameValue = currentData.naam || currentData.full_name;
        return nameValue !== null && nameValue !== undefined && nameValue !== '';
      }
      // 🔧 FASE 1 FIX: Telefoonnummer alleen geldig als NIET placeholder
      if (field === 'telefoonnummer') {
        const phoneValue = currentData.telefoonnummer || currentData.phone || currentData.telefoon;
        if (!phoneValue) return false;
        if (isPlaceholderPhone(phoneValue as string)) {
          console.log(`⚠️ Placeholder telefoon gedetecteerd in existing data: ${phoneValue}`);
          return false;
        }
        return true;
      }
      // Diploma type check - accepteer verschillende variaties
      if (field === 'diploma_type') {
        const diplomaValue = currentData.diploma_type || currentData.opleiding || currentData.diploma;
        return diplomaValue !== null && diplomaValue !== undefined && diplomaValue !== '';
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
    // 🎯 VERBETERD: Gebruik stripped reply voor AI analyse (minder noise)
    const emailForAI = strippedReply || emailText;
    
    const analysisPrompt = `
Je bent een recruitment assistant voor een thuiszorg organisatie. Analyseer deze email van een sollicitant en extract de volgende informatie:

**KRITIEKE VELDEN DIE NOG NODIG ZIJN:** ${JSON.stringify(smartMissingFields)}
**Huidige extracted_data:** ${JSON.stringify(currentData)}
${hasOfferedSlots ? `\n**BELANGRIJK - Aangeboden interview tijdsloten:**\n${offeredSlots.map((slot: {date: string, time: string}, i: number) => `${i + 1}. ${slot.date} om ${slot.time}`).join('\n')}\n` : ''}

**Email van sollicitant (stripped van quotes):**
${emailForAI}

**Instructies:**
1. Extract ALLEEN informatie die in de email staat - verzin niets
2. Focus op de KRITIEKE VELDEN die nog nodig zijn
3. Detecteer of de sollicitant vraagt om een gesprek/interview
${hasOfferedSlots ? `4. **KRITIEK - SLOT SELECTIE DETECTIE:**
   ⚠️ BELANGRIJK: Zoek EERST naar een simpel getal aan het BEGIN van de email!
   
   Voorbeelden die slot selectie zijn:
   - "3" of "3.0" of "3:" → selected_slot_index: 3
   - "optie 2" of "slot 2" of "nummer 2" → selected_slot_index: 2
   - "de eerste" of "1e optie" → selected_slot_index: 1
   - "de derde" of "derde mogelijkheid" → selected_slot_index: 3
   - "graag optie 1" of "kies 2" → selected_slot_index: 1 of 2
   
   **RETURN selected_slot_index ALS HET NUMMER DAT DE KANDIDAAT NOEMT (1, 2, of 3)**
   
5. **SLOT REJECTION**: Detecteer of de kandidaat GEEN van de aangeboden slots kan!
   - Zoek naar zinnen als: "kan niet", "lukt niet", "geen van deze", "andere dag", "andere tijd", "allemaal bezet", "verhinderd"
   - Als de kandidaat vraagt om andere momenten → slot_rejection = true` : ''}

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

**FASE 1 - DIPLOMA TYPE (zorg-gerelateerd vereist):**
Extract diploma/opleiding informatie. Moet ZORG-GERELATEERD zijn:
- diploma_type: Exacte naam van diploma (bijv. "MBO Verzorgende IG", "HBO Verpleegkunde", "Helpende Zorg en Welzijn")
- diploma_is_zorg: true als diploma zorg-gerelateerd is, false als niet
- diploma_jaar: Jaar van diploma (bijv. "2020")

GELDIGE ZORG DIPLOMA'S (diploma_is_zorg = true):
- MBO Verzorgende IG / VIG
- MBO Verpleegkunde
- HBO Verpleegkunde
- Helpende Zorg en Welzijn
- Persoonlijk Begeleider (niveau 4)
- GGZ-agoog
- SPW / SPH
- Maatschappelijk Werk
- Sociaal Pedagogisch Werk

ONGELDIGE DIPLOMA'S (diploma_is_zorg = false):
- MBO Administratie, Economie, ICT, Techniek, etc.
- Geen zorg-gerelateerde HBO/WO

**VOG en BIG informatie (optioneel in intake):**
- vog_datum: Datum van VOG afgifte (formaat: YYYY-MM-DD)
- vog_bevestigd: true als sollicitant zegt dat ze een geldige VOG hebben
- big_nummer: 11-cijferig BIG-registratienummer

**KRITIEK - remaining_missing_info:**
Return ALLEEN velden uit deze lijst die NIET in new_data zitten EN nog steeds nodig zijn:
${JSON.stringify(smartMissingFields)}

Return JSON in dit formaat:
\`\`\`json
{
  "filled_info": ["telefoonnummer", "diploma_type"],
  "new_data": {
    "telefoonnummer": "06-87654321",
    "functie_niveau": "VIG",
    "werkvorm": "Uitzendkracht",
    "regio": "Eindhoven",
    "beschikbaarheid": "32-40 uur",
    "diploma_type": "MBO Verzorgende IG",
    "diploma_is_zorg": true,
    "diploma_jaar": "2020",
    "vog_datum": "2025-01-15",
    "vog_bevestigd": true,
    "big_nummer": "12345678901"
  },
  "requests_interview": false,
  "remaining_missing_info": ["naam"],
  // KRITIEK: selected_slot_index moet het nummer zijn dat de kandidaat noemt (1, 2, of 3), NIET 0-indexed!
  "selected_slot_index": null,
  "slot_rejection": false,
  "rejection_reason": null,
  "preferred_times": [],
  "confidence": 0.95
}
\`\`\`

**SLOT REJECTION INSTRUCTIES:**
- slot_rejection: true als kandidaat NIET kan op de aangeboden slots en vraagt om alternatieven
- rejection_reason: Reden waarom (bijv. "werkt overdag", "vakantie", "andere afspraken")
- preferred_times: Array van gewenste tijden als de kandidaat die noemt (bijv. ["avond", "na 17:00", "weekend"])
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
    
    // 🔧 FASE 3 FIX: Detecteer placeholder telefoonnummers + CONTEXT TRACKING
    // rejection_context houdt bij WAAROM velden zijn afgewezen voor slimme follow-up emails
    const rejectionContext: Record<string, { provided_value: string; rejected_reason: string; suggestion: string }> = {};
    
    if (analysis.new_data?.telefoonnummer) {
      const phone = analysis.new_data.telefoonnummer;
      const isPlaceholder = isPlaceholderPhone(phone);
      if (isPlaceholder) {
        console.log(`⚠️ Placeholder telefoonnummer gedetecteerd: ${phone}`);
        
        // 🆕 Track rejection context for smart follow-up emails
        rejectionContext.telefoonnummer = {
          provided_value: phone,
          rejected_reason: 'Dit telefoonnummer lijkt een testwaarde te zijn (bevat opeenvolgende of herhalende cijfers)',
          suggestion: 'Graag je echte mobiele nummer waarop we je kunnen bereiken, bijvoorbeeld 06-87654321'
        };
        
        // Remove placeholder and add to missing info
        delete analysis.new_data.telefoonnummer;
        if (!analysis.remaining_missing_info?.includes('telefoonnummer')) {
          analysis.remaining_missing_info = analysis.remaining_missing_info || [];
          analysis.remaining_missing_info.push('telefoonnummer');
        }
      }
    }
    
    // 🆕 Check for other common rejection scenarios
    // Invalid BIG nummer (moet 11 cijfers zijn)
    if (analysis.new_data?.big_nummer) {
      const big = String(analysis.new_data.big_nummer).replace(/\D/g, '');
      if (big.length !== 11) {
        console.log(`⚠️ Ongeldig BIG-nummer gedetecteerd: ${analysis.new_data.big_nummer} (${big.length} cijfers)`);
        rejectionContext.big_nummer = {
          provided_value: analysis.new_data.big_nummer,
          rejected_reason: `Je BIG-nummer heeft ${big.length} cijfers, maar een geldig BIG-nummer bestaat uit precies 11 cijfers`,
          suggestion: 'Je kunt je BIG-nummer opzoeken via https://www.bigregister.nl'
        };
        delete analysis.new_data.big_nummer;
        if (!analysis.remaining_missing_info?.includes('big_nummer')) {
          analysis.remaining_missing_info = analysis.remaining_missing_info || [];
          analysis.remaining_missing_info.push('big_nummer');
        }
      }
    }
    
    // Invalid KVK nummer (moet 8 cijfers zijn)
    if (analysis.new_data?.kvk_nummer) {
      const kvk = String(analysis.new_data.kvk_nummer).replace(/\D/g, '');
      if (kvk.length !== 8) {
        console.log(`⚠️ Ongeldig KVK-nummer gedetecteerd: ${analysis.new_data.kvk_nummer} (${kvk.length} cijfers)`);
        rejectionContext.kvk_nummer = {
          provided_value: analysis.new_data.kvk_nummer,
          rejected_reason: `Je KVK-nummer heeft ${kvk.length} cijfers, maar een geldig KVK-nummer bestaat uit precies 8 cijfers`,
          suggestion: 'Je kunt je KVK-nummer vinden op je inschrijvingsbewijs of via kvk.nl'
        };
        delete analysis.new_data.kvk_nummer;
        if (!analysis.remaining_missing_info?.includes('kvk_nummer')) {
          analysis.remaining_missing_info = analysis.remaining_missing_info || [];
          analysis.remaining_missing_info.push('kvk_nummer');
        }
      }
    }
    
    // Log rejection context if any rejections occurred
    if (Object.keys(rejectionContext).length > 0) {
      console.log("📝 Rejection context voor slimme follow-up:", JSON.stringify(rejectionContext));
    }

    // =====================================================
    // 🔒 FASE 1 FIX: SLOT DETECTION MET AUDIT LOGGING
    // Combineert regex + AI resultaten en logt naar slot_detection_audit
    // =====================================================
    if (hasOfferedSlots && strippedReply) {
      console.log("🎯 Running combined slot detection with audit logging...");
      
      const slotDetectionInput: SlotDetectionInput = {
        rawEmailText: emailText,
        strippedReply: strippedReply,
        offeredSlots: offeredSlots,
        applicationId: applicationId!,
        emailId: emailId,
        messageId: message_id,
        orgId: application.org_id,
      };
      
      // AI analysis result (if slot was detected by AI)
      const aiAnalysisForSlots = analysis.selected_slot_index !== null ? {
        selected_slot_index: analysis.selected_slot_index,
        confidence: analysis.confidence || 0.7,
      } : undefined;
      
      slotDetectionResult = await detectInterviewSlot(
        supabase,
        slotDetectionInput,
        aiAnalysisForSlots
      );
      
      console.log("🎯 SLOT DETECTION RESULT (with audit):");
      console.log("   Detected slot:", slotDetectionResult.detectedSlot);
      console.log("   Confidence:", slotDetectionResult.confidence);
      console.log("   Method:", slotDetectionResult.method);
      console.log("   Requires confirmation:", slotDetectionResult.requiresConfirmation);
      
      // Update regexDetectedSlot met het gecombineerde resultaat
      if (slotDetectionResult.detectedSlot !== null) {
        regexDetectedSlot = slotDetectionResult.detectedSlot;
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
      vog_issue_date?: string;
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
          
          // Detect document type from filename - expanded for Dutch healthcare education
          const detectDocType = (filename: string): 'vog' | 'diploma' | 'certificate' | 'cv' | 'id' | 'other' => {
            const lower = filename.toLowerCase();
            
            // VOG detection
            if (lower.includes('vog') || lower.includes('verklaring omtrent') || lower.includes('verklaring_omtrent')) return 'vog';
            
            // Diploma detection - expanded for Dutch healthcare education
            if (
              lower.includes('diploma') || 
              lower.includes('getuigschrift') ||
              // Education levels
              lower.includes('mbo') ||
              lower.includes('hbo') ||
              lower.match(/\bwo\b/) ||
              lower.includes('bachelor') ||
              lower.includes('master') ||
              // Healthcare education keywords
              lower.includes('verpleegkund') ||
              lower.includes('verzorgend') ||
              lower.includes('helpende') ||
              lower.includes('ggz') ||
              lower.includes('gehandicaptenzorg') ||
              lower.includes('maatschappelijke zorg') ||
              lower.includes('welzijn') ||
              lower.includes('zorg') ||
              // Qualification terms
              lower.match(/niveau\s*[2-5]/) ||
              lower.includes('kwalificatie')
            ) return 'diploma';
            
            // Certificate detection
            if (lower.includes('certificaat') || lower.includes('certificate') || lower.includes('bhv') || lower.includes('ehbo')) return 'certificate';
            
            // CV detection
            if (lower.includes('cv') || lower.includes('curriculum') || lower.includes('resume')) return 'cv';
            
            // ID detection
            if (lower.includes('id') || lower.includes('paspoort') || lower.includes('rijbewijs') || lower.includes('identiteit')) return 'id';
            
            return 'other';
          };

          const documentType = detectDocType(attachment.filename);
          console.log(`📄 Document type detected: ${documentType} for file: ${attachment.filename}`);
          
          // Decode base64 content
          const fileBuffer = Uint8Array.from(atob(attachment.content), c => c.charCodeAt(0));
          const filePath = `${applicationId}/${Date.now()}_${attachment.filename}`;
          
          // =====================================================
          // PHASE 1: DOCUMENT CONTENT VALIDATION
          // =====================================================
          const validationFlags: string[] = [];
          let requiresManualReview = false;
          let contentValidationResult: { isValid: boolean; score: number; foundKeywords: string[]; warnings: string[] } | undefined;
          
          // 1.1 PDF Magic Bytes Check (for PDF files)
          const isPdfFile = attachment.content_type === 'application/pdf' || 
                           attachment.filename.toLowerCase().endsWith('.pdf');
          
          if (isPdfFile) {
            if (!isValidPdf(fileBuffer)) {
              validationFlags.push('invalid_pdf_format');
              console.warn(`⚠️ VALIDATION: File ${attachment.filename} claims to be PDF but has invalid magic bytes`);
              requiresManualReview = true;
            } else {
              console.log(`✅ PDF magic bytes valid for: ${attachment.filename}`);
            }
          }
          
          // 1.2 Content Keyword Validation (VOG/Diploma)
          if (isPdfFile && isValidPdf(fileBuffer)) {
            const extractedText = extractBasicTextFromPdf(fileBuffer);
            
            if (documentType === 'vog') {
              const vogValidation = validateVogContent(extractedText);
              contentValidationResult = {
                isValid: vogValidation.isValid,
                score: vogValidation.score,
                foundKeywords: vogValidation.foundKeywords,
                warnings: vogValidation.missingRequired.map(k => `missing_keyword:${k}`),
              };
              
              if (!vogValidation.isValid) {
                validationFlags.push('vog_content_invalid');
                validationFlags.push(...vogValidation.missingRequired.map(k => `missing_vog_keyword:${k}`));
                console.warn(`⚠️ VALIDATION: VOG content validation failed (score: ${vogValidation.score})`);
                console.warn(`   Missing keywords: ${vogValidation.missingRequired.join(', ')}`);
                requiresManualReview = true;
              } else {
                console.log(`✅ VOG content validated (score: ${vogValidation.score}, keywords: ${vogValidation.foundKeywords.join(', ')})`);
              }
            } else if (documentType === 'diploma' || documentType === 'certificate') {
              const diplomaValidation = validateDiplomaContent(extractedText);
              contentValidationResult = {
                isValid: diplomaValidation.isValid,
                score: diplomaValidation.score,
                foundKeywords: diplomaValidation.foundKeywords,
                warnings: diplomaValidation.isHealthcareRelated ? [] : ['not_healthcare_related'],
              };
              
              if (!diplomaValidation.isValid) {
                validationFlags.push('diploma_content_invalid');
                console.warn(`⚠️ VALIDATION: Diploma content validation failed (score: ${diplomaValidation.score})`);
                requiresManualReview = true;
              } else {
                console.log(`✅ Diploma content validated (score: ${diplomaValidation.score}, healthcare: ${diplomaValidation.isHealthcareRelated})`);
                if (!diplomaValidation.isHealthcareRelated) {
                  validationFlags.push('diploma_not_healthcare');
                }
              }
            }
          }
          
          // 1.3 SHA256 Duplicate Detection
          let contentHash: string | undefined;
          let duplicateInfo: { applicationId: string; filename: string; uploadedAt: string } | undefined;
          
          try {
            contentHash = await calculateContentHash(fileBuffer);
            console.log(`🔐 Document hash: ${contentHash.substring(0, 16)}...`);
            
            // Check for existing documents with same hash
            const { data: existingDocs, error: hashCheckError } = await supabase
              .from('application_documents')
              .select('application_id, filename, created_at')
              .eq('metadata->>content_hash', contentHash)
              .limit(1);
            
            if (!hashCheckError && existingDocs && existingDocs.length > 0) {
              const existing = existingDocs[0];
              // Only flag as duplicate if from DIFFERENT application
              if (existing.application_id !== applicationId) {
                validationFlags.push('duplicate_document');
                duplicateInfo = {
                  applicationId: existing.application_id,
                  filename: existing.filename,
                  uploadedAt: existing.created_at,
                };
                console.warn(`⚠️ DUPLICATE DETECTED: Document already exists for application ${existing.application_id}`);
                console.warn(`   Original file: ${existing.filename} uploaded at ${existing.created_at}`);
                requiresManualReview = true;
              } else {
                console.log(`ℹ️ Document is re-upload of same file for this application`);
              }
            }
          } catch (hashError) {
            console.error(`❌ Failed to calculate content hash:`, hashError);
          }
          
          // =====================================================
          // PHASE 2A: NAME CROSS-VALIDATION
          // Uses AI Vision to extract name from document and
          // compares with applicant name using fuzzy matching
          // =====================================================
          let identityValidation: IdentityValidationResult | undefined;
          
          // Only validate VOG, diploma, certificate, ID documents
          const shouldValidateIdentity = ['vog', 'diploma', 'certificate', 'id'].includes(documentType);
          
          if (shouldValidateIdentity && isPdfFile && isValidPdf(fileBuffer)) {
            console.log(`🔍 PHASE 2A: Starting name cross-validation for ${documentType} document...`);
            
            // Get applicant name from extracted_data
            const applicantName = (application.extracted_data as any)?.naam || 
                                 (application.extracted_data as any)?.full_name ||
                                 (application.extracted_data as any)?.name ||
                                 '';
            
            console.log(`👤 Applicant name from extracted_data: "${applicantName}"`);
            
            if (applicantName) {
              try {
                // Extract name from document using AI Vision
                const nameExtraction = await extractNameFromDocumentVision(
                  attachment.content,
                  documentType,
                  lovableApiKey
                );
                
                console.log(`📄 AI Vision extraction result:`, {
                  name: nameExtraction.name,
                  confidence: nameExtraction.confidence,
                  error: nameExtraction.error,
                });
                
                // Perform fuzzy name matching
                const nameMatch = fuzzyNameMatch(nameExtraction.name, applicantName);
                
                console.log(`🔍 Name match result:`, {
                  score: nameMatch.score,
                  matchType: nameMatch.matchType,
                  details: nameMatch.details,
                });
                
                // Build identity validation result
                identityValidation = {
                  document_name: nameExtraction.name,
                  applicant_name: applicantName,
                  match_score: nameMatch.score,
                  match_type: nameMatch.matchType,
                  confidence: nameExtraction.confidence,
                  validated_at: new Date().toISOString(),
                  ai_model: 'google/gemini-2.5-flash',
                  extraction_method: nameExtraction.method || (nameExtraction.name ? 'ai_vision' : 'not_attempted'),
                };
                
                // Apply validation logic based on match score
                if (nameMatch.matchType === 'not_extractable') {
                  // Name couldn't be extracted - flag for review
                  validationFlags.push('name_extraction_failed');
                  console.log(`⚠️ Could not extract name from ${documentType} document - flagged for review`);
                  requiresManualReview = true;
                } else if (nameMatch.score >= 85) {
                  // High match - accept
                  console.log(`✅ Name match ACCEPTED (score: ${nameMatch.score}, type: ${nameMatch.matchType})`);
                } else if (nameMatch.score >= 50) {
                  // Partial match - accept with warning
                  validationFlags.push('name_partial_match');
                  console.log(`⚠️ Name partial match (score: ${nameMatch.score}) - accepted with warning`);
                  // Don't set requiresManualReview for partial matches - just flag
                } else {
                  // Low match - MISMATCH - critical security issue
                  validationFlags.push('name_identity_mismatch');
                  console.warn(`🚨 NAME MISMATCH DETECTED!`);
                  console.warn(`   Document name: "${nameExtraction.name}"`);
                  console.warn(`   Applicant name: "${applicantName}"`);
                  console.warn(`   Match score: ${nameMatch.score}`);
                  requiresManualReview = true;
                  
                  // =====================================================
                  // PHASE 2A FIX: Log security alerts for ALL identity documents
                  // VOG, Diploma, Certificate, ID - all critical for identity verification
                  // =====================================================
                  const alertTitles: Record<string, string> = {
                    'vog': '🚨 VOG Identity Mismatch Detected',
                    'diploma': '🚨 Diploma Identity Mismatch Detected',
                    'certificate': '🚨 Certificate Identity Mismatch Detected',
                    'id': '🚨 ID Document Identity Mismatch Detected',
                  };
                  
                  const alertDescriptions: Record<string, string> = {
                    'vog': `VOG document name "${nameExtraction.name}" does not match applicant "${applicantName}" (score: ${nameMatch.score})`,
                    'diploma': `Diploma name "${nameExtraction.name}" does not match applicant "${applicantName}" (score: ${nameMatch.score}) - qualification may belong to different person`,
                    'certificate': `Certificate name "${nameExtraction.name}" does not match applicant "${applicantName}" (score: ${nameMatch.score}) - certification may belong to different person`,
                    'id': `ID document name "${nameExtraction.name}" does not match applicant "${applicantName}" (score: ${nameMatch.score})`,
                  };
                  
                  // Log high-severity security alert for all identity documents
                  // Use correct system_events schema: event_data contains all details
                  await supabase.from('system_events').insert({
                    event_type: 'security_alert',
                    entity_type: 'document_identity_mismatch',
                    entity_id: applicationId,
                    org_id: application.org_id,
                    event_data: {
                      severity: 'high',
                      title: alertTitles[documentType] || '🚨 Document Identity Mismatch Detected',
                      description: alertDescriptions[documentType] || `Document name "${nameExtraction.name}" does not match applicant "${applicantName}" (score: ${nameMatch.score})`,
                      application_id: applicationId,
                      document_type: documentType,
                      document_filename: attachment.filename,
                      document_name: nameExtraction.name,
                      applicant_name: applicantName,
                      match_score: nameMatch.score,
                      match_type: nameMatch.matchType,
                      extraction_method: nameExtraction.method,
                      action_required: documentType === 'vog' 
                        ? 'HR must verify VOG belongs to correct applicant - CRITICAL for compliance'
                        : documentType === 'diploma' || documentType === 'certificate'
                          ? 'HR must verify qualification belongs to correct applicant - affects candidate eligibility'
                          : 'HR must verify document belongs to correct applicant',
                    },
                    metadata: { source: 'handle-application-reply', version: '2.0' },
                  });
                  
                  console.log(`📝 High-severity security alert logged for ${documentType.toUpperCase()} identity mismatch`);
                }
                
              } catch (validationError) {
                console.error(`❌ Name cross-validation failed:`, validationError);
                validationFlags.push('name_validation_error');
                identityValidation = {
                  document_name: null,
                  applicant_name: applicantName,
                  match_score: 0,
                  match_type: 'not_extractable',
                  confidence: 0,
                  validated_at: new Date().toISOString(),
                  extraction_method: 'not_attempted',
                };
              }
            } else {
              console.log(`⚠️ No applicant name available for cross-validation`);
              validationFlags.push('applicant_name_missing');
            }
          }
          
          // Log validation result
          console.log(`📋 Validation result for ${attachment.filename}:`);
          console.log(`   Flags: ${validationFlags.length > 0 ? validationFlags.join(', ') : 'none'}`);
          console.log(`   Requires review: ${requiresManualReview}`);
          if (identityValidation) {
            console.log(`   Identity validation: score=${identityValidation.match_score}, type=${identityValidation.match_type}`);
          }
          
          // Upload to Storage (always upload, even if flagged - for HR review)
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
              // Date not found in filename - check if content validation passed
              if (validationFlags.includes('vog_content_invalid')) {
                vogExpiryStatus = 'quarantine';
                validationFlags.push('vog_date_unknown');
                console.log(`⚠️ VOG uploaded without date and content validation failed - quarantined`);
              } else {
                vogExpiryStatus = 'pending_review';
                validationFlags.push('vog_date_unknown');
                console.log(`ℹ️ VOG uploaded, date not detected - pending review`);
              }
            }
            
            // If VOG has validation issues, override status to quarantine
            if (requiresManualReview && vogExpiryStatus === 'valid') {
              vogExpiryStatus = 'pending_review';
            }
          }
          
          // Insert document record into database with validation info
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
                // Phase 1 validation data
                content_hash: contentHash,
                validation_flags: validationFlags,
                requires_manual_review: requiresManualReview,
                content_validation: contentValidationResult,
                duplicate_info: duplicateInfo,
                // Phase 2a: Identity validation data
                identity_validation: identityValidation,
                validated_at: new Date().toISOString(),
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
              vog_issue_date: vogIssueDate || undefined,
            });
            
            // Update extracted_data based on document type
            // Only accept VOG if validation passed AND not quarantined
            // Note: VOG file is stored in application_documents table, not as file_path column
            if (documentType === 'vog' && vogExpiryStatus === 'valid' && !requiresManualReview) {
              analysis.new_data.vog_validation_status = 'valid';
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
              analysis.new_data.vog_validation_status = 'expired';
              analysis.new_data.vog_expired = true;
              console.log(`⚠️ VOG expired - still in missing_info`);
            } else if (documentType === 'vog' && requiresManualReview) {
              // VOG needs HR review - don't accept automatically
              analysis.new_data.vog_validation_status = 'pending_review';
              analysis.new_data.vog_pending_review = true;
              console.log(`⚠️ VOG requires manual review due to validation flags: ${validationFlags.join(', ')}`);
            }
            
            // Log validation event for learning
            if (validationFlags.length > 0) {
              await supabase.from('system_events').insert({
                org_id: application.org_id,
                event_type: 'document_validation_flagged',
                entity_type: 'application_document',
                entity_id: applicationId,
                event_data: {
                  filename: attachment.filename,
                  document_type: documentType,
                  validation_flags: validationFlags,
                  requires_manual_review: requiresManualReview,
                  content_hash: contentHash,
                  duplicate_info: duplicateInfo,
                  content_validation_score: contentValidationResult?.score,
                },
                metadata: {
                  applicant_email: application.email_from,
                  applicant_name: (application.extracted_data as Record<string, unknown>)?.naam,
                }
              });
            }
          }
        } catch (attachmentError) {
          console.error(`❌ Error processing attachment ${attachment.filename}:`, attachmentError);
        }
      }
      
      console.log(`📎 Processed ${processedDocuments.length} documents`);
      
      // =====================================================
      // PHASE 2.5: Update Application with Document Paths (ALWAYS)
      // This runs REGARDLESS of professional_id existence
      // =====================================================
      if (processedDocuments.length > 0) {
        console.log(`📄 [Phase 2.5] Updating application with document paths...`);
        
        for (const doc of processedDocuments) {
          // Handle diploma documents - trigger DUO verification
          if (doc.document_type === 'diploma' || doc.document_type === 'certificate') {
            console.log(`🎓 Diploma detected: ${doc.file_path} - updating application and triggering DUO verification`);
            
            // Update application with diploma file path and set verification to pending
            // Note: diploma_validation_status uses 'received' (not 'pending') per DB constraint
            const { error: diplomaUpdateError } = await supabase
              .from('professional_applications')
              .update({ 
                diploma_file_path: doc.file_path,
                diploma_validation_status: 'received',
                duo_verification_status: 'pending'
              })
              .eq('id', applicationId);
            
            if (diplomaUpdateError) {
              console.error(`❌ Failed to update diploma_file_path:`, diplomaUpdateError);
            } else {
              console.log(`✅ Application updated with diploma_file_path: ${doc.file_path}`);
              
              // CRITICAL FIX: Recalculate missing_info with document awareness
              // This ensures 'diploma' is removed from missing_info immediately after upload
              try {
                const { data: currentApp } = await supabase
                  .from('professional_applications')
                  .select('extracted_data, diploma_file_path, cv_file_path, vog_validation_status')
                  .eq('id', applicationId)
                  .single();
                
                if (currentApp) {
                  const updatedMissingInfo = recalculateMissingInfo(
                    currentApp.extracted_data as Record<string, unknown>,
                    currentApp  // Pass application data for document file_path checks
                  );
                  
                  console.log(`📋 Updated missing_info after diploma upload: [${updatedMissingInfo.join(', ')}]`);
                  
                  await supabase
                    .from('professional_applications')
                    .update({ missing_info: updatedMissingInfo })
                    .eq('id', applicationId);
                }
              } catch (missingInfoError) {
                console.error('⚠️ Failed to update missing_info after diploma upload:', missingInfoError);
              }
              
              // Trigger async DUO verification - non-blocking with robust fallback
              supabase.functions.invoke('verify-diploma-duo', {
                body: {
                  action: 'verify',
                  application_id: applicationId,
                  diploma_file_path: doc.file_path
                }
              }).then(async (result) => {
                if (result.error) {
                  console.error('❌ DUO verification trigger failed:', result.error);
                  
                  // Fallback: set to manual_review instead of leaving as error
                  const { error: fallbackError } = await supabase
                    .from('professional_applications')
                    .update({ 
                      duo_verification_status: 'manual_review',
                      duo_verification_result: { 
                        message: 'DUO verificatie kon niet worden gestart - handmatige verificatie vereist',
                        error: result.error.message,
                        fallback_at: new Date().toISOString()
                      }
                    })
                    .eq('id', applicationId);
                    
                  if (fallbackError) {
                    console.error('❌ Failed to set fallback status:', fallbackError);
                  } else {
                    console.log('✅ DUO verification set to manual_review for HR follow-up');
                  }
                } else {
                  console.log('✅ DUO verification triggered successfully:', result.data);
                }
              }).catch(async (err) => {
                console.error('❌ DUO verification invoke error:', err);
                
                // Fallback: set to manual_review on network/invocation errors
                try {
                  await supabase
                    .from('professional_applications')
                    .update({ 
                      duo_verification_status: 'manual_review',
                      duo_verification_result: { 
                        message: 'DUO verificatie service niet bereikbaar - handmatige verificatie vereist',
                        error: err instanceof Error ? err.message : 'Invocation failed',
                        fallback_at: new Date().toISOString()
                      }
                    })
                    .eq('id', applicationId);
                  console.log('✅ DUO verification set to manual_review after invoke error');
                } catch (fallbackErr) {
                  console.error('❌ Failed to set fallback status:', fallbackErr);
                }
              });
              
              console.log(`✅ DUO verification queued for ${doc.filename}`);
            }
          }
          
          // Handle VOG documents - only update validation status (file stored in application_documents)
          if (doc.document_type === 'vog' && doc.vog_expiry_status === 'valid') {
            const { error: vogUpdateError } = await supabase
              .from('professional_applications')
              .update({ vog_validation_status: 'valid' })
              .eq('id', applicationId);
            
            if (vogUpdateError) {
              console.error(`❌ Failed to update vog_validation_status:`, vogUpdateError);
            } else {
              console.log(`✅ Application updated with vog_validation_status: valid`);
            }
          }
        }
      }
      
      // =====================================================
      // FIX 2: REFRESH APPLICATION DATA NA DOCUMENT UPLOADS
      // Zorgt dat completeness berekening verse data gebruikt
      // =====================================================
      if (processedDocuments.length > 0) {
        console.log("🔄 Refreshing application data after document uploads...");
        const { data: refreshedApp, error: refreshError } = await supabase
          .from("professional_applications")
          .select(`*`)
          .eq("id", applicationId)
          .single();
        
        if (refreshedApp && !refreshError) {
          // Update application object met verse document paths en statuses
          Object.assign(application, {
            cv_file_path: refreshedApp.cv_file_path,
            diploma_file_path: refreshedApp.diploma_file_path,
            vog_validation_status: refreshedApp.vog_validation_status,
            diploma_validation_status: refreshedApp.diploma_validation_status,
            duo_verification_status: refreshedApp.duo_verification_status,
          });
          
          console.log("✅ Application refreshed after document uploads:", {
            cv_file_path: !!refreshedApp.cv_file_path,
            diploma_file_path: !!refreshedApp.diploma_file_path,
            vog_validation_status: refreshedApp.vog_validation_status,
            diploma_validation_status: refreshedApp.diploma_validation_status,
            duo_verification_status: refreshedApp.duo_verification_status,
          });
        } else if (refreshError) {
          console.warn("⚠️ Failed to refresh application data:", refreshError.message);
        }
      }
      
      // =====================================================
      // v1.4.0 FASE 1 CHECK: Probeer stage transitie als in 'nieuw'
      // Dit checkt of alle documenten ontvangen EN geverifieerd zijn
      // =====================================================
      const pipelineStage = application.pipeline_stage || 'nieuw';
      
      if (pipelineStage === 'nieuw' && processedDocuments.length > 0) {
        console.log(`🔍 [Fase 1 Check] Application in 'nieuw' stage, checking completeness...`);
        
        // Check if we have diploma documents - wait for DUO verification first
        const hasNewDiploma = processedDocuments.some(d => 
          d.document_type === 'diploma' || d.document_type === 'certificate'
        );
        
        if (hasNewDiploma) {
          // DUO verification is async - we need to wait a bit or handle in callback
          // For now, log that we're waiting for DUO verification
          console.log(`⏳ [Fase 1] Diploma uploaded, waiting for DUO verification before stage transition`);
          console.log(`   DUO verification is async - stage transition will happen when verification completes`);
          
          // Create a system event for tracking
          await supabase.from('system_events').insert({
            org_id: application.org_id,
            event_type: 'fase1_awaiting_verification',
            entity_type: 'professional_application',
            entity_id: applicationId,
            event_data: {
              documents_received: processedDocuments.map(d => d.document_type),
              awaiting_verification: ['diploma'],
              current_completeness: application.completeness_score,
            },
            metadata: { source: 'handle-application-reply', version: '3.1.0' }
          });
        } else {
          // No diploma in this batch - check if we can advance anyway
          const fase1Result = await checkFase1Completeness(supabase, applicationId);
          
          console.log(`📋 [Fase 1] Completeness check result:`, {
            canAdvance: fase1Result.canAdvance,
            hasCV: fase1Result.hasCV,
            hasDiploma: fase1Result.hasDiploma,
            diplomaVerified: fase1Result.diplomaVerified,
            completeness: fase1Result.completenessScore,
            blockers: fase1Result.blockers
          });
          
          if (fase1Result.canAdvance) {
            console.log(`✅ [Fase 1] All requirements met - triggering stage transition...`);
            
            const advanceResult = await tryAdvanceFase1(supabase, applicationId);
            
            if (advanceResult.transitioned) {
              console.log(`✅ [Fase 1] Successfully transitioned to intake_verstuurd`);
              
              // Update local application object
              Object.assign(application, { pipeline_stage: 'intake_verstuurd' });
              
              // Log audit event
              await supabase.from('application_conversations').insert({
                application_id: applicationId,
                role: 'system',
                content: `[Fase 1 Compleet] ✅ Alle vereisten voldaan:\n- CV ontvangen\n- Diploma ontvangen en geverifieerd via DUO\n- Completeness ${fase1Result.completenessScore}% ≥ 70%\n\nStage: nieuw → intake_verstuurd`,
                metadata: {
                  phase: 'fase1_complete',
                  transition: 'nieuw→intake_verstuurd',
                  completeness: fase1Result.completenessScore,
                  triggered_by: 'handle-application-reply'
                }
              });
            } else {
              console.log(`⚠️ [Fase 1] Transition failed:`, advanceResult.blockers);
            }
          } else {
            console.log(`⏳ [Fase 1] Not ready to advance:`, fase1Result.blockers);
          }
        }
      }
      
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
            // VOG file is stored in application_documents, update vog_date if available
            if (doc.vog_issue_date) {
              updateData.vog_date = doc.vog_issue_date;
            }
            hasVog = true;
          }
          if (doc.document_type === 'diploma' || doc.document_type === 'certificate') {
            hasDiploma = true;
            // DUO verification already triggered in Phase 2.5
          }
        }
        
        // Get current professional to check existing documents
        const { data: currentProfessional } = await supabase
          .from('professionals')
          .select('status, vog_date')
          .eq('id', application.professional_id)
          .single();
        
        const existingVog = !!currentProfessional?.vog_date || hasVog;
        
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
    // FASE 3 FIX: DEEP MERGE + SMART COMPLETENESS CALCULATION
    // Met placeholder telefoon detectie en diploma validatie
    // 🔧 KRITIEK: Deep merge behoudt bestaande data bij updates!
    // =====================================================
    
    // 🔧 FASE 3 FIX: Deep merge helper - behoudt bestaande waarden, voegt nieuwe toe
    const deepMergeData = (existing: Record<string, any>, newData: Record<string, any>): Record<string, any> => {
      const result = { ...existing };
      
      for (const key of Object.keys(newData)) {
        const newValue = newData[key];
        const existingValue = result[key];
        
        // Skip null/undefined nieuwe waarden - behoud bestaande
        if (newValue === null || newValue === undefined || newValue === '') {
          continue;
        }
        
        // Deep merge voor nested objects (maar niet arrays)
        if (
          typeof newValue === 'object' && 
          !Array.isArray(newValue) &&
          typeof existingValue === 'object' && 
          existingValue !== null &&
          !Array.isArray(existingValue)
        ) {
          result[key] = deepMergeData(existingValue, newValue);
        } else {
          // Nieuwe waarde overschrijft alleen als het een echte waarde is
          result[key] = newValue;
        }
      }
      
      return result;
    };
    
    // 🔧 FASE 3 FIX: DEEP MERGE in plaats van shallow merge
    const mergedData = deepMergeData(
      application.extracted_data || {},
      analysis.new_data || {}
    );
    
    console.log("🔧 FASE 3 DEEP MERGE DEBUG:");
    console.log("   Bestaande velden:", Object.keys(application.extracted_data || {}).length);
    console.log("   Nieuwe velden:", Object.keys(analysis.new_data || {}).length);
    console.log("   Gemerged velden:", Object.keys(mergedData).length);
    
    // 🔧 FASE 3 FIX: Normaliseer telefoon velden (AI kan naar verschillende keys schrijven)
    if (analysis.new_data?.telefoonnummer && !mergedData.telefoon) {
      mergedData.telefoon = analysis.new_data.telefoonnummer;
      console.log("📱 Telefoon genormaliseerd van telefoonnummer:", mergedData.telefoon);
    }
    if (analysis.new_data?.phone && !mergedData.telefoon) {
      mergedData.telefoon = analysis.new_data.phone;
      console.log("📱 Telefoon genormaliseerd van phone:", mergedData.telefoon);
    }
    
    // Normalize naam/full_name: ensure naam is set if full_name exists
    if (!mergedData.naam && mergedData.full_name) {
      mergedData.naam = mergedData.full_name;
      console.log("📝 Normalized naam from full_name:", mergedData.naam);
    }
    
    // 🔧 FASE 1 FIX: Check placeholder telefoon in merged data en blokkeer
    const phoneInMergedData = (mergedData.telefoonnummer || mergedData.phone || mergedData.telefoon) as string | undefined;
    let hasValidPhone = false;
    let phoneBlocked = false;
    
    if (phoneInMergedData) {
      if (isPlaceholderPhone(phoneInMergedData)) {
        console.log(`⚠️ FASE 1: Placeholder telefoon geblokkeerd: ${phoneInMergedData}`);
        // Verwijder placeholder uit merged data
        delete mergedData.telefoonnummer;
        delete mergedData.phone;
        delete mergedData.telefoon;
        phoneBlocked = true;
      } else {
        hasValidPhone = true;
      }
    }
    
    // =====================================================
    // FASE 6 FIX: DOCUMENT-AWARE COMPLETENESS BEREKENING
    // Vervangt de oude field-only berekening met document verificatie
    // =====================================================
    const completenessResult = calculateDocumentAwareCompleteness(
      mergedData,
      application,
      'geplaatst' // Target stage voor maximale berekening
    );

    const newCompletenessScore = completenessResult.score;
    
    // Build comprehensive missing info list
    let finalRemainingMissing = [
      ...completenessResult.missingFields,
      ...completenessResult.missingDocs.map(doc => `${doc}_upload`),
      ...completenessResult.unverifiedDocs.map(doc => `${doc}_verificatie`),
      ...completenessResult.expiredDocs.map(doc => `${doc}_verlopen`),
    ];
    
    // FIX 4: Dedupe document fields - verwijder redundante vragen als document al aanwezig
    // Check diploma - verwijder 'diploma' text field als diploma_upload al aanwezig is OF diploma_file_path al bestaat
    if (application.diploma_file_path) {
      finalRemainingMissing = finalRemainingMissing.filter(f => 
        f !== 'diploma' && f !== 'diploma_upload' && f !== 'diploma_type'
      );
      console.log("📋 Diploma file present, removed diploma/diploma_upload from missing info");
    }
    
    // Check CV - verwijder 'cv_upload' als cv_file_path al bestaat
    if (application.cv_file_path) {
      finalRemainingMissing = finalRemainingMissing.filter(f => 
        f !== 'cv' && f !== 'cv_upload'
      );
      console.log("📋 CV file present, removed cv/cv_upload from missing info");
    }
    
    // =====================================================
    // v1.7.0 FIX: DOCUMENT-AWARE VOG STATUS CHECK
    // Query application_documents table instead of just columns
    // =====================================================
    const { data: vogDocuments } = await supabase
      .from('application_documents')
      .select('id, is_verified, document_type, metadata')
      .eq('application_id', applicationId)
      .eq('document_type', 'vog')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasVogInDocuments = vogDocuments && vogDocuments.length > 0;
    const vogDocVerified = vogDocuments?.[0]?.is_verified === true;
    const vogPendingReview = hasVogInDocuments && !vogDocVerified;
    
    console.log(`📋 [v1.7.0] VOG document check: inDocTable=${hasVogInDocuments}, verified=${vogDocVerified}, pendingReview=${vogPendingReview}`);
    
    // Check VOG - verwijder vog vragen als document aanwezig is OF validation status OK is
    const vogValidStatuses = ['pending', 'pending_review', 'valid', 'verified', 'verified_gaav'];
    const vogStatusFromData = mergedData.vog_validation_status || application.vog_validation_status;
    
    if (hasVogInDocuments || (vogStatusFromData && vogValidStatuses.includes(vogStatusFromData))) {
      finalRemainingMissing = finalRemainingMissing.filter(f => 
        !f.toLowerCase().includes('vog')
      );
      console.log(`📋 VOG present (doc=${hasVogInDocuments}, status=${vogStatusFromData}), removed vog from missing info`);
    }
    
    // Add telefoon terug als blocked
    if (phoneBlocked && !finalRemainingMissing.includes('telefoonnummer')) {
      finalRemainingMissing.push('telefoonnummer (echt nummer, geen placeholder zoals 06-12345678)');
    }

    console.log("🧮 FASE 6 Document-Aware Completeness Calculation:");
    console.log("   Field score:", completenessResult.fieldScore);
    console.log("   Document score:", completenessResult.documentScore);
    console.log("   Total score:", completenessResult.score);
    console.log("   Missing docs:", completenessResult.missingDocs);
    console.log("   Unverified docs:", completenessResult.unverifiedDocs);
    console.log("   Expired docs:", completenessResult.expiredDocs);
    console.log("   Missing fields:", completenessResult.missingFields);
    console.log("   Blockers:", completenessResult.blockers);
    console.log("   VOG in documents table:", hasVogInDocuments);
    console.log("   Final remaining missing:", finalRemainingMissing);


    // =====================================================
    // EXPERT PANEL FLOW: Interview-first, geen automatische professional creation
    // Flow: NIEUW → INTERVIEW → SCREENING → GOEDGEKEURD → Professional
    // =====================================================
    
    const pipelineStage = application.pipeline_stage || 'nieuw';
    // 🔧 CONSOLIDATIE: Lees van COLUMN eerst, fallback naar JSONB
    const interviewStatus = application.interview_status || mergedData.interview_status;
    
    console.log(`📊 Current pipeline stage: ${pipelineStage}, Interview status: ${interviewStatus}`);
    
    // =====================================================
    // STAP 1: ALTIJD update application record EERST
    // =====================================================
    console.log("Updating application record...");
    
    // 🔧 FASE 3 FIX: Increment ai_response_count bij elke reply
    const currentResponseCount = (application.ai_response_count || 0) + 1;
    
    const { error: appUpdateError } = await supabase
      .from("professional_applications")
      .update({
        missing_info: finalRemainingMissing,
        completeness_score: newCompletenessScore,
        extracted_data: mergedData,
        ai_response_count: currentResponseCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      console.error("Error updating application:", appUpdateError);
    }
    
    // =====================================================
    // STAP 1.5: HERZIENE FLOW - GEEN automatische stage transitie!
    // Kandidaat BLIJFT in 'intake_verstuurd' totdat:
    // 1. Recruiter handmatig een gesprek plant, OF
    // 2. Kandidaat een aangeboden interview slot bevestigt
    // 
    // VERWIJDERD: Automatische transitie naar 'docs_compleet'
    // De stage 'docs_compleet' is geëlimineerd uit de flow.
    // =====================================================
    const hasCV = !!application.cv_file_path || !!mergedData.cv_file_path;
    const hasDiploma = !!application.diploma_file_path || !!mergedData.diploma_file_path;
    const isDiplomaVerified = ['verified_duo', 'verified_manual', 'verified_emrex', 'signature_valid'].includes(
      (application.diploma_validation_status as string) || ''
    );
    const hasMinimalCompleteness = newCompletenessScore >= 70;
    const hasCandidateInteraction = currentResponseCount >= 1;
    
    // Check if multi-agent architecture is enabled
    const { data: featureFlagData } = await supabase
      .from('system_feature_flags')
      .select('is_enabled, rollout_percentage')
      .eq('feature_name', 'multi_agent_architecture')
      .maybeSingle();
    
    const useMultiAgent = featureFlagData?.is_enabled === true;
    
    // =====================================================
    // LOG: Document status voor debugging
    // =====================================================
    console.log(`📊 HERZIENE FLOW - Document status check:`);
    console.log(`   Stage: ${pipelineStage}, CV: ${hasCV}, Diploma: ${hasDiploma}`);
    console.log(`   Diploma verified: ${isDiplomaVerified}, Completeness: ${newCompletenessScore}%`);
    console.log(`   Responses: ${currentResponseCount}, Multi-agent: ${useMultiAgent}`);
    
    // =====================================================
    // GEEN automatische stage transitie meer!
    // Kandidaat blijft in intake_verstuurd totdat gesprek gepland wordt
    // =====================================================
    if (['nieuw', 'intake_verstuurd'].includes(pipelineStage)) {
      // Documenten zijn compleet? → Notificeer recruiter, maar GEEN stage transitie!
      if (hasCV && hasDiploma && hasMinimalCompleteness) {
        console.log(`📊 HERZIENE FLOW: Documenten compleet! Maar GEEN automatische transitie.`);
        console.log(`   Kandidaat blijft in '${pipelineStage}' - wacht op gesprek planning door recruiter.`);
        
        // Notificeer recruiter dat kandidaat klaar is voor gesprek
        const professionalName = mergedData.naam || mergedData.full_name || from.split("@")[0];
        
        try {
          // Check of er al een recente notificatie is (binnen 24 uur)
          const { data: recentNotif } = await supabase
            .from('recruiter_notifications')
            .select('id')
            .eq('application_id', applicationId)
            .eq('notification_type', 'candidate_ready_for_interview')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .maybeSingle();
          
          if (!recentNotif) {
            await supabase.from("recruiter_notifications").insert({
              org_id: application.org_id,
              notification_type: 'candidate_ready_for_interview',
              title: `${professionalName} is klaar voor een gesprek`,
              message: `CV en diploma zijn binnen (completeness: ${newCompletenessScore}%). Plan een fysiek sollicitatiegesprek.`,
              application_id: applicationId,
              priority: 'high'
            });
            console.log(`✅ Recruiter notificatie aangemaakt: kandidaat klaar voor gesprek`);
          } else {
            console.log(`⏭️ Skipping recruiter notification - already sent in last 24 hours`);
          }
        } catch (notifErr) {
          console.warn("Could not create recruiter notification:", notifErr);
        }
      } else {
        const missing: string[] = [];
        if (!hasCV) missing.push('CV');
        if (!hasDiploma) missing.push('Diploma');
        if (!hasMinimalCompleteness) missing.push(`Completeness (${newCompletenessScore}% < 70%)`);
        
        console.log(`📊 HERZIENE FLOW: Staying in '${pipelineStage}' - ontbrekend: ${missing.join(', ')}`);
      }
    }

    // =====================================================
    // STAP 2: SCREENING Stage - Document Validation
    // Als stage = SCREENING, check documenten en transition naar GOEDGEKEURD
    // =====================================================
    if (pipelineStage === 'screening') {
      console.log("📋 SCREENING stage - checking document completeness...");
      
      const missingDocs: string[] = [];
      
      // VOG check met 3-maanden validatie - check vog_validation_status instead of non-existent vog_file_path
      const hasValidVog = mergedData.vog_validation_status && 
                          mergedData.vog_validation_status !== 'not_uploaded' &&
                          mergedData.vog_validation_status !== 'missing' &&
                          mergedData.vog_validation_status !== 'expired';
      
      if (!hasValidVog) {
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
          .in("status", ["pending", "planning", "executing", "in_progress", "executing_react"])
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
    // STAP 3: FASE 1 FIX - Interview Slot Selection = Stage Transition
    // Als kandidaat slot bevestigt → naar 'interview' stage + insert interview_appointments
    // =====================================================
    let interviewConfirmed = false;
    
    // 🎯 VERBETERD: Gebruik regex-detected slot als fallback voor AI
    // Prioriteit: regexDetectedSlot > analysis.selected_slot_index
    const finalSelectedSlot = regexDetectedSlot ?? analysis.selected_slot_index;
    
    console.log("🎯 SLOT SELECTION RESOLUTION:");
    console.log("   Regex detected slot:", regexDetectedSlot);
    console.log("   AI detected slot:", analysis.selected_slot_index);
    console.log("   Final selected slot:", finalSelectedSlot);
    
    // ✅ FIX: Check expliciet op number/string type, niet truthy (0 is valide slot!)
    const hasSelectedSlot = typeof finalSelectedSlot === 'number' || 
                            (typeof finalSelectedSlot === 'string' && finalSelectedSlot !== '');
    
    if (hasSelectedSlot && offeredSlots && offeredSlots.length > 0) {
      // Slot nummer is 1-indexed (zoals getoond aan kandidaat: optie 1, 2, 3)
      const rawIndex = typeof finalSelectedSlot === 'string' 
        ? parseInt(finalSelectedSlot) 
        : finalSelectedSlot;
      
      // DEFINITIEVE FIX: AI is geïnstrueerd om 1-indexed te returnen, dus altijd -1
      // rawIndex 1 → arrayIndex 0, rawIndex 2 → arrayIndex 1, etc.
      const slotIndex = rawIndex - 1;
      
      console.log(`🎯 SLOT SELECTIE: kandidaat koos optie ${rawIndex}, arrayIndex=${slotIndex}, totalSlots=${offeredSlots.length}`);
      if (slotIndex >= 0 && slotIndex < offeredSlots.length) {
        const selectedSlot = offeredSlots[slotIndex];
        console.log(`🎉 FASE 1: Kandidaat koos interview slot: ${selectedSlot.date} om ${selectedSlot.time}`);
        
        // Parse slot to datetime
        const slotDateTime = new Date(`${selectedSlot.date}T${selectedSlot.time}:00`);
        
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
            interviewConfirmed = true;
            
            // 🔧 FASE 1 FIX: Update application with confirmed slot + transition to interview stage
            const { error: slotUpdateError } = await supabase
              .from("professional_applications")
              .update({
                interview_confirmed_slot: selectedSlot,
                interview_scheduled_at: slotDateTime.toISOString(),
                interview_status: 'scheduled',
                pipeline_stage: 'interview',  // 🔧 KRITIEK: Alleen nu naar interview stage!
                status: 'in_gesprek',
                updated_at: new Date().toISOString(),
              })
              .eq("id", applicationId);
            
            if (slotUpdateError) {
              console.error("Error updating interview confirmation:", slotUpdateError);
            } else {
              console.log("✅ FASE 1: Stage transitioned to INTERVIEW (slot confirmed)");
              
              // 🔧 FASE 1 FIX: Insert interview appointment record
              const { error: appointmentError } = await supabase
                .from("interview_appointments")
                .insert({
                  application_id: applicationId,
                  professional_id: application.professional_id || '00000000-0000-0000-0000-000000000000', // Placeholder until professional created
                  org_id: application.org_id,
                  scheduled_at: slotDateTime.toISOString(),
                  duration_min: 30,
                  location: 'Microsoft Teams (video)',
                  status: 'scheduled',
                });
              
              if (appointmentError) {
                console.error("Error creating interview appointment:", appointmentError);
              } else {
                console.log("✅ Interview appointment record created");
              }
              
              // Log stage audit event
              await supabase.from("application_stage_audit").insert({
                application_id: applicationId,
                from_stage: 'nieuw',
                to_stage: 'interview',
                reason: 'Automatische transitie: Interview slot bevestigd door kandidaat',
                performed_by: null,
                metadata: {
                  completeness_score: newCompletenessScore,
                  confirmed_slot: selectedSlot,
                  trigger: 'handle-application-reply',
                }
              });
            }
            
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
    // STAP 4: SLOT REJECTION DETECTIE (NIEUW!)
    // Als kandidaat "kan niet" op aangeboden slots → stuur alternatieven
    // =====================================================
    const slotRejection = analysis.slot_rejection === true;
    const rejectionReason = analysis.rejection_reason || null;
    const preferredTimes = analysis.preferred_times || [];
    const currentAlternativeCount = (mergedData.interview_alternative_request_count as number) || 0;
    const MAX_ALTERNATIVE_REQUESTS = parseInt(Deno.env.get('MAX_ALTERNATIVE_REQUESTS') || '2');
    
    if (slotRejection && hasOfferedSlots && !interviewConfirmed) {
      console.log("🔄 SLOT REJECTION DETECTED - kandidaat kan niet op aangeboden slots");
      console.log("   Reden:", rejectionReason);
      console.log("   Gewenste tijden:", preferredTimes);
      console.log("   Huidige alternative count:", currentAlternativeCount);
      
      if (currentAlternativeCount < MAX_ALTERNATIVE_REQUESTS) {
        console.log(`📧 Sending alternative slots (attempt ${currentAlternativeCount + 1}/${MAX_ALTERNATIVE_REQUESTS})...`);
        
        try {
          const { data: altResult, error: altError } = await supabase.functions.invoke('auto-send-interview-slots', {
            body: {
              application_id: applicationId,
              trigger_source: 'alternative_request',
              force: true, // Skip threshold check
              alternative_attempt: currentAlternativeCount
            }
          });
          
          if (altError) {
            console.error("Error sending alternative slots:", altError);
          } else {
            console.log("✅ Alternative slots sent:", altResult);
            
            // Update extracted_data met rejection info + sync missing_info
            const updatedDataForRejection = {
              ...mergedData,
              interview_alternative_request_count: currentAlternativeCount + 1,
              last_slot_rejection_reason: rejectionReason,
              preferred_interview_times: preferredTimes,
            };
            
            await supabase
              .from("professional_applications")
              .update({
                extracted_data: updatedDataForRejection,
                missing_info: recalculateMissingInfo(updatedDataForRejection),
              })
              .eq("id", applicationId);
          }
        } catch (altErr) {
          console.error("Exception sending alternative slots:", altErr);
        }
      } else {
        console.log(`⚠️ Max alternative requests reached (${currentAlternativeCount}/${MAX_ALTERNATIVE_REQUESTS}), creating manual intervention goal`);
        
        // Create manual intervention goal
        const { error: goalError } = await supabase
          .from("agent_goals")
          .insert({
            org_id: application.org_id,
            goal_type: "manual_interview_scheduling",
            goal_description: `Handmatige interview planning nodig voor ${mergedData.naam || mergedData.full_name || from}`,
            priority: 100,
            input_data: {
              application_id: applicationId,
              reason: 'max_alternative_requests_exceeded',
              alternative_attempts: currentAlternativeCount,
              rejection_reason: rejectionReason,
              preferred_times: preferredTimes,
            },
            status: "pending"
          });
        
        if (!goalError) {
          await supabase
            .from("professional_applications")
            .update({
              interview_status: 'awaiting_manual_intervention',
            })
            .eq("id", applicationId);
        }
      }
    }

    // =====================================================
    // STAP 5: VERWIJDERD - Interview slots nu ALLEEN via STAP 6 goal
    // Dit voorkomt race condition en dubbele interview emails
    // =====================================================
    const currentInterviewStatus = mergedData.interview_status as string || interviewStatus;
    const INTERVIEW_THRESHOLD = parseInt(Deno.env.get('INTERVIEW_THRESHOLD') || '85');
    
    // Log voor debugging, maar GEEN actie hier - alles via STAP 6
    if (newCompletenessScore >= INTERVIEW_THRESHOLD) {
      console.log(`📊 Completeness ${newCompletenessScore}% >= threshold ${INTERVIEW_THRESHOLD}% - interview eligibility via STAP 6`);
    }
    
    // Skip response email flag - alleen true als interview slots al verstuurd zijn
    let skipResponseEmail = false;
    const skipStatuses = ['slots_offered', 'alternative_slots_offered', 'scheduled', 'confirmed', 'awaiting_manual_intervention'];
    if (currentInterviewStatus && skipStatuses.includes(currentInterviewStatus)) {
      console.log(`⏭️ Interview already in progress: ${currentInterviewStatus}, skipping response email`);
      skipResponseEmail = true;
    }
    
    // =====================================================
    // FIX DUBBELE EMAIL: Idempotency check voor recente followup emails
    // Voorkomt dat dezelfde email binnen 60 seconden opnieuw wordt verstuurd
    // =====================================================
    if (!skipResponseEmail) {
      const { data: recentFollowup } = await supabase
        .from('system_events')
        .select('id, created_at')
        .eq('entity_id', applicationId)
        .eq('event_type', 'email_sent_followup_question')
        .gte('created_at', new Date(Date.now() - 60000).toISOString())
        .limit(1)
        .maybeSingle();
      
      if (recentFollowup) {
        console.log(`⏭️ DEDUP: Skipping response email - followup already sent ${Math.round((Date.now() - new Date(recentFollowup.created_at).getTime()) / 1000)}s ago`);
        skipResponseEmail = true;
      }
    }
    
    // =====================================================
    // STAP 5: VERWIJDERD - application_intake_completion goal
    // Nu volledig afgehandeld door send_reply_response in STAP 6
    // Dit voorkomt dubbele goals en race conditions
    // =====================================================
    if (pipelineStage === 'nieuw' && newCompletenessScore < 80) {
      console.log(`📊 Completeness ${newCompletenessScore}% < 80%, follow-up handled via send_reply_response goal`);
    }

    // =====================================================
    // STAP 6: UNIFIED AI AGENT FLOW - Alle responses via agent goal
    // =====================================================
    const professionalName = mergedData.naam || mergedData.full_name || application.email_from.split("@")[0];
    
    // Skip agent response als gecombineerde interview email al gestuurd is
    if (skipResponseEmail) {
      console.log(`⏭️ Skipping agent response - combined interview email already sent`);
    } else {
      // 🔧 FIX v1.6.0: Only block if ACTIVE send_reply_response goal exists
      // Don't block because of completed welcome emails - they're different goal types
      const { data: existingGoal } = await supabase
        .from("agent_goals")
        .select("id, goal_type, status, created_at")
        .filter("input_data->>application_id", "eq", applicationId)
        .eq("goal_type", "send_reply_response")
        .in("status", ACTIVE_GOAL_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (existingGoal) {
        console.log(`⏭️ Skipping goal creation - active send_reply_response goal exists: ${existingGoal.id} (${existingGoal.status})`);
      } else {
        // 🔧 FIX: Check follow-up count to prevent email spam
        const currentFollowupCount = (mergedData.followup_email_count as number) || 0;
        
        if (currentFollowupCount >= MAX_FOLLOWUP_EMAILS) {
          console.log(`⚠️ Max follow-up emails reached (${currentFollowupCount}/${MAX_FOLLOWUP_EMAILS}), creating manual intervention goal`);
          
          await supabase.from("agent_goals").insert({
            org_id: application.org_id,
            goal_type: "manual_intervention_required",
            goal_description: `Handmatige opvolging nodig voor ${professionalName} - max follow-ups bereikt`,
            priority: 50,
            input_data: {
              application_id: applicationId,
              reason: 'max_followup_emails_exceeded',
              followup_count: currentFollowupCount,
              current_completeness: newCompletenessScore,
            },
            status: "pending"
          });
        } else {
          // Bepaal het response type op basis van situatie
          let responseType = 'standard_reply';
          let responsePriority = 100;
          
          if (pipelineStage === 'screening') {
            responseType = 'document_request';
            responsePriority = 120;
          } else if (pipelineStage === 'interview' || interviewStatus === 'scheduled') {
            responseType = 'interview_acknowledgment';
            responsePriority = 80;
          } else if (newCompletenessScore >= 80) {
            // 🔒 COMPLIANCE GATE: Check interview requirements before setting ready_for_interview
            const interviewGate = STAGE_COMPLIANCE_GATES['interview'];
            const presentDocs = getPresentDocuments(mergedData, application, true);
            const presentFields = interviewGate.requiredFields.filter(f => hasField(mergedData, f));
            
            const gateCheck = validateStageTransition(
              pipelineStage,
              'interview',
              newCompletenessScore,
              presentDocs,
              presentFields
            );
            
            if (gateCheck.allowed) {
              responseType = 'ready_for_interview';
              responsePriority = 150;
              console.log(`✅ Compliance gate PASSED for interview: docs=${presentDocs.join(',')}, fields=${presentFields.length}`);
            } else {
              console.log(`⚠️ Compliance gate BLOCKED interview: ${gateCheck.blockers.join('; ')}`);
              responseType = 'followup_with_context';
              responsePriority = 130;
            }
          } else if (finalRemainingMissing.length > 0 || Object.keys(rejectionContext).length > 0) {
            responseType = 'followup_with_context';
            responsePriority = 130;
          }

          console.log(`🤖 Creating unified agent goal: send_reply_response (type: ${responseType})`);

          // Maak agent goal met ALLE context voor slimme AI response
          const { error: goalError } = await supabase
            .from("agent_goals")
            .insert({
              org_id: application.org_id,
              goal_type: "send_reply_response",
              goal_description: `Reageer slim op reply van ${professionalName} (${responseType})`,
              priority: responsePriority,
              input_data: {
                application_id: applicationId,
                candidate_email: from,
                candidate_name: professionalName,
                // Volledige context voor AI-gestuurde response
                response_type: responseType,
                newly_extracted_data: analysis.new_data || {},
                // v1.4.0 FIX: Always pass object, never undefined - prevents missing context downstream
                rejection_context: rejectionContext || {},
                accepted_data: Object.keys(analysis.new_data || {}).filter(k => !rejectionContext[k]),
                remaining_missing_info: finalRemainingMissing,
                current_completeness: newCompletenessScore,
                pipeline_stage: pipelineStage,
                interview_status: interviewStatus,
                original_message_preview: emailText?.substring(0, 500),
                subject: subject,
                org_name: orgInfo.displayName,
                email_config: emailConfig,
                followup_count: currentFollowupCount + 1, // Track follow-up count
                // v1.7.0 FIX: Document status met application_documents table check
                document_statuses: {
                  cv: hasCV ? 'received' : 'missing',
                  diploma: hasDiploma ? (isDiplomaVerified ? 'verified' : 'received') : 'missing',
                  // v1.7.0: Check application_documents table for VOG
                  vog: vogDocVerified || mergedData.vog_validation_status === 'verified' || mergedData.vog_validation_status === 'verified_gaav'
                    ? 'verified'
                    : hasVogInDocuments || mergedData.vog_validation_status === 'pending_review' || !!mergedData.vog_file_path
                      ? 'received'  // VOG in quarantine/pending is still "received"
                      : 'missing'
                },
                template_data: {
                  cv_uploaded: hasCV,
                  diploma_uploaded: hasDiploma,
                  diploma_verified: isDiplomaVerified,
                  // v1.7.0: VOG status from documents table
                  vog_uploaded: hasVogInDocuments || !!mergedData.vog_file_path,
                  vog_verified: vogDocVerified || mergedData.vog_validation_status === 'verified' || mergedData.vog_validation_status === 'verified_gaav',
                  vog_pending_review: vogPendingReview || mergedData.vog_pending_review || false,
                },
              },
              status: "pending"
            });

          if (goalError) {
            console.error("Error creating reply response goal:", goalError);
          } else {
            console.log(`✅ Created send_reply_response goal for application ${applicationId}`);
            
            // Update follow-up count in extracted_data + sync missing_info
            const updatedDataForFollowup = {
              ...mergedData,
              followup_email_count: currentFollowupCount + 1,
            };
            
            await supabase
              .from("professional_applications")
              .update({
                extracted_data: updatedDataForFollowup,
                missing_info: recalculateMissingInfo(updatedDataForFollowup),
              })
              .eq("id", applicationId);

            // Direct de agent triggeren (geen wachten op cron)
            // FASE 4: Check multi-agent flag for routing
            try {
              const { data: agentFlag } = await supabase
                .from('system_feature_flags')
                .select('is_enabled')
                .eq('feature_name', 'multi_agent_architecture')
                .maybeSingle();
              
              if (agentFlag?.is_enabled) {
                // NEW: Route via pipeline-stage-controller
                console.log("🚀 [Multi-Agent] Routing to pipeline-stage-controller...");
                
                await supabase.functions.invoke('pipeline-stage-controller', {
                  body: {
                    action: 'route',
                    application_id: applicationId,
                    trigger: 'reply_processed',
                    response_type: responseType
                  }
                });
                
                console.log("✅ [Multi-Agent] Pipeline controller triggered for response");
              } else {
                // LEGACY: Trigger ai-agent-orchestrator
                console.log("🚀 [Legacy] Triggering ai-agent-orchestrator for immediate response...");
                
                await supabase.functions.invoke('ai-agent-orchestrator', {
                  body: { 
                    action: 'process_pending_goals',
                    filter_application_id: applicationId 
                  }
                });
                
                await supabase.functions.invoke('ai-agent-orchestrator', {
                  body: { 
                    action: 'execute_actions'
                  }
                });
                
                console.log("✅ [Legacy] AI Agent triggered for immediate response");
              }
            } catch (orchestratorErr) {
              console.warn("⚠️ Agent trigger failed, will retry via cron:", orchestratorErr);
            }
          }
        }
      }
    }

    // Save processing summary to conversations (voor audit trail)
    console.log("Saving processing summary...");
    const summaryContent = [
      `Reply verwerkt:`,
      `- Completeness: ${newCompletenessScore}%`,
      `- Stage: ${pipelineStage}`,
      Object.keys(rejectionContext).length > 0 ? `- Afgewezen data: ${Object.keys(rejectionContext).join(', ')}` : null,
      finalRemainingMissing.length > 0 ? `- Nog nodig: ${finalRemainingMissing.join(', ')}` : null,
      `- Response via AI Agent gepland`
    ].filter(Boolean).join('\n');

    const { error: responseInsertError } = await supabase
      .from("application_conversations")
      .insert({
        application_id: applicationId,
        role: "system",
        content: summaryContent,
        metadata: {
          processing_type: 'reply_analysis',
          completeness_score: newCompletenessScore,
          rejection_context: Object.keys(rejectionContext),
          remaining_missing: finalRemainingMissing,
          response_delegated_to: 'ai_agent',
        },
      });

    if (responseInsertError) {
      console.error("Error saving processing summary:", responseInsertError);
    }

    console.log("=== Reply Processing Complete (AI Agent Flow) ===");

    // =====================================================
    // 🔒 FASE 1: Mark processing complete (success path)
    // =====================================================
    await markProcessingComplete(supabase, lockId, {
      success: true,
      summary: {
        application_id: applicationId,
        completeness_score: newCompletenessScore,
        remaining_missing_info: finalRemainingMissing,
        intent_classification: intentResult?.primaryIntent,
        interview_confirmed: interviewConfirmed,
        processed_documents: processedDocuments.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        application_id: applicationId,
        completeness_score: newCompletenessScore,
        remaining_missing_info: finalRemainingMissing,
        response_flow: 'unified_ai_agent',
        rejection_context: Object.keys(rejectionContext),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
    
    // =====================================================
    // 🔒 END OF INNER TRY BLOCK (lock management)
    // =====================================================
    } catch (innerError) {
      // 🔒 FASE 1: Mark processing failed + release lock
      console.error("❌ Processing failed, releasing lock:", innerError);
      await markProcessingComplete(supabase, lockId, {
        success: false,
        summary: { application_id: applicationId || 'unknown' },
        error: innerError instanceof Error ? innerError.message : 'Unknown error',
      });
      throw innerError; // Re-throw voor outer catch
    }
    // =====================================================
    // END OF LOCK-PROTECTED BLOCK
    // =====================================================
    
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
