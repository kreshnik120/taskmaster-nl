import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { decode as base64Decode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// Helper function to format errors for readable logging
function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as { message?: string; code?: string; details?: string };
    return e.message || e.details || JSON.stringify(err);
  }
  return String(err);
}

/**
 * Normalizes phone numbers to a standard format for consistent lookups.
 * Removes '+', WhatsApp suffixes, and converts to digits only.
 * 
 * Examples:
 * - "+31642520970" → "31642520970"
 * - "31642520970@s.whatsapp.net" → "31642520970"
 * - "06-12345678" → "31612345678" (NL prefix)
 */
function normalizePhoneNumber(input: string): string {
  if (!input || input.startsWith('group-')) {
    return input; // Don't normalize groups
  }
  
  // Remove WhatsApp suffix first
  let normalized = input.split('@')[0];
  
  // Remove all non-digits (including + and -)
  normalized = normalized.replace(/[^0-9]/g, '');
  
  // NL: convert 06... to 316...
  if (normalized.startsWith('06') && normalized.length === 10) {
    normalized = '31' + normalized.substring(1);
  }
  
  // NL: convert 6... (without 0) to 316... if 9 digits
  if (normalized.startsWith('6') && normalized.length === 9) {
    normalized = '31' + normalized;
  }
  
  return normalized;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MediaData {
  base64: string;
  mimetype: string;
  filename: string;
  filesize: number;
}

interface WhatsAppEvent {
  event: string;
  sessionId: string;
  orgId: string;
  data: Record<string, unknown>;
  media?: MediaData;
}

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = SupabaseClient<any, any, any>;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);

  console.log(`[${requestId}] WhatsApp Bridge request received`);

  try {
    // 1. Validate authentication (API Key OR Supabase Auth)
    const apiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("Authorization");

    // Multi-key support: accept any env var starting with WHATSAPP_BRIDGE_API_KEY
    // This allows key rotation by adding new secrets (e.g., WHATSAPP_BRIDGE_API_KEY_V2)
    const envVars = Deno.env.toObject();
    const allowedKeyEnvNames: string[] = [];
    const allowedKeys: string[] = [];
    
    for (const [name, value] of Object.entries(envVars)) {
      // Accept: WHATSAPP_BRIDGE_API_KEY, WHATSAPP_BRIDGE_API_KEY_V2, WHATSAPP_BRIDGE_API_KEY_20260130, etc.
      // Also accept WHATSAPP_VPS_API_KEY as fallback
      if ((name === "WHATSAPP_BRIDGE_API_KEY" || name.startsWith("WHATSAPP_BRIDGE_API_KEY_") || name === "WHATSAPP_VPS_API_KEY") && value) {
        allowedKeyEnvNames.push(name);
        allowedKeys.push(value);
      }
    }

    // Safe logging: only show env var names (not values) and first 8 chars of received key
    const receivedKeyPreview = apiKey ? apiKey.substring(0, 8) + "..." : "(none)";
    console.log(`[${requestId}] Auth check: received key prefix="${receivedKeyPreview}", valid env vars=[${allowedKeyEnvNames.join(", ")}]`);

    const isValidApiKey = apiKey && allowedKeys.includes(apiKey);
    const isValidAuth = authHeader && authHeader.startsWith("Bearer ");

    if (!isValidApiKey && !isValidAuth) {
      console.error(`[${requestId}] ❌ No valid authentication provided. Key prefix="${receivedKeyPreview}", checked ${allowedKeyEnvNames.length} env vars`);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If using Supabase Auth, verify the user
    let userId: string | null = null;
    if (isValidAuth && !isValidApiKey) {
      // Create anon client with user's JWT for verification
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: { Authorization: authHeader! }
          },
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      
      const token = authHeader!.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
      
      if (authError || !user) {
        console.error(`[${requestId}] ❌ Auth error:`, authError?.message);
        return new Response(
          JSON.stringify({ success: false, error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      userId = user.id;
      console.log(`[${requestId}] ✅ Authenticated: ${user.email}`);
    }

    console.log(`[${requestId}] ✅ Auth: ${isValidApiKey ? 'API Key' : `User ${userId}`}`);

    // 2. Parse request body
    const body: WhatsAppEvent = await req.json();
    const { event, sessionId, orgId, data, media } = body;

    console.log(`[${requestId}] Event: ${event}, Session: ${sessionId}, Org: ${orgId}${media ? ', has media' : ''}`);

    if (!event || !sessionId || !orgId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: event, sessionId, orgId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 4. Verify org exists
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      console.error(`[${requestId}] ❌ Organization not found: ${orgId}`);
      return new Response(
        JSON.stringify({ success: false, error: "Organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Route event
    let result: Record<string, unknown>;

    switch (event) {
      case "message.received":
        result = await handleMessageReceived(supabase, sessionId, orgId, data, media, requestId);
        break;

      case "message.sent":
        result = await handleMessageSent(supabase, sessionId, orgId, data, requestId);
        break;

      case "session.connected":
        result = await handleSessionConnected(supabase, sessionId, orgId, data, requestId);
        break;

      case "session.disconnected":
        result = await handleSessionDisconnected(supabase, sessionId, orgId, requestId);
        break;

      case "session.qr":
        result = await handleSessionQR(supabase, sessionId, orgId, data, requestId);
        break;

      case "message.send":
        result = await handleSendMessage(supabase, orgId, data, requestId);
        break;

      case "contact.profilePicture":
        result = await handleContactProfilePicture(supabase, sessionId, orgId, data, media, requestId);
        break;

      case "contact.syncAllProfilePictures":
        result = await handleSyncAllProfilePictures(supabase, sessionId, orgId, requestId);
        break;

      case "message.ack":
        result = await handleMessageAck(supabase, sessionId, orgId, data, requestId);
        break;

      case "message.typing":
        result = await handleTypingEvent(supabase, sessionId, orgId, data, requestId);
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown event type: ${event}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const errorMessage = formatError(err);
    console.error(`[${requestId}] ❌ Error:`, errorMessage, JSON.stringify(err));
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleMessageReceived(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  media: MediaData | undefined,
  requestId: string
): Promise<Record<string, unknown>> {
const { 
    messageId, chatJid, 
    // Support BOTH legacy and VPS Spec v1.0 field names
    from, fromName,           // Legacy field names
    senderJid, pushName,      // VPS Spec v1.0 field names
    body, timestamp, type, isGroup, groupName,
    // New ClawdBot format: media fields in data object
    media_base64, media_filename, mediaType,
    // Quote/Reply data
    quotedMessage
  } = data as {
    messageId: string;
    chatJid: string;
    // Legacy
    from?: string;
    fromName?: string;
    // VPS Spec v1.0
    senderJid?: string;
    pushName?: string;
    body?: string;
    timestamp: number;
    type?: string;
    isGroup?: boolean;
    groupName?: string;
    // ClawdBot media fields
    media_base64?: string;
    media_filename?: string;
    mediaType?: string;
    // Quote/Reply
    quotedMessage?: {
      id?: string;
      body?: string;
      from?: string;
    };
  };

  // DEBUG: Log raw incoming data to diagnose field mapping
  console.log(`[${requestId}] 🔍 RAW DATA FIELDS:`, {
    from, fromName, senderJid, pushName, 
    isGroup, chatJid, messageId
  });

  // Prioritize VPS Spec v1.0 field names, fallback to legacy
  const effectiveFrom = senderJid || from;
  const effectiveFromName = pushName || fromName;

  console.log(`[${requestId}] 📍 Effective sender: from="${effectiveFrom}", name="${effectiveFromName}"`);

  // Extract quote data for replies
  const quotedMessageId = quotedMessage?.id || null;
  const quotedMessagePreview = quotedMessage?.body 
    ? quotedMessage.body.substring(0, 100) 
    : null;

  // Merge media sources: prefer top-level media object, fallback to inline ClawdBot format
  let effectiveMedia: MediaData | undefined = media;
  if (!effectiveMedia && media_base64) {
    const binaryData = base64Decode(media_base64);
    effectiveMedia = {
      base64: media_base64,
      mimetype: mediaType || 'image/jpeg',
      filename: media_filename || `image-${Date.now()}.jpg`,
      filesize: binaryData.length,
    };
    console.log(`[${requestId}] ClawdBot inline media detected: ${effectiveMedia.filename} (${effectiveMedia.filesize} bytes)`);
  }

  // Clean body: strip media placeholders like <media:image>, <media:audio>, etc.
  const cleanBody = body?.startsWith('<media:') ? null : body;

  // Determine effective body: use cleaned body, or emoji placeholder for media-only messages
  const effectiveBody = cleanBody || (effectiveMedia ? '📷 Afbeelding' : '');

  if (!messageId || !chatJid || !effectiveFrom || !timestamp) {
    throw new Error(`Missing required message data: messageId=${messageId}, chatJid=${chatJid}, from=${effectiveFrom}, timestamp=${timestamp}`);
  }

  // Detect group chat - either by VPS flag or by JID pattern
  const isGroupChat = isGroup === true || chatJid.includes("@g.us");
  
  console.log(`[${requestId}] Processing ${isGroupChat ? 'group' : 'direct'} message from ${effectiveFrom} in ${chatJid}`);

  // 1. Ensure session exists
  const session = await getOrCreateSession(supabase, sessionId, orgId, requestId);

  // Helper function to normalize phone numbers for comparison
  function normalizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    // Remove + prefix and leading zeros for comparison
    return phone.replace(/^\+/, '').replace(/^0+/, '');
  }

  // Determine if this message is from the session owner (self)
  const normalizedFrom = normalizePhone(effectiveFrom);
  const normalizedSessionPhone = normalizePhone(session.phone_number);
  const isFromSelf = !isGroupChat && normalizedFrom && normalizedSessionPhone && 
                     normalizedFrom === normalizedSessionPhone;

  console.log(`[${requestId}] Message from ${effectiveFrom}, session phone: ${session.phone_number}, isFromSelf: ${isFromSelf}`);

  // 2. Get or create contact (different logic for groups vs direct)
  let contact;
  if (isGroupChat) {
    contact = await getOrCreateGroupContact(supabase, session.id, orgId, chatJid, groupName || effectiveFromName, requestId);
  } else {
    contact = await getOrCreateContact(supabase, session.id, orgId, effectiveFrom, effectiveFromName, requestId);
  }

  // 3. Get or create chat
  const chat = await getOrCreateChat(supabase, session.id, orgId, chatJid, contact.id, isGroupChat, requestId);

  // 4. DEDUPLICATION CHECK: Prevent echo messages from being inserted
  // When a message is sent via the UI, it gets stored with sender_type "user".
  // WhatsApp then echoes this back, which would create a duplicate with sender_type "contact".
  // Check if a similar message was recently sent by the user (within 60 seconds).
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { data: recentDuplicate } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("chat_id", chat.id)
    .eq("message_body", effectiveBody)
    .eq("sender_type", "user")
    .gte("sent_at", oneMinuteAgo)
    .limit(1);

  if (recentDuplicate && recentDuplicate.length > 0) {
    console.log(`[${requestId}] ⚡ Skipping duplicate echo message: "${effectiveBody?.substring(0, 30)}..." (matches recent user message ${recentDuplicate[0].id})`);
    return { messageId: null, chatId: chat.id, contactId: contact.id, duplicate: true, reason: "echo_dedup" };
  }

  // 5. Insert message with correct sender_type based on isFromSelf check
  const { data: message, error: messageError } = await supabase
    .from("whatsapp_messages")
.insert({
      org_id: orgId,
      chat_id: chat.id,
      message_id: messageId,
      message_type: type || "text",
      message_body: effectiveBody,
      sender_type: isFromSelf ? "self" : "contact",
      sender_phone: effectiveFrom,
      sent_at: new Date(timestamp).toISOString(),
      status: isFromSelf ? "sent" : "received",
      // Groepsberichten: sla afzender info op
      sender_jid: isGroupChat ? effectiveFrom : null,
      sender_name: isGroupChat ? (effectiveFromName || null) : null,
      // Quote/Reply: sla referentie en preview op
      quoted_message_id: quotedMessageId,
      quoted_message_preview: quotedMessagePreview,
    })
    .select("id")
    .single();

  if (messageError) {
    // Check for duplicate
    if (messageError.code === "23505") {
      console.log(`[${requestId}] Message already exists: ${messageId}`);
      return { messageId: null, chatId: chat.id, contactId: contact.id, duplicate: true };
    }
    throw messageError;
  }

  // 5. Handle media upload if present (supports both top-level media object and inline ClawdBot format)
  if (effectiveMedia && effectiveMedia.base64) {
    try {
      // New path format: inbound/{safeJid}/{timestamp}_{filename}
      const safeJid = chatJid.replace(/@/g, '-').replace(/\./g, '-');
      const uploadTimestamp = Date.now();
      const storagePath = `inbound/${safeJid}/${uploadTimestamp}_${effectiveMedia.filename}`;
      const fileBuffer = base64Decode(effectiveMedia.base64);

      console.log(`[${requestId}] Uploading media: ${effectiveMedia.filename} (${effectiveMedia.filesize} bytes) to ${storagePath}`);

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, fileBuffer, {
          contentType: effectiveMedia.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error(`[${requestId}] Media upload error:`, uploadError);
      } else {
        const { data: urlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(storagePath);

        // Save to whatsapp_media table
        const { error: mediaDbError } = await supabase.from('whatsapp_media').insert({
          org_id: orgId,
          message_id: message.id,
          file_name: effectiveMedia.filename,
          file_type: type || 'image',
          file_size_bytes: effectiveMedia.filesize,
          mime_type: effectiveMedia.mimetype,
          storage_bucket: 'whatsapp-media',
          storage_path: storagePath,
          storage_url: urlData.publicUrl,
        });

        if (mediaDbError) {
          console.error(`[${requestId}] Media DB error:`, mediaDbError);
        } else {
          console.log(`[${requestId}] ✅ Media stored: ${storagePath}`);
        }
      }
    } catch (mediaErr) {
      console.error(`[${requestId}] Media processing error:`, mediaErr);
    }
  }

  // 6. Update chat with last message info (only increment unread for messages from others)
  if (isFromSelf) {
    // Self-messages: update timestamp and preview only, don't increment unread
    await supabase
      .from("whatsapp_chats")
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: effectiveBody.substring(0, 100) || '📷 Afbeelding',
      })
      .eq("id", chat.id);
  } else {
    // Contact messages: increment unread count
    await supabase
      .from("whatsapp_chats")
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: effectiveBody.substring(0, 100) || '📷 Afbeelding',
        unread_count: chat.unread_count + 1,
      })
      .eq("id", chat.id);
  }

  console.log(`[${requestId}] ✅ Message stored: ${message.id}, sender_type: ${isFromSelf ? 'self' : 'contact'}`);

  return { messageId: message.id, chatId: chat.id, contactId: contact.id };
}

async function handleMessageSent(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  const { messageId, chatJid, body, timestamp, type, to } = data as {
    messageId: string;
    chatJid: string;
    body?: string;
    timestamp: number;
    type?: string;
    to?: string;
  };

  if (!messageId || !chatJid || !timestamp) {
    throw new Error("Missing required message data: messageId, chatJid, timestamp");
  }

  console.log(`[${requestId}] Processing sent message to ${chatJid}`);

  // 1. Ensure session exists
  const session = await getOrCreateSession(supabase, sessionId, orgId, requestId);

  // 2. Get chat (should exist)
  const { data: chat } = await supabase
    .from("whatsapp_chats")
    .select("id")
    .eq("session_id", session.id)
    .eq("chat_jid", chatJid)
    .single();

  if (!chat) {
    throw new Error(`Chat not found for JID: ${chatJid}`);
  }

  // 3. Insert message
  const { data: message, error: messageError } = await supabase
    .from("whatsapp_messages")
    .insert({
      org_id: orgId,
      chat_id: chat.id,
      message_id: messageId,
      message_type: type || "text",
      message_body: body || "",
      sender_type: "user",
      sender_phone: to || null,
      sent_at: new Date(timestamp).toISOString(),
      status: "sent",
    })
    .select("id")
    .single();

  if (messageError) {
    if (messageError.code === "23505") {
      console.log(`[${requestId}] Message already exists: ${messageId}`);
      return { messageId: null, chatId: chat.id, duplicate: true };
    }
    throw messageError;
  }

  // 4. Update chat
  await supabase
    .from("whatsapp_chats")
    .update({
      last_message_at: new Date(timestamp).toISOString(),
      last_message_preview: (body || "").substring(0, 100),
    })
    .eq("id", chat.id);

  console.log(`[${requestId}] ✅ Sent message stored: ${message.id}`);

  return { messageId: message.id, chatId: chat.id };
}

async function handleSessionConnected(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  const { phoneNumber } = data as { phoneNumber?: string };

  console.log(`[${requestId}] Session connected: ${sessionId}, phone: ${phoneNumber || 'unknown'}`);

  // First, check if session with this ID already exists
  const { data: existingById } = await supabase
    .from("whatsapp_sessions")
    .select("id")
    .eq("id", sessionId)
    .single();

  if (existingById) {
    // Update existing session
    const { error: updateError } = await supabase
      .from("whatsapp_sessions")
      .update({
        session_status: "connected",
        phone_number: phoneNumber || "unknown",
        session_data: null,
      })
      .eq("id", sessionId);

    if (updateError) {
      console.error(`[${requestId}] DB error:`, JSON.stringify(updateError));
      throw new Error(`Session update failed: ${formatError(updateError)}`);
    }
    return { sessionId, status: "connected" };
  }

  // If phone_number provided, check for existing session with same phone in this org
  if (phoneNumber && phoneNumber !== "unknown") {
    const { data: existingByPhone } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone_number", phoneNumber)
      .single();

    if (existingByPhone) {
      // Update existing session - change ID to new session ID
      const { error: deleteError } = await supabase
        .from("whatsapp_sessions")
        .delete()
        .eq("id", existingByPhone.id);

      if (deleteError) {
        console.error(`[${requestId}] DB delete error:`, JSON.stringify(deleteError));
      }

      // Insert with new session ID
      const { data: newSession, error: insertError } = await supabase
        .from("whatsapp_sessions")
        .insert({
          id: sessionId,
          org_id: orgId,
          phone_number: phoneNumber,
          session_status: "connected",
          session_data: null,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`[${requestId}] DB error:`, JSON.stringify(insertError));
        throw new Error(`Session creation failed: ${formatError(insertError)}`);
      }
      return { sessionId: newSession.id, status: "connected" };
    }
  }

  // Create new session
  const { data: session, error } = await supabase
    .from("whatsapp_sessions")
    .insert({
      id: sessionId,
      org_id: orgId,
      phone_number: phoneNumber || "unknown",
      session_status: "connected",
      session_data: null,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[${requestId}] DB error:`, JSON.stringify(error));
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }

  return { sessionId: session.id, status: "connected" };
}

async function handleSessionDisconnected(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
): Promise<Record<string, unknown>> {
  console.log(`[${requestId}] Session disconnected: ${sessionId}`);

  const { error } = await supabase
    .from("whatsapp_sessions")
    .update({ session_status: "disconnected" })
    .eq("id", sessionId)
    .eq("org_id", orgId);

  if (error) {
    console.error(`[${requestId}] DB error:`, JSON.stringify(error));
    throw new Error(`Session disconnect failed: ${formatError(error)}`);
  }

  return { sessionId, status: "disconnected" };
}

async function handleSessionQR(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  const { qrCode, phoneNumber } = data as { qrCode?: string; phoneNumber?: string };

  console.log(`[${requestId}] Session QR update: ${sessionId}`);

  // Check if session exists first
  const { data: existing } = await supabase
    .from("whatsapp_sessions")
    .select("id")
    .eq("id", sessionId)
    .single();

  if (existing) {
    // Update existing session
    const { error: updateError } = await supabase
      .from("whatsapp_sessions")
      .update({
        session_status: "waiting_qr",
        session_data: { qrCode },
      })
      .eq("id", sessionId);

    if (updateError) {
      console.error(`[${requestId}] DB error:`, JSON.stringify(updateError));
      throw new Error(`Session QR update failed: ${formatError(updateError)}`);
    }
    return { sessionId, status: "waiting_qr" };
  }

  // Create new session
  const { data: session, error } = await supabase
    .from("whatsapp_sessions")
    .insert({
      id: sessionId,
      org_id: orgId,
      phone_number: phoneNumber || "pending",
      session_status: "waiting_qr",
      session_data: { qrCode },
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[${requestId}] DB error:`, JSON.stringify(error));
    throw new Error(`Session QR creation failed: ${formatError(error)}`);
  }

  return { sessionId: session.id, status: "waiting_qr" };
}

async function handleSendMessage(
  supabase: SupabaseClientAny,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  // Support both formats: mcp-proxy sends 'to' + 'message', legacy uses 'chatJid' + 'body'
  const to = (data.to as string) || (data.chatJid as string);
  const body = (data.body as string) || (data.message as string);
  let chatId = data.chatId as string | undefined;

  if (!to || !body) {
    throw new Error("Missing required fields: to/chatJid, message/body");
  }

  console.log(`[${requestId}] Sending message via Relay to: ${to}, chatId: ${chatId || 'will lookup'}`);

  // Get Relay credentials
  const vpsUrl = Deno.env.get("CLAWDBOT_VPS_URL");
  const token = Deno.env.get("CLAWDBOT_TOKEN");

  if (!vpsUrl || !token) {
    throw new Error("Configuration missing: CLAWDBOT_VPS_URL or CLAWDBOT_TOKEN");
  }

  // If no chatId provided, try to find or create the chat
  if (!chatId) {
    console.log(`[${requestId}] No chatId provided, looking up chat for JID: ${to}`);
    
    // Try to find existing chat by JID
    const { data: existingChat } = await supabase
      .from("whatsapp_chats")
      .select("id, session_id")
      .eq("org_id", orgId)
      .eq("chat_jid", to)
      .is("deleted_at", null)
      .single();

    if (existingChat) {
      chatId = existingChat.id;
      console.log(`[${requestId}] Found existing chat: ${chatId}`);
    } else {
      // Need to create chat - first get or create session
      const session = await getOrCreateSession(supabase, "clawdbot-default", orgId, requestId);
      
      // Extract phone from JID (remove @s.whatsapp.net)
      const phone = to.replace("@s.whatsapp.net", "").replace("@g.us", "");
      
      // Get or create contact
      const contact = await getOrCreateContact(supabase, session.id, orgId, phone, undefined, requestId);
      
      // Get or create chat
      const isGroup = to.includes("@g.us");
      const chat = await getOrCreateChat(supabase, session.id, orgId, to, contact.id, isGroup, requestId);
      chatId = chat.id;
      console.log(`[${requestId}] Created new chat: ${chatId}`);
    }
  }

  // Generate a unique message ID for tracking
  const localMessageId = `sent_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  // Insert message into database BEFORE sending (status: pending)
  const { data: pendingMessage, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      org_id: orgId,
      chat_id: chatId,
      message_id: localMessageId,
      message_type: "text",
      message_body: body,
      sender_type: "user",
      sender_phone: null,
      sent_at: new Date().toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error(`[${requestId}] DB insert error (pending):`, insertError);
    // Continue anyway - message send is more important
  } else {
    console.log(`[${requestId}] Pending message stored: ${pendingMessage.id}`);
  }

  // Update chat with last message info immediately
  await supabase
    .from("whatsapp_chats")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: body.substring(0, 100),
    })
    .eq("id", chatId);

  // Call the Relay Service with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let relayResult: { messageId?: string; id?: string; success?: boolean };
  let relaySent = false;

  try {
    const relayResponse = await fetch(`${vpsUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ to, message: body }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!relayResponse.ok) {
      const errorText = await relayResponse.text();
      console.error(`[${requestId}] Relay error: ${relayResponse.status} - ${errorText}`);
      
      // Update message status to failed
      if (pendingMessage) {
        await supabase
          .from("whatsapp_messages")
          .update({ status: "failed" })
          .eq("id", pendingMessage.id);
      }
      
      throw new Error(`Relay error: ${relayResponse.status} - ${errorText}`);
    }

    relayResult = await relayResponse.json();
    relaySent = true;
    console.log(`[${requestId}] Relay response:`, relayResult);
  } catch (err) {
    clearTimeout(timeoutId);
    
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[${requestId}] Relay timeout after 10s`);
      
      // Update message status to failed
      if (pendingMessage) {
        await supabase
          .from("whatsapp_messages")
          .update({ status: "failed" })
          .eq("id", pendingMessage.id);
      }
      
      throw new Error("Relay timeout - bericht mogelijk niet verzonden");
    }
    throw err;
  }

  // Update message status to sent
  if (pendingMessage) {
    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({ 
        status: "sent",
        message_id: relayResult.messageId || relayResult.id || localMessageId,
      })
      .eq("id", pendingMessage.id);

    if (updateError) {
      console.error(`[${requestId}] DB update error (sent status):`, updateError);
    }
  }

  console.log(`[${requestId}] ✅ Message sent and stored: ${pendingMessage?.id || localMessageId}`);
  return { 
    success: true, 
    sent: relaySent, 
    messageId: pendingMessage?.id,
    localMessageId,
    providerId: relayResult.messageId || relayResult.id || localMessageId,
    chatId,
  };
}

async function handleContactProfilePicture(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  media: MediaData | undefined,
  requestId: string
): Promise<Record<string, unknown>> {
  const { contactJid, phone } = data as {
    contactJid?: string;
    phone: string;
  };

  if (!phone) {
    throw new Error("Missing required data: phone");
  }

  if (!media || !media.base64) {
    throw new Error("Missing required media data");
  }

  console.log(`[${requestId}] Processing profile picture for ${phone}`);

  // 1. Upload image to storage
  const storagePath = `profile-pictures/${orgId}/${phone}.jpg`;
  const fileBuffer = base64Decode(media.base64);

  console.log(`[${requestId}] Uploading profile picture: ${storagePath} (${media.filesize || 'unknown'} bytes)`);

  // Upsert: delete existing file first, then upload new one
  await supabase.storage
    .from('whatsapp-media')
    .remove([storagePath]);

  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(storagePath, fileBuffer, {
      contentType: media.mimetype || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error(`[${requestId}] Profile picture upload error:`, uploadError);
    throw new Error(`Upload failed: ${formatError(uploadError)}`);
  }

  // 2. Generate public URL
  const { data: urlData } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;
  console.log(`[${requestId}] Profile picture URL: ${publicUrl}`);

  // 3. Update contact in database - try multiple phone formats
  const phoneVariants = [
    phone,
    `${phone}@s.whatsapp.net`,
    `+${phone}`,
    phone.replace('@s.whatsapp.net', ''),
  ];

  // Remove duplicates
  const uniquePhones = [...new Set(phoneVariants)];
  console.log(`[${requestId}] Searching contacts with phone variants: ${uniquePhones.join(', ')}`);

  const { data: updatedContacts, error: updateError } = await supabase
    .from('whatsapp_contacts')
    .update({ profile_picture_url: publicUrl })
    .in('phone_number', uniquePhones)
    .eq('org_id', orgId)
    .select('id');

  if (updateError) {
    console.error(`[${requestId}] Contact update error:`, updateError);
    throw new Error(`Contact update failed: ${formatError(updateError)}`);
  }

  if (!updatedContacts || updatedContacts.length === 0) {
    console.log(`[${requestId}] No existing contact found, creating new contact for phone ${phone}`);
    
    // Auto-create contact with minimal data
    const { data: newContact, error: insertError } = await supabase
      .from('whatsapp_contacts')
      .insert({
        org_id: orgId,
        session_id: sessionId,
        phone_number: phone,
        profile_picture_url: publicUrl,
      })
      .select('id')
      .single();
    
    if (insertError) {
      console.warn(`[${requestId}] ⚠️ Could not create contact: ${formatError(insertError)} - photo stored but contact not created`);
      return { success: true, url: publicUrl, contactUpdated: false, contactCreated: false };
    }
    
    console.log(`[${requestId}] ✅ New contact created with profile picture: ${newContact.id}`);
    return { success: true, url: publicUrl, contactUpdated: false, contactCreated: true, contactId: newContact.id };
  }

  console.log(`[${requestId}] ✅ Profile picture updated for ${updatedContacts.length} contact(s)`);

  return { success: true, url: publicUrl, contactUpdated: true, contactCount: updatedContacts.length };
}

async function handleSyncAllProfilePictures(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
): Promise<Record<string, unknown>> {
  console.log(`[${requestId}] Starting profile picture sync for org ${orgId}`);
  
  // 1. Get VPS credentials with fallback
  const vpsUrl = Deno.env.get("WHATSAPP_VPS_URL") || Deno.env.get("CLAWDBOT_VPS_URL");
  const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");
  const vpsSessionId = Deno.env.get("WHATSAPP_VPS_SESSION_ID") || "clawdbot-default";
  
  if (!vpsUrl || !vpsApiKey) {
    throw new Error("VPS credentials not configured (WHATSAPP_VPS_URL/CLAWDBOT_VPS_URL and WHATSAPP_VPS_API_KEY required)");
  }
  
  console.log(`[${requestId}] Using VPS URL: ${vpsUrl}`);
  
  // 2. Get all contacts without profile pictures (filter invalid contacts)
  const { data: contacts, error } = await supabase
    .from('whatsapp_contacts')
    .select('id, phone_number')
    .eq('org_id', orgId)
    .is('profile_picture_url', null)
    .not('phone_number', 'like', 'group-%')  // Skip group contacts
    .neq('phone_number', 'unknown')          // Skip unknown contacts
    .limit(100); // Increased batch limit
  
  if (error) throw error;
  
  if (!contacts || contacts.length === 0) {
    console.log(`[${requestId}] No contacts without profile pictures found`);
    return { synced: 0, message: "No contacts without profile pictures" };
  }
  
  console.log(`[${requestId}] Found ${contacts.length} contacts without profile pictures (excluding groups/unknown)`);
  
  // 3. Process contacts with rate limiting (5 per second)
  const results = { success: 0, failed: 0, skipped: 0 };
  const BATCH_SIZE = 5;
  const DELAY_MS = 1000;
  
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel
    const promises = batch.map(async (contact: { id: string; phone_number: string }) => {
      // Normalize phone number for VPS (ensure JID format)
      let phone = contact.phone_number;
      if (!phone.includes('@')) {
        phone = `${phone}@s.whatsapp.net`;
      }
      
      try {
        const profilePictureEndpoint = `${vpsUrl}/contacts/${encodeURIComponent(phone)}/profile-picture`;
        
        const response = await fetch(profilePictureEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': vpsApiKey!,
          },
          body: JSON.stringify({ sessionId: vpsSessionId }),
        });
        
        if (response.ok) {
          results.success++;
          console.log(`[${requestId}] ✅ Triggered sync for ${contact.phone_number}`);
        } else if (response.status === 404) {
          results.skipped++;
          console.log(`[${requestId}] ⏭️ No profile picture available for ${contact.phone_number}`);
        } else {
          results.failed++;
          console.warn(`[${requestId}] ❌ Failed for ${contact.phone_number}: ${response.status}`);
        }
      } catch (err) {
        results.failed++;
        console.error(`[${requestId}] ❌ Error for ${contact.phone_number}:`, err);
      }
    });
    
    await Promise.all(promises);
    
    // Rate limit delay between batches
    if (i + BATCH_SIZE < contacts.length) {
      console.log(`[${requestId}] Rate limiting: waiting ${DELAY_MS}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  console.log(`[${requestId}] ✅ Profile picture sync completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return { 
    synced: results.success, 
    failed: results.failed, 
    skipped: results.skipped,
    total: contacts.length 
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrCreateSession(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
) {
  // 1. Try exact sessionId match
  const { data: existingById } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("id", sessionId)
    .maybeSingle();

  if (existingById) {
    console.log(`[${requestId}] Found session by ID: ${sessionId}`);
    return existingById;
  }

  // 2. Find ANY existing session for this org (prefer connected, then by updated_at)
  const { data: existingForOrg } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("org_id", orgId)
    .order("session_status", { ascending: false }) // 'connected' before 'disconnected'
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingForOrg) {
    console.log(`[${requestId}] Reusing org session: ${existingForOrg.id} (phone: ${existingForOrg.phone_number})`);
    // Touch session to mark as active
    await supabase
      .from("whatsapp_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", existingForOrg.id);
    return existingForOrg;
  }

  // 3. No session exists at all - safe to create new one
  console.log(`[${requestId}] Creating first session for org: ${orgId}`);
  
  const { data: newSession, error } = await supabase
    .from("whatsapp_sessions")
    .insert({
      id: sessionId,
      org_id: orgId,
      phone_number: "unknown",
      session_status: "connected",
    })
    .select("id, phone_number")
    .single();

  if (error) {
    // Race condition: another request created a session, try to find it
    console.log(`[${requestId}] Insert failed (likely race condition), retrying lookup`);
    
    const { data: raceSession } = await supabase
      .from("whatsapp_sessions")
      .select("id, phone_number")
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();
    
    if (raceSession) {
      return raceSession;
    }
    
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }

  return newSession;
}

async function getOrCreateContact(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  phoneNumber: string,
  displayName: string | undefined,
  requestId: string
) {
  // Normalize the phone number for consistent lookup
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  
  // IMPROVED: Search by org_id + normalized number (not session_id)
  // This prevents duplicates when the same number arrives in different formats
  // We check for both the normalized format and with + prefix
  const { data: existing } = await supabase
    .from("whatsapp_contacts")
    .select("id, display_name, profile_picture_url, phone_number")
    .eq("org_id", orgId)
    .or(`phone_number.eq.${normalizedPhone},phone_number.eq.+${normalizedPhone},phone_number.ilike.%${normalizedPhone.slice(-9)}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(`[${requestId}] Found existing contact by normalized lookup: ${existing.phone_number} → ${normalizedPhone}`);
    
    // Update push_name if provided (but don't overwrite user-edited display_name)
    if (displayName && !existing.display_name) {
      await supabase
        .from("whatsapp_contacts")
        .update({ 
          display_name: displayName,
          push_name: displayName 
        })
        .eq("id", existing.id);
    }
    
    // If the stored number differs from normalized, update it for consistency
    if (existing.phone_number !== normalizedPhone && !existing.phone_number.startsWith('group-')) {
      console.log(`[${requestId}] Updating phone_number format: ${existing.phone_number} → ${normalizedPhone}`);
      await supabase
        .from("whatsapp_contacts")
        .update({ phone_number: normalizedPhone })
        .eq("id", existing.id);
    }
    
    return existing;
  }

  // Create new contact with normalized number
  console.log(`[${requestId}] Creating new contact: ${normalizedPhone} (original: ${phoneNumber})`);
  const { data: newContact, error } = await supabase
    .from("whatsapp_contacts")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      phone_number: normalizedPhone,  // Store as normalized
      whatsapp_jid: `${normalizedPhone}@s.whatsapp.net`,
      display_name: displayName || normalizedPhone,
      push_name: displayName || null,
    })
    .select("id, display_name")
    .single();

  if (error) {
    throw new Error(`Contact creation failed: ${formatError(error)}`);
  }

  // Trigger automatic profile picture sync for new contacts (fire-and-forget)
  if (newContact) {
    console.log(`[${requestId}] 📷 Triggering background profile picture fetch for new contact: ${normalizedPhone}`);
    EdgeRuntime.waitUntil(
      fetchProfilePictureForNewContact(supabase, sessionId, orgId, newContact.id, normalizedPhone, requestId)
    );
  }

  return newContact;
}

// Background task: Fetch profile picture for newly created contact
async function fetchProfilePictureForNewContact(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  contactId: string,
  phoneNumber: string,
  requestId: string
) {
  try {
    // Get VPS relay URL to request profile picture (fallback to CLAWDBOT_VPS_URL)
    const vpsUrl = Deno.env.get("WHATSAPP_VPS_URL") || Deno.env.get("CLAWDBOT_VPS_URL");
    const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");
    
    if (!vpsUrl || !vpsApiKey) {
      console.log(`[${requestId}] 📷 Skipping profile picture fetch - VPS not configured (checked WHATSAPP_VPS_URL, CLAWDBOT_VPS_URL)`);
      return;
    }

    const jid = `${phoneNumber}@s.whatsapp.net`;
    
    // Request profile picture from VPS
    const response = await fetch(`${vpsUrl}/api/sessions/${sessionId}/profile-picture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': vpsApiKey,
      },
      body: JSON.stringify({ jid }),
    });

    if (!response.ok) {
      console.log(`[${requestId}] 📷 VPS profile picture request failed: ${response.status}`);
      return;
    }

    const data = await response.json();
    
    if (data.profilePictureUrl) {
      await supabase
        .from("whatsapp_contacts")
        .update({ profile_picture_url: data.profilePictureUrl })
        .eq("id", contactId);
      
      console.log(`[${requestId}] 📷 Profile picture updated for contact ${contactId}`);
    } else {
      console.log(`[${requestId}] 📷 No profile picture available for ${phoneNumber}`);
    }
  } catch (err) {
    console.error(`[${requestId}] 📷 Background profile picture fetch error:`, formatError(err));
  }
}

// Get or create a GROUP contact (different from regular contacts)
async function getOrCreateGroupContact(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  chatJid: string,
  groupName: string | undefined,
  requestId: string
) {
  // For groups, search by whatsapp_jid (the group JID)
  const { data: existing } = await supabase
    .from("whatsapp_contacts")
    .select("id, display_name")
    .eq("session_id", sessionId)
    .eq("whatsapp_jid", chatJid)
    .maybeSingle();

  if (existing) {
    // Update group name if provided and different
    if (groupName && groupName !== existing.display_name) {
      await supabase
        .from("whatsapp_contacts")
        .update({ 
          display_name: groupName,
          push_name: groupName 
        })
        .eq("id", existing.id);
    }
    return existing;
  }

  // Create new group contact
  const groupId = chatJid.split("@")[0];
  const displayName = groupName || `Groep ${groupId.slice(-6)}`;
  
  console.log(`[${requestId}] Creating group contact: ${chatJid} -> ${displayName}`);
  
  const { data: newContact, error } = await supabase
    .from("whatsapp_contacts")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      whatsapp_jid: chatJid,
      phone_number: `group-${groupId}`,
      display_name: displayName,
      push_name: groupName || null,
    })
    .select("id, display_name")
    .single();

  if (error) {
    throw new Error(`Group contact creation failed: ${formatError(error)}`);
  }
  return newContact;
}

async function getOrCreateChat(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  chatJid: string,
  contactId: string,
  isGroupChat: boolean,
  requestId: string
) {
  // VERBETERD: Zoek op org_id + contact_id (niet session_id)
  // Dit voorkomt duplicate chats bij sessie-wissels
  const { data: existingByContact } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count, chat_jid, session_id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingByContact) {
    let needsUpdate = false;
    const updates: Record<string, string> = {};

    // Migreer naar huidige sessie als nodig
    if (existingByContact.session_id !== sessionId) {
      console.log(`[${requestId}] ⚡ Migrating chat from session ${existingByContact.session_id} to ${sessionId}`);
      updates.session_id = sessionId;
      needsUpdate = true;
    }

    // Update chat_jid als het verandert (bijv. LID → JID)
    if (existingByContact.chat_jid !== chatJid) {
      console.log(`[${requestId}] ⚡ Updating chat_jid from ${existingByContact.chat_jid} to ${chatJid}`);
      updates.chat_jid = chatJid;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await supabase
        .from("whatsapp_chats")
        .update(updates)
        .eq("id", existingByContact.id);
    }

    return existingByContact;
  }

  // Fallback: zoek op exacte JID binnen org (voor groepschats of chats zonder contact)
  const { data: existingByJid } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count, session_id")
    .eq("org_id", orgId)
    .eq("chat_jid", chatJid)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingByJid) {
    // Migreer naar huidige sessie
    if (existingByJid.session_id !== sessionId) {
      await supabase
        .from("whatsapp_chats")
        .update({ session_id: sessionId })
        .eq("id", existingByJid.id);
    }
    return existingByJid;
  }

  // Nieuwe chat aanmaken
  console.log(`[${requestId}] Creating new ${isGroupChat ? 'group' : 'direct'} chat: ${chatJid}`);
  const { data: newChat, error } = await supabase
    .from("whatsapp_chats")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      contact_id: contactId,
      chat_jid: chatJid,
      chat_type: isGroupChat ? "group" : "direct",
      unread_count: 0,
    })
    .select("id, unread_count")
    .single();

  if (error) {
    throw new Error(`Chat creation failed: ${formatError(error)}`);
  }
  return newChat;
}

// ============================================================================
// MESSAGE ACK HANDLER - Read Receipts
// ============================================================================

async function handleMessageAck(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  const { messageId, ack, chatJid } = data as {
    messageId: string;
    ack: number; // 1=sent, 2=delivered, 3=read, 4=played (for audio)
    chatJid?: string;
  };

  if (!messageId) {
    console.log(`[${requestId}] Missing messageId for ack event`);
    return { updated: false, reason: "missing_messageId" };
  }

  // Map WhatsApp ack values to our status enum
  // 1 = sent (message sent to server)
  // 2 = delivered (message delivered to recipient's device)
  // 3 = read (message read by recipient)
  // 4 = played (audio message played)
  let newStatus: string;
  switch (ack) {
    case 1:
      newStatus = "sent";
      break;
    case 2:
      newStatus = "delivered";
      break;
    case 3:
    case 4:
      newStatus = "read";
      break;
    default:
      console.log(`[${requestId}] Unknown ack value: ${ack}`);
      return { updated: false, reason: "unknown_ack" };
  }

  console.log(`[${requestId}] Updating message status: ${messageId} -> ${newStatus}`);

  // Update the message status in the database
  const { data: updated, error } = await supabase
    .from("whatsapp_messages")
    .update({ status: newStatus })
    .eq("message_id", messageId)
    .eq("org_id", orgId)
    .select("id, status")
    .single();

  if (error) {
    // Message might not exist yet or already has higher status
    console.log(`[${requestId}] Ack update skipped: ${error.message}`);
    return { updated: false, reason: error.message };
  }

  console.log(`[${requestId}] ✅ Message ${messageId} status updated to ${newStatus}`);
  return { updated: true, messageId: updated.id, status: newStatus };
}

// ============================================================================
// TYPING EVENT HANDLER
// ============================================================================

async function handleTypingEvent(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  const { chatJid, from, fromName, isTyping } = data as {
    chatJid: string;
    from: string;
    fromName?: string;
    isTyping: boolean;
  };

  if (!chatJid || !from) {
    console.log(`[${requestId}] Missing chatJid or from for typing event`);
    return { broadcast: false, reason: "missing_fields" };
  }

  // Find the chat for this JID
  const { data: chat } = await supabase
    .from("whatsapp_chats")
    .select("id")
    .eq("chat_jid", chatJid)
    .eq("org_id", orgId)
    .single();

  if (!chat) {
    console.log(`[${requestId}] Chat not found for typing event: ${chatJid}`);
    return { broadcast: false, reason: "chat_not_found" };
  }

  // Broadcast typing status via Supabase Realtime
  // The frontend listens on channel `typing:{chatId}`
  const channel = supabase.channel(`typing:${chat.id}`);
  await channel.send({
    type: "broadcast",
    event: "typing",
    payload: {
      contactName: fromName || from,
      isTyping: isTyping !== false, // Default to true if not specified
    },
  });
  await supabase.removeChannel(channel);

  console.log(`[${requestId}] ✅ Typing event broadcast for chat ${chat.id}: ${isTyping ? 'typing' : 'stopped'}`);
  return { broadcast: true, chatId: chat.id };
}
