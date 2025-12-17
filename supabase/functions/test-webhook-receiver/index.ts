/**
 * TIJDELIJKE TEST ENDPOINT - Zonder signature verificatie
 * Alleen voor debugging doeleinden
 * 
 * DELETE DEZE FUNCTIE NA DEBUGGING!
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("🧪 [TEST-WEBHOOK] ========================================");
  console.log("🧪 [TEST-WEBHOOK] Test endpoint aangeroepen!");
  console.log("🧪 [TEST-WEBHOOK] Timestamp:", new Date().toISOString());
  console.log("🧪 [TEST-WEBHOOK] Method:", req.method);
  console.log("🧪 [TEST-WEBHOOK] URL:", req.url);

  try {
    // Log alle headers
    console.log("🧪 [TEST-WEBHOOK] === HEADERS ===");
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
      console.log(`🧪 [TEST-WEBHOOK] ${key}: ${value}`);
    });

    // Check voor Svix headers (Resend webhook)
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    
    console.log("🧪 [TEST-WEBHOOK] === SVIX HEADERS ===");
    console.log("🧪 [TEST-WEBHOOK] svix-id:", svixId || "NIET AANWEZIG");
    console.log("🧪 [TEST-WEBHOOK] svix-timestamp:", svixTimestamp || "NIET AANWEZIG");
    console.log("🧪 [TEST-WEBHOOK] svix-signature:", svixSignature ? "AANWEZIG" : "NIET AANWEZIG");

    // Parse body
    let body: any = null;
    let rawBody = "";
    
    try {
      rawBody = await req.text();
      console.log("🧪 [TEST-WEBHOOK] === RAW BODY (eerste 2000 chars) ===");
      console.log("🧪 [TEST-WEBHOOK]", rawBody.substring(0, 2000));
      
      if (rawBody) {
        body = JSON.parse(rawBody);
        console.log("🧪 [TEST-WEBHOOK] === PARSED BODY ===");
        console.log("🧪 [TEST-WEBHOOK] Type:", body.type);
        console.log("🧪 [TEST-WEBHOOK] Created at:", body.created_at);
        
        if (body.data) {
          console.log("🧪 [TEST-WEBHOOK] === EMAIL DATA ===");
          console.log("🧪 [TEST-WEBHOOK] From:", body.data.from);
          console.log("🧪 [TEST-WEBHOOK] To:", JSON.stringify(body.data.to));
          console.log("🧪 [TEST-WEBHOOK] Subject:", body.data.subject);
          console.log("🧪 [TEST-WEBHOOK] Email ID:", body.data.email_id);
          console.log("🧪 [TEST-WEBHOOK] Has text:", !!body.data.text);
          console.log("🧪 [TEST-WEBHOOK] Has html:", !!body.data.html);
          console.log("🧪 [TEST-WEBHOOK] Attachments:", body.data.attachments?.length || 0);
        }
      }
    } catch (parseError) {
      console.log("🧪 [TEST-WEBHOOK] Body parse error:", parseError);
      console.log("🧪 [TEST-WEBHOOK] Raw body:", rawBody.substring(0, 500));
    }

    // Sla de webhook op in database voor later bekijken
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Log naar een tabel (als die bestaat) of naar system_events
    try {
      const { error: logError } = await supabase
        .from("system_events")
        .insert({
          org_id: "550e8400-e29b-41d4-a716-446655440000", // ABCzorg
          event_type: "test_webhook_received",
          entity_type: "webhook_test",
          entity_id: svixId || `test-${Date.now()}`,
          event_data: {
            headers,
            body,
            raw_body_length: rawBody.length,
            svix_present: !!(svixId && svixTimestamp && svixSignature),
            timestamp: new Date().toISOString(),
          },
          metadata: {
            source: "test-webhook-receiver",
            processing_time_ms: Date.now() - startTime,
          },
        });

      if (logError) {
        console.log("🧪 [TEST-WEBHOOK] Log error:", logError);
      } else {
        console.log("🧪 [TEST-WEBHOOK] ✅ Webhook data opgeslagen in system_events");
      }
    } catch (dbError) {
      console.log("🧪 [TEST-WEBHOOK] DB error:", dbError);
    }

    const processingTime = Date.now() - startTime;
    console.log("🧪 [TEST-WEBHOOK] ========================================");
    console.log("🧪 [TEST-WEBHOOK] ✅ Test webhook succesvol verwerkt in", processingTime, "ms");
    console.log("🧪 [TEST-WEBHOOK] ========================================");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Test webhook ontvangen en gelogd",
        received_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        has_svix_headers: !!(svixId && svixTimestamp && svixSignature),
        body_type: body?.type,
        email_from: body?.data?.from,
        email_subject: body?.data?.subject,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("🧪 [TEST-WEBHOOK] ❌ Error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
