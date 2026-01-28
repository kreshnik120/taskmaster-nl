import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WhatsAppEvent {
  event: string;
  sessionId: string;
  orgId: string;
  data: Record<string, unknown>;
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
    const { event, sessionId, orgId, data } = body;

    console.log(`[${requestId}] Event: ${event}, Session: ${sessionId}, Org: ${orgId}`);

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
        result = await handleMessageReceived(supabase, sessionId, orgId, data, requestId);
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
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[${requestId}] ❌ Error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
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

  // 5. Update chat with last message info
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

  console.log(`[${requestId}] Session connected: ${sessionId}`);

  const { data: session, error } = await supabase
    .from("whatsapp_sessions")
    .upsert({
      id: sessionId,
      org_id: orgId,
      phone_number: phoneNumber || "unknown",
      session_status: "connected",
      session_data: null,
    }, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    console.error(`[${requestId}] DB error:`, JSON.stringify(error));
    throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
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
    throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
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

  const { data: session, error } = await supabase
    .from("whatsapp_sessions")
    .upsert({
      id: sessionId,
      org_id: orgId,
      phone_number: phoneNumber || "pending",
      session_status: "waiting_qr",
      session_data: { qrCode },
    }, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    console.error(`[${requestId}] DB error:`, JSON.stringify(error));
    throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrCreateSession(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
) {
  // Try to find existing session
  const { data: existing } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("id", sessionId)
    .single();

  if (existing) return existing;

  // Create new session
  console.log(`[${requestId}] Creating new session: ${sessionId}`);
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

  if (error) throw error;
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

  if (error) throw error;
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

  if (error) throw error;
  return newChat;
}
