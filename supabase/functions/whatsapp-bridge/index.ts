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
    const expectedKey = Deno.env.get("WHATSAPP_BRIDGE_API_KEY");
    const authHeader = req.headers.get("Authorization");

    const isValidApiKey = apiKey && apiKey === expectedKey;
    const isValidAuth = authHeader && authHeader.startsWith("Bearer ");

    if (!isValidApiKey && !isValidAuth) {
      console.error(`[${requestId}] ❌ No valid authentication provided`);
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
  const { messageId, chatJid, from, fromName, body, timestamp, type } = data as {
    messageId: string;
    chatJid: string;
    from: string;
    fromName?: string;
    body?: string;
    timestamp: number;
    type?: string;
  };

  if (!messageId || !chatJid || !from || !timestamp) {
    throw new Error("Missing required message data: messageId, chatJid, from, timestamp");
  }

  console.log(`[${requestId}] Processing message from ${from}`);

  // 1. Ensure session exists
  const session = await getOrCreateSession(supabase, sessionId, orgId, requestId);

  // 2. Get or create contact
  const contact = await getOrCreateContact(supabase, session.id, orgId, from, fromName, requestId);

  // 3. Get or create chat
  const chat = await getOrCreateChat(supabase, session.id, orgId, chatJid, contact.id, requestId);

  // 4. Insert message
  const { data: message, error: messageError } = await supabase
    .from("whatsapp_messages")
    .insert({
      org_id: orgId,
      chat_id: chat.id,
      message_id: messageId,
      message_type: type || "text",
      message_body: body || "",
      sender_type: "contact",
      sender_phone: from,
      sent_at: new Date(timestamp).toISOString(),
      status: "received",
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

  // 5. Handle media upload if present
  if (media && media.base64) {
    try {
      const storagePath = `${orgId}/${sessionId}/${messageId}/${media.filename}`;
      const fileBuffer = base64Decode(media.base64);

      console.log(`[${requestId}] Uploading media: ${media.filename} (${media.filesize} bytes)`);

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, fileBuffer, {
          contentType: media.mimetype,
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
          file_name: media.filename,
          file_type: type || 'image',
          file_size_bytes: media.filesize,
          mime_type: media.mimetype,
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

  // 6. Update chat with last message info
  await supabase
    .from("whatsapp_chats")
    .update({
      last_message_at: new Date(timestamp).toISOString(),
      last_message_preview: (body || "").substring(0, 100),
      unread_count: chat.unread_count + 1,
    })
    .eq("id", chat.id);

  console.log(`[${requestId}] ✅ Message stored: ${message.id}`);

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
  const { chatJid, body, chatId } = data as {
    chatJid: string;
    body: string;
    chatId: string;
  };

  if (!chatJid || !body || !chatId) {
    throw new Error("Missing required data: chatJid, body, chatId");
  }

  console.log(`[${requestId}] Sending message to ${chatJid}`);

  // Get VPS credentials from secrets
  const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");
  const vpsSessionId = Deno.env.get("WHATSAPP_VPS_SESSION_ID");

  if (!vpsApiKey || !vpsSessionId) {
    throw new Error("VPS credentials not configured");
  }

  // Send to VPS
  const vpsUrl = `http://72.61.155.82:3001/chats/${encodeURIComponent(chatJid)}/messages`;
  
  console.log(`[${requestId}] Calling VPS: ${vpsUrl}`);
  
  const vpsResponse = await fetch(vpsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": vpsApiKey,
    },
    body: JSON.stringify({
      sessionId: vpsSessionId,
      text: body,
    }),
  });

  if (!vpsResponse.ok) {
    const errorText = await vpsResponse.text();
    console.error(`[${requestId}] VPS error: ${vpsResponse.status} - ${errorText}`);
    throw new Error(`VPS error: ${vpsResponse.status}`);
  }

  const vpsResult = await vpsResponse.json();
  console.log(`[${requestId}] VPS response:`, vpsResult);

  const messageId = vpsResult.messageId || vpsResult.id || crypto.randomUUID();

  // Store sent message in database
  const { data: message, error: messageError } = await supabase
    .from("whatsapp_messages")
    .insert({
      org_id: orgId,
      chat_id: chatId,
      message_id: messageId,
      message_type: "text",
      message_body: body,
      sender_type: "self",
      sender_phone: null,
      sent_at: new Date().toISOString(),
      status: "sent",
    })
    .select("id")
    .single();

  if (messageError) {
    console.error(`[${requestId}] DB insert error:`, messageError);
    throw messageError;
  }

  // Update chat with last message info
  await supabase
    .from("whatsapp_chats")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: body.substring(0, 100),
    })
    .eq("id", chatId);

  console.log(`[${requestId}] ✅ Message sent and stored: ${message.id}`);

  return { messageId: message.id, vpsMessageId: messageId };
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
  
  // 1. Get VPS credentials
  const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");
  const vpsSessionId = Deno.env.get("WHATSAPP_VPS_SESSION_ID");
  
  if (!vpsApiKey || !vpsSessionId) {
    throw new Error("VPS credentials not configured");
  }
  
  // 2. Get all contacts without profile pictures
  const { data: contacts, error } = await supabase
    .from('whatsapp_contacts')
    .select('id, phone_number')
    .eq('org_id', orgId)
    .is('profile_picture_url', null)
    .limit(50); // Batch limit to prevent timeouts
  
  if (error) throw error;
  
  if (!contacts || contacts.length === 0) {
    console.log(`[${requestId}] No contacts without profile pictures found`);
    return { synced: 0, message: "No contacts without profile pictures" };
  }
  
  console.log(`[${requestId}] Found ${contacts.length} contacts without profile pictures`);
  
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
        const vpsUrl = `http://72.61.155.82:3001/contacts/${encodeURIComponent(phone)}/profile-picture`;
        
        const response = await fetch(vpsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': vpsApiKey,
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
  // Try to find existing contact
  const { data: existing } = await supabase
    .from("whatsapp_contacts")
    .select("id, display_name")
    .eq("session_id", sessionId)
    .eq("phone_number", phoneNumber)
    .single();

  if (existing) {
    // Update display name if provided and different
    if (displayName && displayName !== existing.display_name) {
      await supabase
        .from("whatsapp_contacts")
        .update({ display_name: displayName })
        .eq("id", existing.id);
    }
    return existing;
  }

  // Create new contact
  console.log(`[${requestId}] Creating new contact: ${phoneNumber}`);
  const { data: newContact, error } = await supabase
    .from("whatsapp_contacts")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      phone_number: phoneNumber,
      display_name: displayName || phoneNumber,
    })
    .select("id, display_name")
    .single();

  if (error) {
    throw new Error(`Contact creation failed: ${formatError(error)}`);
  }
  return newContact;
}

async function getOrCreateChat(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  chatJid: string,
  contactId: string,
  requestId: string
) {
  // Try to find existing chat
  const { data: existing } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count")
    .eq("session_id", sessionId)
    .eq("chat_jid", chatJid)
    .single();

  if (existing) return existing;

  // Create new chat
  console.log(`[${requestId}] Creating new chat: ${chatJid}`);
  const { data: newChat, error } = await supabase
    .from("whatsapp_chats")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      contact_id: contactId,
      chat_jid: chatJid,
      chat_type: chatJid.includes("@g.us") ? "group" : "direct",
      unread_count: 0,
    })
    .select("id, unread_count")
    .single();

  if (error) {
    throw new Error(`Chat creation failed: ${formatError(error)}`);
  }
  return newChat;
}
