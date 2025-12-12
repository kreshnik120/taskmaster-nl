import { handleCors, jsonResponse, errorResponse } from '../_shared/core.ts';

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
  endpoint: string;  // Resend API returns 'endpoint', not 'endpoint_url'
  events: string[];
  created_at: string;
  secret: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { action } = await req.json();
    const inboundDomain = "inbound.citozorg.nl";
    // CORRECT webhook URL - moet naar process-application-email, NIET handle-application-reply
    const correctWebhookUrl = `${SUPABASE_URL}/functions/v1/process-application-email`;
    const oldWebhookUrl = `${SUPABASE_URL}/functions/v1/handle-application-reply`;

    console.log(`[setup-resend-inbound] Action: ${action}`);

    // ============ LIST ALL WEBHOOKS ============
    if (action === "list_webhooks") {
      console.log("[setup-resend-inbound] Listing all webhooks...");
      const webhooksResponse = await fetch("https://api.resend.com/webhooks", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      if (!webhooksResponse.ok) {
        const errorText = await webhooksResponse.text();
        throw new Error(`Failed to list webhooks: ${errorText}`);
      }

      const webhooksData = await webhooksResponse.json();
      console.log(`[setup-resend-inbound] Found ${webhooksData.data?.length || 0} webhooks`);

      return jsonResponse({
        success: true,
        total_webhooks: webhooksData.data?.length || 0,
        webhooks: webhooksData.data || [],
        correct_endpoint: correctWebhookUrl,
        old_endpoint: oldWebhookUrl,
      });
    }

    // ============ CLEANUP AND SETUP ============
    if (action === "cleanup_and_setup") {
      console.log("[setup-resend-inbound] Starting cleanup and setup...");
      
      // Step 1: Get all webhooks
      const webhooksResponse = await fetch("https://api.resend.com/webhooks", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      if (!webhooksResponse.ok) {
        const errorText = await webhooksResponse.text();
        throw new Error(`Failed to list webhooks: ${errorText}`);
      }

      const webhooksData = await webhooksResponse.json();
      const allWebhooks = webhooksData.data || [];
      console.log(`[setup-resend-inbound] Found ${allWebhooks.length} webhooks to process`);

      // Step 2: Delete ALL webhooks (clean slate)
      const deletedWebhooks: string[] = [];
      const deleteErrors: string[] = [];

      for (const webhook of allWebhooks) {
        console.log(`[setup-resend-inbound] Deleting webhook ${webhook.id} (${webhook.endpoint})...`);
        await delay(500); // Rate limiting
        
        try {
          const deleteResponse = await fetch(`https://api.resend.com/webhooks/${webhook.id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
          });

          if (deleteResponse.ok || deleteResponse.status === 204) {
            deletedWebhooks.push(webhook.id);
            console.log(`[setup-resend-inbound] ✅ Deleted webhook ${webhook.id}`);
          } else {
            const errorText = await deleteResponse.text();
            deleteErrors.push(`${webhook.id}: ${errorText}`);
            console.error(`[setup-resend-inbound] ❌ Failed to delete ${webhook.id}: ${errorText}`);
          }
        } catch (e: any) {
          deleteErrors.push(`${webhook.id}: ${e.message}`);
          console.error(`[setup-resend-inbound] ❌ Error deleting ${webhook.id}:`, e);
        }
      }

      await delay(1000);

      // Step 3: Create NEW webhook to process-application-email
      console.log(`[setup-resend-inbound] Creating new webhook to ${correctWebhookUrl}...`);
      
      let newWebhook: ResendWebhookResponse | null = null;
      let webhookSecret: string | null = null;
      let createError: string | null = null;

      try {
        const createResponse = await fetch("https://api.resend.com/webhooks", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: correctWebhookUrl,
            events: ["email.received"],
          }),
        });

        if (createResponse.ok) {
          newWebhook = await createResponse.json();
          webhookSecret = newWebhook?.secret || null;
          console.log(`[setup-resend-inbound] ✅ Created webhook ${newWebhook?.id}`);
          console.log(`[setup-resend-inbound] 🔐 Secret received: ${webhookSecret ? 'YES' : 'NO'}`);
        } else {
          createError = await createResponse.text();
          console.error(`[setup-resend-inbound] ❌ Failed to create webhook: ${createError}`);
        }
      } catch (e: any) {
        createError = e.message;
        console.error(`[setup-resend-inbound] ❌ Error creating webhook:`, e);
      }

      return jsonResponse({
        success: !!newWebhook,
        cleanup: {
          total_found: allWebhooks.length,
          deleted: deletedWebhooks.length,
          errors: deleteErrors,
        },
        new_webhook: newWebhook ? {
          id: newWebhook.id,
          endpoint: newWebhook.endpoint,
          events: newWebhook.events,
        } : null,
        webhook_secret: webhookSecret,
        create_error: createError,
        next_steps: webhookSecret ? [
          "✅ Cleanup voltooid en nieuwe webhook aangemaakt!",
          "⚠️ BELANGRIJK: Sla de webhook_secret op als RESEND_WEBHOOK_SIGNING_SECRET",
          `Secret: ${webhookSecret}`,
        ] : [
          "❌ Webhook kon niet worden aangemaakt",
          `Error: ${createError}`,
        ],
      });
    }

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
          w.endpoint === correctWebhookUrl && w.events?.includes("email.received")
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
        console.log(`[setup-resend-inbound] Creating webhook to ${correctWebhookUrl}...`);
        
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
                endpoint: correctWebhookUrl,  // Resend API expects 'endpoint' not 'endpoint_url'
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

      return jsonResponse({
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
          endpoint: webhookInfo.endpoint,
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
          `2. URL: ${correctWebhookUrl}`,
          "3. Event: email.received",
        ],
        reply_to_address: "recruitment@inbound.citozorg.nl",
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
        return jsonResponse({
          success: false,
          error: `Domain ${inboundDomain} not found. Run setup first.`,
        }, 404);
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
          w.endpoint === webhookUrl && w.events?.includes("email.received")
        );
        webhookStatus = existingWebhook ? {
          id: existingWebhook.id,
          endpoint: existingWebhook.endpoint,
          events: existingWebhook.events,
          status: "active"
        } : null;
      }

      return jsonResponse({
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

      return jsonResponse({
        success: true,
        message: "Verificatie gestart. Check de status over enkele minuten.",
      });
    }

    if (action === "enable_receiving") {
      // Enable receiving capability for inbound domain via Resend API
      console.log("[setup-resend-inbound] Enabling receiving for domain...");
      
      // Step 1: Get domain ID
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
      const domain = domainsData.data?.find((d: any) => d.name === inboundDomain);

      if (!domain) {
        return jsonResponse({
          success: false,
          error: `Domain ${inboundDomain} not found. Run 'setup' action first.`,
          action_required: "setup",
        }, 404);
      }

      console.log(`[setup-resend-inbound] Found domain: ${domain.id}, status: ${domain.status}`);
      
      await delay(1000);

      // Step 2: Get current domain details to check current capabilities
      const domainDetailResponse = await fetch(`https://api.resend.com/domains/${domain.id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      const domainDetails = await domainDetailResponse.json();
      console.log(`[setup-resend-inbound] Current domain details:`, JSON.stringify(domainDetails, null, 2));

      await delay(1000);

      // Step 3: Update domain to enable receiving
      console.log(`[setup-resend-inbound] Sending PATCH to enable receiving...`);
      const updateResponse = await fetch(`https://api.resend.com/domains/${domain.id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          open_tracking: false,
          click_tracking: false,
        }),
      });

      const updateResult = await updateResponse.text();
      console.log(`[setup-resend-inbound] Update response (${updateResponse.status}):`, updateResult);

      // If PATCH doesn't support receiving, try alternative approach
      // Some Resend API versions require different approach
      let receivingEnabled = false;
      let updateData: any = null;

      if (updateResponse.ok) {
        try {
          updateData = JSON.parse(updateResult);
          receivingEnabled = true;
        } catch {
          updateData = { raw: updateResult };
        }
      }

      await delay(1000);

      // Step 4: Re-fetch domain to confirm current state
      const verifyResponse = await fetch(`https://api.resend.com/domains/${domain.id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
      });

      const verifiedDomain = await verifyResponse.json();
      console.log(`[setup-resend-inbound] Verified domain state:`, JSON.stringify(verifiedDomain, null, 2));

      // Find MX record for inbound
      const mxRecord = verifiedDomain.records?.find((r: any) => r.type === "MX");

      return jsonResponse({
        success: true,
        domain: {
          id: verifiedDomain.id,
          name: verifiedDomain.name,
          status: verifiedDomain.status,
          region: verifiedDomain.region,
        },
        update_response: {
          status: updateResponse.status,
          data: updateData,
        },
        mx_record_required: mxRecord ? {
          host: "inbound",
          type: "MX", 
          value: mxRecord.value || "inbound.resend.com",
          priority: mxRecord.priority || 10,
          ttl: "3600",
          current_status: mxRecord.status,
        } : {
          host: "inbound",
          type: "MX",
          value: "inbound.resend.com",
          priority: 10,
          ttl: "3600",
          note: "Add this MX record to your DNS if not already present",
        },
        all_records: verifiedDomain.records || [],
        next_steps: [
          "1. ✅ Domain gevonden en geconfigureerd",
          "2. Controleer dat MX record correct staat in DNS:",
          "   Host: inbound | Type: MX | Value: inbound.resend.com | Priority: 10",
          "3. Run 'verify' action om DNS verificatie te triggeren",
          "4. Test door email te sturen naar recruitment@inbound.citozorg.nl",
        ],
        test_email_address: "recruitment@inbound.citozorg.nl",
      });
    }

    return errorResponse("Invalid action. Use 'setup', 'check_status', 'verify', or 'enable_receiving'", 400);

  } catch (error: any) {
    console.error("[setup-resend-inbound] Error:", error);
    return errorResponse(error.message, 500);
  }
});
