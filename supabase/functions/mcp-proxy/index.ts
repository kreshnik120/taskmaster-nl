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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[mcp-proxy] Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", message: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Parse request body
    let body: { tool?: string; action?: string; arguments?: Record<string, unknown>; params?: Record<string, unknown> };
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

    // ==========================================
    // MODE 1: UI → MCP (existing functionality)
    // ==========================================
    if (isUiMode) {
      return handleUiMode(req, token, body as { tool: string; arguments?: Record<string, unknown> });
    }

    // ==========================================
    // MODE 2: MCP → Database (new functionality)
    // ==========================================
    if (isMcpMode) {
      return handleMcpMode(token, body as { action: string; params?: Record<string, unknown> });
    }

    return new Response(
      JSON.stringify({ success: false, error: "Bad request", message: "Invalid request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

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

  // Forward to MCP server for actual WhatsApp delivery
  const mcpApiKey = Deno.env.get("MCP_API_KEY")!;
  
  const mcpResponse = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mcpApiKey}`,
    },
    body: JSON.stringify({ 
      tool: "whatsapp_send_message", 
      arguments: { to, message } 
    }),
  });

  if (!mcpResponse.ok) {
    const errorText = await mcpResponse.text();
    console.error(`[mcp-proxy] send_message MCP error: ${mcpResponse.status} - ${errorText}`);
    return new Response(
      JSON.stringify({ success: false, error: "Send failed", message: errorText }),
      { status: mcpResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const result = await mcpResponse.json();
  console.log(`[mcp-proxy] send_message success: to=${to}`);

  return new Response(
    JSON.stringify({ success: true, data: result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
