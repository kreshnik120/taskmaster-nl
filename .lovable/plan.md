

# Plan: MCP Proxy Uitbreiden voor Database Toegang

## Situatie Analyse

De huidige `mcp-proxy` doet **één ding**: forward UI requests naar `mcp.abcito.io`. Maar de MCP server heeft ook de **omgekeerde richting** nodig: database queries uitvoeren om WhatsApp data op te halen.

## Architectuur Na Wijziging

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                            LOVABLE APP                                   │
│                                                                          │
│   ┌────────────┐    ┌─────────────────────────────────────────────────┐ │
│   │  WhatsApp  │───▶│              mcp-proxy Edge Function            │ │
│   │     UI     │    │                                                 │ │
│   └────────────┘    │  MODE 1: UI → MCP (bestaand)                    │ │
│                     │  Auth: Supabase JWT                             │ │
│                     │  Body: { tool: "...", arguments: {...} }        │ │
│                     │  Action: Forward naar mcp.abcito.io/call        │ │
│                     │                                                 │ │
│                     │  MODE 2: MCP → Database (NIEUW)                 │ │
│                     │  Auth: MCP_API_KEY                              │ │
│                     │  Body: { action: "get_chats", params: {...} }   │ │
│                     │  Action: Query whatsapp_* tabellen              │ │
│                     └─────────────────────────────────────────────────┘ │
│                                   │                  │                   │
└───────────────────────────────────┼──────────────────┼───────────────────┘
                                    ▼                  ▼
                    ┌───────────────────────┐    ┌─────────────────┐
                    │   mcp.abcito.io       │    │    Supabase     │
                    │   (ClawdBot)          │    │    Database     │
                    └───────────────────────┘    └─────────────────┘
```

## Implementatie Details

### Stap 1: Edge Function Uitbreiden

**Bestand**: `supabase/functions/mcp-proxy/index.ts`

**Dubbele Authenticatie Mode**:

| Mode | Trigger | Auth | Actie |
|------|---------|------|-------|
| **UI Mode** | `body.tool` aanwezig | Supabase JWT | Forward naar mcp.abcito.io |
| **MCP Mode** | `body.action` aanwezig | MCP_API_KEY | Query lokale database |

**Ondersteunde Acties (MCP Mode)**:

| Action | Parameters | Query |
|--------|------------|-------|
| `get_chats` | `limit`, `offset`, `unread_only` | `whatsapp_chats` + `whatsapp_contacts` |
| `get_messages` | `chat_id`, `limit`, `offset` | `whatsapp_messages` |
| `send_message` | `to`, `message` | Insert + forward naar WhatsApp |

### Stap 2: Database Query Logica

**get_chats Query**:
```sql
SELECT 
  c.*,
  ct.id as contact_id,
  ct.phone_number,
  ct.display_name,
  ct.push_name,
  ct.profile_picture_url,
  ct.tags,
  ct.is_business_account
FROM whatsapp_chats c
LEFT JOIN whatsapp_contacts ct ON c.contact_id = ct.id
WHERE c.deleted_at IS NULL
ORDER BY c.last_message_at DESC NULLS LAST
LIMIT {limit} OFFSET {offset}
```

**get_messages Query**:
```sql
SELECT * FROM whatsapp_messages
WHERE chat_id = {chat_id}
ORDER BY sent_at DESC
LIMIT {limit} OFFSET {offset}
```

### Stap 3: Response Formaat

Consistent JSON response voor MCP server:

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "count": 50,
    "limit": 50,
    "offset": 0
  }
}
```

Error response:
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

## Bestanden Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `supabase/functions/mcp-proxy/index.ts` | **EDIT** | Uitbreiden met MCP mode |

## Verificatie

Na deploy kun je testen met:

```bash
curl -X POST https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/mcp-proxy \
  -H "Authorization: Bearer {MCP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action": "get_chats", "params": {"limit": 5}}'
```

Expected response:
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "chat_jid": "31612345678@s.whatsapp.net",
      "contact": {
        "display_name": "Jan Jansen",
        "phone_number": "+31612345678"
      },
      ...
    }
  ],
  "meta": { "count": 5, "limit": 5, "offset": 0 }
}
```

## Technische Details

### Service Role Key Alternatief

De Edge Function gebruikt `SUPABASE_SERVICE_ROLE_KEY` die automatisch beschikbaar is in alle Edge Functions. Dit omzeilt RLS policies, wat nodig is voor de MCP server om alle data te kunnen lezen.

### Security

- MCP_API_KEY wordt vergeleken met de secret in environment
- Alleen specifieke acties zijn toegestaan (whitelist)
- Rate limiting kan later worden toegevoegd

