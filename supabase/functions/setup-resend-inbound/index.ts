import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendInboundRouteResponse {
  id: string;
  domain: string;
  url: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== Setting up Resend Inbound Route ===");

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL not configured");
    }

    // Construct webhook URL
    const webhookUrl = `${supabaseUrl}/functions/v1/process-application-email`;
    
    console.log("Domain: apply.citozorg.nl");
    console.log("Pattern: personeel@apply.citozorg.nl");
    console.log("Webhook URL:", webhookUrl);

    // Create Resend Inbound Route via API
    const resendResponse = await fetch("https://api.resend.com/inbound-routes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain: "apply.citozorg.nl",
        pattern: "personeel@apply.citozorg.nl",
        url: webhookUrl,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", resendResponse.status, errorText);
      throw new Error(`Resend API error: ${resendResponse.status} - ${errorText}`);
    }

    const result: ResendInboundRouteResponse = await resendResponse.json();
    console.log("✅ Inbound Route created successfully:", result);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Resend Inbound Route configured successfully",
        route: {
          id: result.id,
          domain: result.domain,
          pattern: "personeel@apply.citozorg.nl",
          webhook: webhookUrl,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error setting up Resend Inbound Route:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
