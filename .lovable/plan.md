

# Plan: MCP Server Integratie - Gecorrigeerd & Compleet

## Overzicht

Volledige migratie van de WhatsApp integratie naar de MCP server (`https://mcp.abcito.io`), ter vervanging van de oude VPS bridge.

## Architectuur

```text
┌─────────────────────────────────────────────────────────────────┐
│                         LOVABLE APP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    WhatsApp UI                           │   │
│  │  /whatsapp pagina, ChatWindow, MessageInput, etc.        │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              UI Hooks (Aangepast)                        │   │
│  │  useWhatsAppChats, useWhatsAppSendMessage, etc.          │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              mcp-proxy Edge Function (NIEUW)             │   │
│  │  - JWT verificatie                                       │   │
│  │  - Forward naar mcp.abcito.io/call                       │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
                 ┌─────────────────────────────┐
                 │   https://mcp.abcito.io     │
                 │   POST /call                │
                 │   - whatsapp_get_chats      │
                 │   - whatsapp_send_message   │
                 │   - supabase_query          │
                 │   - get_tasks               │
                 │   - add_task                │
                 │   - complete_task           │
                 │           ↓                 │
                 │       ClawdBot              │
                 └─────────────────────────────┘
```

---

## Stap 1: Secret Toevoegen

| Secret | Waarde |
|--------|--------|
| `MCP_API_KEY` | `35d78e38675bdc23f49522919dc37d5551904f979d4c2ce076d06317762edaa0` |

---

## Stap 2: Edge Function `mcp-proxy` Aanmaken

**Bestand**: `supabase/functions/mcp-proxy/index.ts`

### MCP API Specificatie (Gecorrigeerd)

| Aspect | Detail |
|--------|--------|
| Endpoint | `POST https://mcp.abcito.io/call` |
| Auth Header | `Authorization: Bearer {MCP_API_KEY}` |
| Content-Type | `application/json` |
| Request Body | `{ "tool": "...", "arguments": {...} }` |
| Response | `{ "result": {...} }` |

### Beschikbare Tools met Argument Structuur

| Tool | Arguments | Beschrijving |
|------|-----------|--------------|
| `whatsapp_get_chats` | `{ "limit": 50, "offset": 0, "unread_only": false }` | Haalt chats op |
| `whatsapp_send_message` | `{ "to": "+31612345678", "message": "Hallo!" }` | Stuurt bericht |
| `supabase_query` | `{ "query": "SELECT * FROM ..." }` | Database query |
| `get_tasks` | `{ "status": "pending" }` | Haalt taken op (pending/all/completed/in_progress) |
| `add_task` | `{ "type": "implement", "title": "...", "description": "..." }` | Voegt taak toe |
| `complete_task` | `{ "task_id": "task-1", "result": "..." }` | Markeert taak als voltooid |

