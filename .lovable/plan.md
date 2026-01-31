
# Plan: Fix WhatsApp Send Message - Directe Route naar whatsapp-bridge

## Probleemanalyse

De huidige flow faalt:
```
UI → mcp-proxy → mcp.abcito.io → whatsapp-bridge → 401 Unauthorized
```

De externe MCP server heeft niet de juiste API key geconfigureerd.

## Oplossing

Route `whatsapp_send_message` direct naar de `whatsapp-bridge` Edge Function, die al als relay fungeert:

```
UI → mcp-proxy → whatsapp-bridge (met x-api-key) → WhatsApp
```

## Implementatie

**Bestand**: `supabase/functions/mcp-proxy/index.ts`

### Wijziging 1: Voeg Bridge endpoint toe (na regel 26)

```typescript
const MCP_ENDPOINT = "https://mcp.abcito.io/call";
const WHATSAPP_BRIDGE_URL = "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge";
```

### Wijziging 2: Pas handleUiMode aan (regel 141-172)

Voeg speciale routing toe voor `whatsapp_send_message`:

```typescript
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

  console.log(`[mcp-proxy] Routing whatsapp_send_message directly to bridge: to=${toolArgs.to}`);
  
  const bridgeResponse = await fetch(WHATSAPP_BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": bridgeApiKey,
    },
    body: JSON.stringify({
      action: "send_message",
      to: toolArgs.to,
      message: toolArgs.message,
    }),
  });

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
}

// Default: forward to MCP server for other tools
console.log(`[mcp-proxy] Forwarding to MCP: ${tool}`, JSON.stringify(toolArgs));
// ... rest van bestaande code
```

### Wijziging 3: Pas handleSendMessage aan (MCP Mode, regel 361-374)

Dezelfde directe route voor MCP Mode:

```typescript
// Forward to WhatsApp Bridge for actual delivery (instead of MCP server)
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
    action: "send_message",
    to,
    message,
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
```

## Samenvatting Wijzigingen

| Locatie | Wijziging |
|---------|-----------|
| Regel 27 | Voeg `WHATSAPP_BRIDGE_URL` constante toe |
| Regel 141-172 | Voeg speciale routing voor `whatsapp_send_message` in UI Mode |
| Regel 361-391 | Vervang MCP call door directe Bridge call in MCP Mode |

## Vereiste Secret

- `WHATSAPP_BRIDGE_API_KEY_V2` - reeds geconfigureerd in Supabase ✓

## Flow Na Implementatie

```
UI → mcp-proxy → whatsapp-bridge (x-api-key: WHATSAPP_BRIDGE_API_KEY_V2) → WhatsApp
```

## Verificatie

Na deployment:
1. Open een WhatsApp chat
2. Stuur een testbericht
3. Check Edge Function logs: geen 401 errors meer
4. Bericht moet succesvol verstuurd worden
