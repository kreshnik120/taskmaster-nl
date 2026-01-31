import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// UI Mode: Tools that forward to mcp.abcito.io
const VALID_TOOLS = [
  "whatsapp_get_chats",
  "whatsapp_send_message",
  "supabase_query",
  "get_tasks",
  "add_task",
  "complete_task"
];

// MCP Mode: Actions for direct database access
const VALID_ACTIONS = [
  "get_chats",
  "get_messages",
  "send_message"
];

const MCP_ENDPOINT = "https://mcp.abcito.io/call";
const WHATSAPP_BRIDGE_URL = "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body first
    let body: { tool?: string; action?: string; arguments?: Record<string, unknown>; params?: Record<string, unknown>; api_key?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Bad request", message: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine mode based on body content
    const isUiMode = !!body.tool;
    const isMcpMode = !!body.action;

    if (!isUiMode && !isMcpMode) {
      return new Response(
        JSON.stringify({ success: false, error: "Bad request", message: "Must provide either 'tool' (UI mode) or 'action' (MCP mode)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth token - for MCP mode, check X-API-Key header OR body.api_key
    // For UI mode, use standard Authorization header
    const authHeader = req.headers.get("Authorization");
    const xApiKey = req.headers.get("X-API-Key");
    
    // MCP mode can use X-API-Key header or api_key in body
    if (isMcpMode) {
      const mcpApiKey = xApiKey || body.api_key;
      if (!mcpApiKey) {
        console.error("[mcp-proxy] MCP Mode - Missing API key (use X-API-Key header or api_key in body)");
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized", message: "Missing API key. Use X-API-Key header or api_key in body." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return handleMcpMode(mcpApiKey, body as { action: string; params?: Record<string, unknown> });
    }

    // UI mode requires Authorization header
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[mcp-proxy] Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", message: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // ==========================================
    // MODE 1: UI → MCP (existing functionality)
    // ==========================================
    return handleUiMode(req, token, body as { tool: string; arguments?: Record<string, unknown> });

  } catch (error) {
    console.error("[mcp-proxy] Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Internal server error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ==========================================
// UI Mode Handler - Forward to mcp.abcito.io
// ==========================================
async function handleUiMode(
  req: Request, 
  token: string, 
  body: { tool: string; arguments?: Record<string, unknown> }
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !userData?.user) {
    console.error("[mcp-proxy] JWT verification failed:", userError?.message);
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[mcp-proxy] UI Mode - User: ${userData.user.id}, Tool: ${body.tool}`);

  const mcpApiKey = Deno.env.get("MCP_API_KEY");
  if (!mcpApiKey) {
    console.error("[mcp-proxy] MCP_API_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Configuration error", message: "MCP not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { tool, arguments: toolArgs = {} } = body;

  if (!VALID_TOOLS.includes(tool)) {
    console.error(`[mcp-proxy] Invalid tool requested: ${tool}`);
    return new Response(
      JSON.stringify({ 
        error: "Bad request", 
        message: `Invalid tool: ${tool}. Valid tools: ${VALID_TOOLS.join(", ")}` 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Special routing for whatsapp_get_chats - serve from local database
  if (tool === "whatsapp_get_chats") {
    console.log(`[mcp-proxy] Routing whatsapp_get_chats to local database`);
    
    // Get user's orgs for authorization
    const { data: userOrgs, error: orgsError } = await supabase
      .from("user_organizations")
      .select("organization_id");
    
    if (orgsError) {
      console.error("[mcp-proxy] Error fetching user orgs:", orgsError);
      return new Response(
        JSON.stringify({ error: "Authorization error", message: "Could not fetch user organizations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgIds = userOrgs?.map((uo: { organization_id: string }) => uo.organization_id) || [];
    
    if (orgIds.length === 0) {
      console.log(`[mcp-proxy] User has no organizations, returning empty chats`);
      return new Response(
        JSON.stringify({ result: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query chats from database using service role for elevated access
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const limit = Math.min(Number(toolArgs.limit) || 100, 200);
    const offset = Number(toolArgs.offset) || 0;
    const unreadOnly = Boolean(toolArgs.unread_only);

    let query = adminClient
      .from("whatsapp_chats")
      .select(`
        *,
        contact:whatsapp_contacts!contact_id (
          id,
          phone_number,
          display_name,
          push_name,
          profile_picture_url,
          tags,
          contact_notes,
          is_business_account
        ),
        linked_professional:professionals!linked_professional_id (
          id,
          full_name
        )
      `)
      .in("org_id", orgIds)
      .is("deleted_at", null)
      .is("is_archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.gt("unread_count", 0);
    }

    const { data: chats, error: chatsError } = await query;

    if (chatsError) {
      console.error("[mcp-proxy] Error fetching chats from DB:", chatsError);
      return new Response(
        JSON.stringify({ error: "Database error", message: chatsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[mcp-proxy] whatsapp_get_chats success: ${chats?.length || 0} chats from DB`);
    
    return new Response(
      JSON.stringify({ result: chats || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Special routing for whatsapp_send_message - direct to whatsapp-bridge
  if (tool === "whatsapp_send_message") {
    const bridgeApiKey = Deno.env.get("WHATSAPP_BRIDGE_API_KEY_V2") ?? "";
    
    if (!bridgeApiKey) {
      console.error("[mcp-proxy] WHATSAPP_BRIDGE_API_KEY_V2 not configured");
      return new Response(
        JSON.stringify({ error: "Configuration error", message: "WhatsApp Bridge not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // chatId is required for proper DB persistence
    const chatId = toolArgs.chatId as string | undefined;
    
    console.log(`[mcp-proxy] Routing whatsapp_send_message directly to bridge: to=${toolArgs.to}, chatId=${chatId || 'none'}`);
    
    // Use AbortController for timeout (12s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const bridgeResponse = await fetch(WHATSAPP_BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": bridgeApiKey,
        },
        body: JSON.stringify({
          event: "message.send",
          sessionId: "clawdbot-default",
          orgId: "550e8400-e29b-41d4-a716-446655440000",
          data: {
            to: toolArgs.to,
            body: toolArgs.message,
            chatId: chatId,
          }
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!bridgeResponse.ok) {
        const errorText = await bridgeResponse.text();
        console.error(`[mcp-proxy] WhatsApp Bridge error: ${bridgeResponse.status} - ${errorText}`);
        return new Response(
          JSON.stringify({ error: "WhatsApp Bridge error", status: bridgeResponse.status, details: errorText }),
          { status: bridgeResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bridgeData = await bridgeResponse.json();
      console.log(`[mcp-proxy] whatsapp_send_message success via bridge`);
      
      return new Response(
        JSON.stringify({ result: bridgeData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[mcp-proxy] WhatsApp Bridge timeout after 12s`);
        return new Response(
          JSON.stringify({ error: "Timeout", message: "WhatsApp relay niet bereikbaar (timeout na 12s)" }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw err;
    }
  }

  // Default: forward to MCP server for other tools
  console.log(`[mcp-proxy] Forwarding to MCP: ${tool}`, JSON.stringify(toolArgs));
  
  const mcpResponse = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mcpApiKey}`,
    },
    body: JSON.stringify({ tool, arguments: toolArgs }),
  });

  if (!mcpResponse.ok) {
    const errorText = await mcpResponse.text();
    console.error(`[mcp-proxy] MCP error: ${mcpResponse.status} - ${errorText}`);
    return new Response(
      JSON.stringify({ error: "MCP server error", status: mcpResponse.status, details: errorText }),
      { status: mcpResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mcpData = await mcpResponse.json();
  console.log(`[mcp-proxy] UI Mode success: tool=${tool}`);
  
  return new Response(
    JSON.stringify(mcpData),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ==========================================
// MCP Mode Handler - Query local database
// ==========================================
async function handleMcpMode(
  apiKey: string, 
  body: { action: string; params?: Record<string, unknown> }
): Promise<Response> {
  // Validate MCP_API_KEY
  const expectedApiKey = Deno.env.get("MCP_API_KEY");
  console.log(`[mcp-proxy] MCP Mode - Comparing keys: received=${apiKey.substring(0,8)}..., expected=${expectedApiKey?.substring(0,8) || 'NOT_SET'}...`);
  if (!expectedApiKey || apiKey !== expectedApiKey) {
    console.error("[mcp-proxy] MCP Mode - Invalid API key");
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized", message: "Invalid API key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { action, params = {} } = body;

  if (!VALID_ACTIONS.includes(action)) {
    console.error(`[mcp-proxy] Invalid action: ${action}`);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Bad request", 
        message: `Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(", ")}` 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[mcp-proxy] MCP Mode - Action: ${action}`, JSON.stringify(params));

  // Create admin client with service role key (bypasses RLS)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (action) {
      case "get_chats":
        return await handleGetChats(adminClient, params);
      case "get_messages":
        return await handleGetMessages(adminClient, params);
      case "send_message":
        return await handleSendMessage(adminClient, params);
      default:
        return new Response(
          JSON.stringify({ success: false, error: "Not implemented", message: `Action ${action} not implemented` }),
          { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error(`[mcp-proxy] Action ${action} failed:`, error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Database error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ==========================================
// Action Handlers
// ==========================================

// deno-lint-ignore no-explicit-any
async function handleGetChats(
  client: any, 
  params: Record<string, unknown>
): Promise<Response> {
  const limit = Math.min(Number(params.limit) || 50, 100);
  const offset = Number(params.offset) || 0;
  const unreadOnly = Boolean(params.unread_only);

  let query = client
    .from("whatsapp_chats")
    .select(`
      *,
      contact:whatsapp_contacts!contact_id (
        id,
        phone_number,
        display_name,
        push_name,
        profile_picture_url,
        tags,
        is_business_account
      )
    `)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.gt("unread_count", 0);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[mcp-proxy] get_chats error:", error);
    throw error;
  }

  console.log(`[mcp-proxy] get_chats success: ${data?.length || 0} chats`);

  return new Response(
    JSON.stringify({
      success: true,
      data: data || [],
      meta: { count: data?.length || 0, limit, offset }
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetMessages(
  client: any, 
  params: Record<string, unknown>
): Promise<Response> {
  const chatId = params.chat_id as string;
  if (!chatId) {
    return new Response(
      JSON.stringify({ success: false, error: "Bad request", message: "chat_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const limit = Math.min(Number(params.limit) || 50, 100);
  const offset = Number(params.offset) || 0;

  const { data, error } = await client
    .from("whatsapp_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[mcp-proxy] get_messages error:", error);
    throw error;
  }

  console.log(`[mcp-proxy] get_messages success: ${data?.length || 0} messages for chat ${chatId}`);

  return new Response(
    JSON.stringify({
      success: true,
      data: data || [],
      meta: { count: data?.length || 0, limit, offset, chat_id: chatId }
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleSendMessage(
  _client: any, 
  params: Record<string, unknown>
): Promise<Response> {
  const to = params.to as string;
  const message = params.message as string;

  if (!to || !message) {
    return new Response(
      JSON.stringify({ success: false, error: "Bad request", message: "'to' and 'message' are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Forward to WhatsApp Bridge for actual delivery (direct route, bypasses MCP server)
  const bridgeApiKey = Deno.env.get("WHATSAPP_BRIDGE_API_KEY_V2") ?? "";

  if (!bridgeApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Configuration error", message: "WhatsApp Bridge not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const bridgeResponse = await fetch(WHATSAPP_BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": bridgeApiKey,
    },
    body: JSON.stringify({
      event: "message.send",
      sessionId: "clawdbot-default",
      orgId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        to,
        body: message,
      }
    }),
  });

  if (!bridgeResponse.ok) {
    const errorText = await bridgeResponse.text();
    console.error(`[mcp-proxy] send_message bridge error: ${bridgeResponse.status} - ${errorText}`);
    return new Response(
      JSON.stringify({ success: false, error: "Send failed", message: errorText }),
      { status: bridgeResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const result = await bridgeResponse.json();
  console.log(`[mcp-proxy] send_message success via bridge: to=${to}`);

  return new Response(
    JSON.stringify({ success: true, data: result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