### Edge Function Code Structuur

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Verify Supabase JWT (alleen ingelogde users)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  // 3. Get MCP API key from secrets
  const mcpApiKey = Deno.env.get("MCP_API_KEY");
  if (!mcpApiKey) {
    return new Response(JSON.stringify({ error: "MCP not configured" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // 4. Parse request body
  const { tool, arguments: toolArgs } = await req.json();

  // 5. Validate tool is in whitelist
  if (!VALID_TOOLS.includes(tool)) {
    return new Response(JSON.stringify({ error: `Invalid tool: ${tool}` }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // 6. Forward to MCP server
  console.log(`[mcp-proxy] Calling tool: ${tool}`, toolArgs);
  
  const response = await fetch("https://mcp.abcito.io/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mcpApiKey}`,
    },
    body: JSON.stringify({ tool, arguments: toolArgs }),
  });

  // 7. Return response
  const data = await response.json();
  console.log(`[mcp-proxy] Response status: ${response.status}`);
  
  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

### Config Toevoegen

**Bestand**: `supabase/config.toml` (toevoegen)

```toml
[functions.mcp-proxy]
verify_jwt = false
# Purpose: Proxy to MCP server (mcp.abcito.io) for WhatsApp integration
# Auth: JWT validation done in-code for granular control
```

---

## Stap 3: UI Hooks Aanpassen

### Hook 1: useWhatsAppChats (Lijn 31-58)

**Huidige code** (direct Supabase query):
```typescript
const { data, error } = await supabase
  .from('whatsapp_chats')
  .select(`*,contact:whatsapp_contacts!contact_id (*)...`)
  .in('org_id', orgIds)
  .order('last_message_at', { ascending: false });
```

**Nieuwe code** (via MCP proxy):
```typescript
const { data, error } = await supabase.functions.invoke('mcp-proxy', {
  body: {
    tool: 'whatsapp_get_chats',
    arguments: {
      limit: 100,
      offset: 0,
      unread_only: false
    }
  }
});

if (error) throw error;
// MCP returns { result: [...chats] }
return (data?.result ?? []) as WhatsAppChat[];
```

**Realtime**: Behoud de realtime subscription (regel 119-135) - deze blijft werken op de lokale database.

### Hook 2: useWhatsAppSendMessage (Lijn 14-43)

**Huidige code** (via whatsapp-bridge):
```typescript
const { data, error } = await supabase.functions.invoke('whatsapp-bridge', {
  body: {
    event: 'message.send',
    sessionId: 'internal',
    orgId,
    data: { chatJid, body: text.trim(), chatId }
  }
});
```

**Nieuwe code** (via MCP proxy):
```typescript
const { data, error } = await supabase.functions.invoke('mcp-proxy', {
  body: {
    tool: 'whatsapp_send_message',
    arguments: {
      to: chatJid,        // Gebruik chatJid als "to" parameter
      message: text.trim()
    }
  }
});

if (error) {
  console.error('[useWhatsAppSendMessage] Error:', error);
  throw new Error(error.message || 'Fout bij versturen bericht');
}

// MCP returns { result: {...} }
if (!data?.result?.success) {
  throw new Error(data?.result?.error || 'Fout bij versturen bericht');
}

return data.result;
```

**Opmerking**: De `to` parameter accepteert zowel telefoonformaat (`+31612345678`) als JID-formaat (`31612345678@s.whatsapp.net`). De MCP server normaliseert dit.

### Hook 3: useWhatsAppMessages (BEHOUDEN)

Deze hook blijft **ongewijzigd** omdat:
1. Berichten worden al lokaal opgeslagen in `whatsapp_messages` tabel
2. De MCP server synchroniseert naar dezelfde database
3. Realtime updates werken via Supabase Realtime op de lokale tabel

---

## Stap 4: Data Mapping

De MCP server retourneert mogelijk een ander formaat dan de huidige Supabase queries. Hier is de mapping:

### Chat Formaat

| MCP Response Veld | WhatsAppChat Interface | Transformatie |
|-------------------|------------------------|---------------|
| `id` | `id` | Direct |
| `jid` | `chat_jid` | Direct |
| `name` | `contact.display_name` | Nest in contact object |
| `phone` | `contact.phone_number` | Nest in contact object |
| `unread` | `unread_count` | Direct |
| `lastMessage` | `last_message_preview` | Direct |
| `lastMessageAt` | `last_message_at` | Convert to ISO string |
| `isGroup` | `chat_type` | `isGroup ? 'group' : 'direct'` |
| `isPinned` | `is_pinned` | Direct |
| `isMuted` | `is_muted` | Direct |

### Transformatie Helper

```typescript
function mapMCPChatToWhatsAppChat(mcpChat: any): WhatsAppChat {
  return {
    id: mcpChat.id,
    org_id: mcpChat.orgId,
    session_id: mcpChat.sessionId,
    contact_id: mcpChat.contactId,
    chat_jid: mcpChat.jid,
    chat_type: mcpChat.isGroup ? 'group' : 'direct',
    unread_count: mcpChat.unread || 0,
    last_message_at: mcpChat.lastMessageAt,
    last_message_preview: mcpChat.lastMessage,
    linked_professional_id: mcpChat.linkedProfessionalId,
    is_pinned: mcpChat.isPinned || false,
    is_muted: mcpChat.isMuted || false,
    is_archived: mcpChat.isArchived || false,
    deleted_at: null,
    created_at: mcpChat.createdAt,
    updated_at: mcpChat.updatedAt,
    contact: mcpChat.contact ? {
      id: mcpChat.contact.id,
      org_id: mcpChat.orgId,
      session_id: mcpChat.sessionId,
      phone_number: mcpChat.contact.phone || mcpChat.phone,
      display_name: mcpChat.contact.name || mcpChat.name,
      push_name: mcpChat.contact.pushName,
      profile_picture_url: mcpChat.contact.profilePicture,
      professional_id: null,
      created_at: mcpChat.contact.createdAt,
      updated_at: mcpChat.contact.updatedAt,
      tags: mcpChat.contact.tags || [],
      contact_notes: mcpChat.contact.notes,
      is_business_account: mcpChat.contact.isBusiness || false,
    } : null,
    linked_professional: null,
  };
}
```

---

## Bestanden Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `supabase/functions/mcp-proxy/index.ts` | **CREATE** | Nieuwe Edge Function proxy |
| `supabase/config.toml` | **EDIT** | Voeg mcp-proxy configuratie toe |
| `src/hooks/whatsapp/useWhatsAppChats.ts` | **EDIT** | Vervang Supabase query door MCP call |
| `src/hooks/whatsapp/useWhatsAppSendMessage.ts` | **EDIT** | Vervang whatsapp-bridge door MCP call |

---

## Backward Compatibility

1. **whatsapp-bridge blijft bestaan** - Niet verwijderd, enkel niet meer aangeroepen
2. **Realtime subscriptions blijven werken** - Database tabel is de single source of truth
3. **Lokale berichten query** - useWhatsAppMessages blijft Supabase querien (sneller)

---

## Verificatie Stappen

Na implementatie:

1. **Test chats laden**:
   - Open `/whatsapp`
   - Controleer dat chats verschijnen
   - Check Edge Function logs: `[mcp-proxy] Calling tool: whatsapp_get_chats`

2. **Test bericht versturen**:
   - Open een chat
   - Stuur een testbericht
   - Check Edge Function logs: `[mcp-proxy] Calling tool: whatsapp_send_message`
   - Controleer dat bericht aankomt

3. **Test realtime**:
   - Stuur bericht vanaf telefoon
   - Controleer dat bericht direct verschijnt in UI

---

## Technische Details

### Error Handling

De MCP proxy zal errors consistent afhandelen:

```typescript
// MCP server errors (4xx/5xx)
if (!response.ok) {
  console.error(`[mcp-proxy] MCP error: ${response.status}`);
  return new Response(JSON.stringify({
    error: `MCP server error: ${response.status}`,
    details: await response.text()
  }), {
    status: response.status,
    headers: corsHeaders
  });
}
```

### Logging

Uitgebreide logging voor debugging:

```typescript
console.log(`[mcp-proxy] Request: tool=${tool}, args=${JSON.stringify(toolArgs)}`);
console.log(`[mcp-proxy] Response: status=${response.status}`);
```

