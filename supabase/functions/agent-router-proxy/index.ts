import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// VPS Agent Router configuration
const VPS_BASE_URL = Deno.env.get("CLAWDBOT_VPS_URL") || "http://srv1304497.hstgr.cloud:3002";
const VPS_API_KEY = Deno.env.get("MCP_API_KEY") || Deno.env.get("CLAWDBOT_TOKEN") || "";
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Rate limiting: in-memory store (resets on function restart)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

interface AgentRequest {
  intent: string;
  payload?: Record<string, unknown>;
  page_context?: string;
  message?: string;
}

interface AgentResponse {
  success: boolean;
  agent?: string;
  action_taken?: string;
  result?: Record<string, unknown>;
  suggestions?: string[];
  execution_id?: string;
  error?: string;
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(userId);

  // Cleanup old records
  if (rateLimitStore.size > 1000) {
    for (const [id, rec] of rateLimitStore.entries()) {
      if (rec.resetAt < now) rateLimitStore.delete(id);
    }
  }

  if (!record || now > record.resetAt) {
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    console.warn(`⚠️ Rate limit exceeded for user: ${userId}`);
    return false;
  }

  record.count++;
  return true;
}

async function callVPSAgentRouter(
  intent: string,
  payload: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<AgentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    console.log(`🤖 Calling VPS Agent Router: intent=${intent}`);
    
    const response = await fetch(`${VPS_BASE_URL}/api/v1/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY,
      },
      body: JSON.stringify({
        intent,
        payload,
        context,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ VPS error: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `Agent Router error: ${response.status}`,
      };
    }

    const data = await response.json();
    console.log(`✅ VPS response:`, JSON.stringify(data).slice(0, 200));
    
    return {
      success: true,
      agent: data.agent,
      action_taken: data.action_taken,
      result: data.result,
      suggestions: data.next_actions?.map((a: { label: string }) => a.label) || [],
      execution_id: data.execution_id,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === "AbortError") {
      console.error("❌ VPS request timeout");
      return { success: false, error: "Request timeout - agent took too long" };
    }
    
    console.error("❌ VPS connection error:", error);
    return { success: false, error: "Could not connect to Agent Router" };
  }
}

async function submitFeedback(
  executionId: string,
  rating: "positive" | "negative" | "correction",
  correctionData?: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch(`${VPS_BASE_URL}/api/v1/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY,
      },
      body: JSON.stringify({
        execution_id: executionId,
        rating,
        correction_data: correctionData,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("❌ Feedback submission failed:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Health check
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "true") {
    return new Response(JSON.stringify({ status: "ok", vps_url: VPS_BASE_URL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Max 10 requests per minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: AgentRequest & { action?: string; execution_id?: string; rating?: string; correction_data?: Record<string, unknown> } = await req.json();

    // Handle feedback submission
    if (body.action === "feedback" && body.execution_id && body.rating) {
      const success = await submitFeedback(
        body.execution_id,
        body.rating as "positive" | "negative" | "correction",
        body.correction_data
      );
      return new Response(JSON.stringify({ success }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate intent execution request
    if (!body.intent && !body.message) {
      return new Response(
        JSON.stringify({ error: "Missing required field: intent or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's org_id from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    // Build context
    const context = {
      user_id: user.id,
      org_id: profile?.org_id || "550e8400-e29b-41d4-a716-446655440000",
      page: body.page_context || "/",
      session_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // Execute intent
    const result = await callVPSAgentRouter(
      body.intent || "general_query",
      { ...body.payload, message: body.message },
      context
    );

    // Log execution for analytics
    console.log(`📊 Agent execution: user=${user.id}, intent=${body.intent}, success=${result.success}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
