import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

interface ResendDomainResponse {
  id: string;
  name: string;
  status: string;
  created_at: string;
  records: Array<{
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }>;
}

interface ResendWebhookResponse {
  id: string;
  endpoint_url: string;
  events: string[];
  created_at: string;
  secret: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { action } = await req.json();
    const inboundDomain = "inbound.citozorg.nl";
    const webhookUrl = `${SUPABASE_URL}/functions/v1/handle-application-reply`;

    console.log(`[setup-resend-inbound] Action: ${action}`);

    if (action === "setup") {
      // Step 1: Check if domain already exists
      console.log("[setup-resend-inbound] Checking existing domains...");
      const domainsResponse = await fetch("https://api.resend.com/domains", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      if (!domainsResponse.ok) {
        const errorText = await domainsResponse.text();
        throw new Error(`Failed to list domains: ${errorText}`);
      }

      const domainsData = await domainsResponse.json();
      console.log(`[setup-resend-inbound] Found ${domainsData.data?.length || 0} existing domains`);

      // Check if inbound domain already exists
      const existingDomain = domainsData.data?.find((d: any) => d.name === inboundDomain);
      
      let domainInfo: ResendDomainResponse;

      if (existingDomain) {
        console.log(`[setup-resend-inbound] Domain ${inboundDomain} already exists, fetching details...`);
        
        // Get domain details
        const domainDetailResponse = await fetch(`https://api.resend.com/domains/${existingDomain.id}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
        });

        if (!domainDetailResponse.ok) {
          const errorText = await domainDetailResponse.text();
          throw new Error(`Failed to get domain details: ${errorText}`);
        }

        domainInfo = await domainDetailResponse.json();
      } else {
        // Step 2: Create the inbound domain
        console.log(`[setup-resend-inbound] Creating domain ${inboundDomain}...`);
        const createDomainResponse = await fetch("https://api.resend.com/domains", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: inboundDomain,
          }),
        });

        if (!createDomainResponse.ok) {
          const errorText = await createDomainResponse.text();
          throw new Error(`Failed to create domain: ${errorText}`);
        }

        domainInfo = await createDomainResponse.json();
        console.log(`[setup-resend-inbound] Domain created with ID: ${domainInfo.id}`);
      }

      // Step 3: Check/Create webhook
      console.log("[setup-resend-inbound] Checking existing webhooks...");
      const webhooksResponse = await fetch("https://api.resend.com/webhooks", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      let webhookInfo: ResendWebhookResponse | null = null;
      let webhookSecret: string | null = null;

      if (webhooksResponse.ok) {
        const webhooksData = await webhooksResponse.json();
        const existingWebhook = webhooksData.data?.find((w: any) => 
          w.endpoint_url === webhookUrl && w.events?.includes("email.received")
        );

        if (existingWebhook) {
          console.log(`[setup-resend-inbound] Webhook already exists: ${existingWebhook.id}`);
          webhookInfo = existingWebhook;
          // Note: Resend doesn't return secret for existing webhooks, need to use stored one
          webhookSecret = Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET") || null;
        }
      }

      if (!webhookInfo) {
        // Create webhook for inbound emails
        console.log(`[setup-resend-inbound] Creating webhook to ${webhookUrl}...`);
        const createWebhookResponse = await fetch("https://api.resend.com/webhooks", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint_url: webhookUrl,
            events: ["email.received"],
          }),
        });

        if (!createWebhookResponse.ok) {
          const errorText = await createWebhookResponse.text();
          console.error(`[setup-resend-inbound] Webhook creation failed: ${errorText}`);
          // Continue anyway, webhook might need manual creation
        } else {
          webhookInfo = await createWebhookResponse.json();
          webhookSecret = webhookInfo?.secret || null;
          console.log(`[setup-resend-inbound] Webhook created with ID: ${webhookInfo?.id}`);
        }
      }

      // Find MX record for inbound
      const mxRecord = domainInfo.records?.find(r => r.type === "MX");

      return new Response(JSON.stringify({
        success: true,
        domain: {
          id: domainInfo.id,
          name: domainInfo.name,
          status: domainInfo.status,
        },
        dns_records: domainInfo.records || [],
        mx_record: mxRecord ? {
          host: "inbound",
          type: "MX",
          value: mxRecord.value,
          priority: mxRecord.priority || 10,
          ttl: mxRecord.ttl || "3600",
        } : null,
        webhook: webhookInfo ? {
          id: webhookInfo.id,
          endpoint_url: webhookInfo.endpoint_url,
          events: webhookInfo.events,
        } : null,
        webhook_secret: webhookSecret,
        next_steps: [
          "1. Voeg het MX record toe aan je DNS voor inbound.citozorg.nl",
          "2. Wacht tot DNS is gepropageerd (kan tot 24 uur duren)",
          "3. Check de domain status in Resend dashboard",
          "4. Test door een email te sturen naar recruitment@inbound.citozorg.nl",
        ],
        reply_to_address: "recruitment@inbound.citozorg.nl",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "check_status") {
      // Check domain verification status
      const domainsResponse = await fetch("https://api.resend.com/domains", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      if (!domainsResponse.ok) {
        throw new Error("Failed to check domains");
      }

      const domainsData = await domainsResponse.json();
      const domain = domainsData.data?.find((d: any) => d.name === inboundDomain);

      if (!domain) {
        return new Response(JSON.stringify({
          success: false,
          error: `Domain ${inboundDomain} not found. Run setup first.`,
        }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Get full domain details
      const domainDetailResponse = await fetch(`https://api.resend.com/domains/${domain.id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      const domainDetails = await domainDetailResponse.json();

      return new Response(JSON.stringify({
        success: true,
        domain: {
          id: domain.id,
          name: domain.name,
          status: domain.status,
          created_at: domain.created_at,
        },
        records: domainDetails.records,
        is_verified: domain.status === "verified",
        message: domain.status === "verified" 
          ? "✅ Domain is geverifieerd! Inbound emails worden nu ontvangen."
          : "⏳ Domain is nog niet geverifieerd. Check je DNS records.",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "verify") {
      // Trigger domain verification
      const domainsResponse = await fetch("https://api.resend.com/domains", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      const domainsData = await domainsResponse.json();
      const domain = domainsData.data?.find((d: any) => d.name === inboundDomain);

      if (!domain) {
        throw new Error(`Domain ${inboundDomain} not found`);
      }

      // Trigger verification
      const verifyResponse = await fetch(`https://api.resend.com/domains/${domain.id}/verify`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      if (!verifyResponse.ok) {
        const errorText = await verifyResponse.text();
        throw new Error(`Verification failed: ${errorText}`);
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Verificatie gestart. Check de status over enkele minuten.",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      error: "Invalid action. Use 'setup', 'check_status', or 'verify'",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("[setup-resend-inbound] Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
