import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, handleCors } from '../_shared/core.ts';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

// Helper function for delay to avoid rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

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

      // Delay to avoid rate limiting (2 req/sec limit)
      await delay(1000);

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
            region: "eu-west-1", // Ireland - consistent met andere domeinen
          }),
        });

        if (!createDomainResponse.ok) {
          const errorText = await createDomainResponse.text();
          throw new Error(`Failed to create domain: ${errorText}`);
        }

        domainInfo = await createDomainResponse.json();
        console.log(`[setup-resend-inbound] Domain created with ID: ${domainInfo.id}`);
      }

      // Delay before webhook operations
      await delay(1000);

      // Step 3: Check/Create webhook with retry logic
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
        console.log(`[setup-resend-inbound] Found ${webhooksData.data?.length || 0} existing webhooks`);
        
        const existingWebhook = webhooksData.data?.find((w: any) => 
          w.endpoint_url === webhookUrl && w.events?.includes("email.received")
        );

        if (existingWebhook) {
          console.log(`[setup-resend-inbound] Webhook already exists: ${existingWebhook.id}`);
          webhookInfo = existingWebhook;
          // Note: Resend doesn't return secret for existing webhooks, need to use stored one
          webhookSecret = Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET") || null;
        }
      } else {
        console.log(`[setup-resend-inbound] Failed to list webhooks: ${await webhooksResponse.text()}`);
      }

      // Delay before webhook creation
      await delay(1000);

      if (!webhookInfo) {
        // Create webhook for inbound emails with retry logic
        console.log(`[setup-resend-inbound] Creating webhook to ${webhookUrl}...`);
        
        let webhookRetries = 3;
        while (!webhookInfo && webhookRetries > 0) {
          try {
            const createWebhookResponse = await fetch("https://api.resend.com/webhooks", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                endpoint: webhookUrl,  // Resend API expects 'endpoint' not 'endpoint_url'
                events: ["email.received"],
              }),
            });

            if (createWebhookResponse.status === 429) {
              console.log(`[setup-resend-inbound] Rate limited (429), waiting 2s before retry... (${webhookRetries - 1} retries left)`);
              await delay(2000);
              webhookRetries--;
              continue;
            }

            if (!createWebhookResponse.ok) {
              const errorText = await createWebhookResponse.text();
              console.error(`[setup-resend-inbound] Webhook creation failed: ${createWebhookResponse.status} - ${errorText}`);
              webhookRetries--;
              await delay(1500);
              continue;
            }

            webhookInfo = await createWebhookResponse.json();
            webhookSecret = webhookInfo?.secret || null;
            console.log(`[setup-resend-inbound] ✅ Webhook created successfully with ID: ${webhookInfo?.id}`);
            console.log(`[setup-resend-inbound] 🔐 Webhook secret: ${webhookSecret ? 'RECEIVED' : 'NOT RECEIVED'}`);
            break;
          } catch (e) {
            console.error(`[setup-resend-inbound] Webhook creation error:`, e);
            webhookRetries--;
            await delay(2000);
          }
        }

        if (!webhookInfo) {
          console.error("[setup-resend-inbound] ❌ Failed to create webhook after all retries");
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
        webhook_created: !!webhookInfo,
        next_steps: webhookInfo ? [
          "✅ Webhook is geconfigureerd!",
          "1. Sla de webhook secret op als RESEND_WEBHOOK_SIGNING_SECRET",
          "2. Test door een email te sturen naar recruitment@inbound.citozorg.nl",
        ] : [
          "❌ Webhook kon niet worden aangemaakt",
          "1. Maak de webhook handmatig aan in Resend Dashboard",
          `2. URL: ${webhookUrl}`,
          "3. Event: email.received",
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

      await delay(1000);

      // Get full domain details
      const domainDetailResponse = await fetch(`https://api.resend.com/domains/${domain.id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      const domainDetails = await domainDetailResponse.json();

      await delay(1000);

      // Also check webhooks
      const webhooksResponse = await fetch("https://api.resend.com/webhooks", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      let webhookStatus = null;
      if (webhooksResponse.ok) {
        const webhooksData = await webhooksResponse.json();
        const webhookUrl = `${SUPABASE_URL}/functions/v1/handle-application-reply`;
        const existingWebhook = webhooksData.data?.find((w: any) => 
          w.endpoint_url === webhookUrl && w.events?.includes("email.received")
        );
        webhookStatus = existingWebhook ? {
          id: existingWebhook.id,
          endpoint_url: existingWebhook.endpoint_url,
          events: existingWebhook.events,
          status: "active"
        } : null;
      }

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
        webhook: webhookStatus,
        webhook_configured: !!webhookStatus,
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

      await delay(1000);

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
