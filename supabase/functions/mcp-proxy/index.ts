import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_TOOLS = [
  "whatsapp_get_chats",
  "whatsapp_send_message",
  "supabase_query",
  "get_tasks",
  "add_task",
  "complete_task"
];

const MCP_ENDPOINT = "https://mcp.abcito.io/call";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify Authorization header exists
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[mcp-proxy] Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify the JWT token using Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error("[mcp-proxy] JWT verification failed:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    console.log(`[mcp-proxy] Authenticated user: ${userId}`);

    // 3. Get MCP API key from secrets
    const mcpApiKey = Deno.env.get("MCP_API_KEY");
    if (!mcpApiKey) {
      console.error("[mcp-proxy] MCP_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Configuration error", message: "MCP not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Parse request body
    let body: { tool: string; arguments?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Bad request", message: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tool, arguments: toolArgs = {} } = body;

    // 5. Validate tool is in whitelist
    if (!tool || !VALID_TOOLS.includes(tool)) {
      console.error(`[mcp-proxy] Invalid tool requested: ${tool}`);
      return new Response(
        JSON.stringify({ 
          error: "Bad request", 
          message: `Invalid tool: ${tool}. Valid tools: ${VALID_TOOLS.join(", ")}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Forward to MCP server
    console.log(`[mcp-proxy] Calling tool: ${tool}`, JSON.stringify(toolArgs));
    
    const mcpResponse = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mcpApiKey}`,
      },
      body: JSON.stringify({ tool, arguments: toolArgs }),
    });

    // 7. Handle MCP server errors
    if (!mcpResponse.ok) {
      const errorText = await mcpResponse.text();
      console.error(`[mcp-proxy] MCP error: ${mcpResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({
          error: "MCP server error",
          status: mcpResponse.status,
          details: errorText,
        }),
        { status: mcpResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Return successful response
    const mcpData = await mcpResponse.json();
    console.log(`[mcp-proxy] Success: tool=${tool}, status=${mcpResponse.status}`);
    
    return new Response(
      JSON.stringify(mcpData),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[mcp-proxy] Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
