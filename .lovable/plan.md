

# Plan: Sync All Profile Pictures Endpoint

## Overzicht

Voeg een nieuw event `contact.syncAllProfilePictures` toe aan de WhatsApp Bridge Edge Function die:
1. Alle contacts zonder profielfoto ophaalt uit de database
2. Voor elk contact de VPS API aanroept om de profielfoto op te halen
3. Rate limiting toepast (max 5 requests per seconde)

## Technische Implementatie

### Bestand: `supabase/functions/whatsapp-bridge/index.ts`

**Wijziging 1: Nieuwe event case toevoegen** (rond regel 167-169)

```typescript
case "contact.syncAllProfilePictures":
  result = await handleSyncAllProfilePictures(supabase, sessionId, orgId, requestId);
  break;
```

**Wijziging 2: Nieuwe handler functie toevoegen** (na handleContactProfilePicture, rond regel 766)

```typescript
async function handleSyncAllProfilePictures(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
): Promise<Record<string, unknown>> {
  console.log(`[${requestId}] Starting profile picture sync for org ${orgId}`);
  
  // 1. Get VPS credentials
  const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");
  const vpsSessionId = Deno.env.get("WHATSAPP_VPS_SESSION_ID");
  
  if (!vpsApiKey || !vpsSessionId) {
    throw new Error("VPS credentials not configured");
  }
  
  // 2. Get all contacts without profile pictures
  const { data: contacts, error } = await supabase
    .from('whatsapp_contacts')
    .select('id, phone_number')
    .eq('org_id', orgId)
    .is('profile_picture_url', null)
    .limit(50); // Batch limit
  
  if (error) throw error;
  
  if (!contacts || contacts.length === 0) {
    return { synced: 0, message: "No contacts without profile pictures" };
  }
  
  console.log(`[${requestId}] Found ${contacts.length} contacts without profile pictures`);
  
  // 3. Process contacts with rate limiting (5 per second)
  const results = { success: 0, failed: 0, skipped: 0 };
  const BATCH_SIZE = 5;
  const DELAY_MS = 1000;
  
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel
    const promises = batch.map(async (contact) => {
      // Normalize phone number for VPS
      let phone = contact.phone_number;
      if (!phone.includes('@')) {
        phone = `${phone}@s.whatsapp.net`;
      }
      
      try {
        const vpsUrl = `http://72.61.155.82:3001/contacts/${encodeURIComponent(phone)}/profile-picture`;
        
        const response = await fetch(vpsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': vpsApiKey,
          },
          body: JSON.stringify({ sessionId: vpsSessionId }),
        });
        
        if (response.ok) {
          results.success++;
          console.log(`[${requestId}] ✅ Triggered sync for ${contact.phone_number}`);
        } else if (response.status === 404) {
          results.skipped++;
          console.log(`[${requestId}] ⏭️ No profile picture for ${contact.phone_number}`);
        } else {
          results.failed++;
          console.warn(`[${requestId}] ❌ Failed for ${contact.phone_number}: ${response.status}`);
        }
      } catch (err) {
        results.failed++;
        console.error(`[${requestId}] ❌ Error for ${contact.phone_number}:`, err);
      }
    });
    
    await Promise.all(promises);
    
    // Rate limit delay between batches
    if (i + BATCH_SIZE < contacts.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  console.log(`[${requestId}] ✅ Profile picture sync completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return { 
    synced: results.success, 
    failed: results.failed, 
    skipped: results.skipped,
    total: contacts.length 
  };
}
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| EDIT | `supabase/functions/whatsapp-bridge/index.ts` | Voeg nieuw event en handler toe |

## Gebruik

```bash
# Via Edge Function (aanbevolen)
curl -X POST https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_BRIDGE_API_KEY" \
  -d '{
    "event": "contact.syncAllProfilePictures",
    "sessionId": "61f4b1fb-5bcf-46c3-9cd5-5758d5b5c9f6",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {}
  }'
```

## Flow Diagram

```text
UI/Admin roept Edge Function aan
           ↓
contact.syncAllProfilePictures event
           ↓
┌──────────────────────────────────────┐
│ 1. Haal contacts zonder foto op     │
│    WHERE profile_picture_url IS NULL │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ 2. Loop door contacts (batch van 5) │
│    ├─ Call VPS: /contacts/{jid}/profile-picture
│    ├─ VPS haalt foto op van WhatsApp
│    └─ VPS stuurt foto naar Edge Function
│        via contact.profilePicture event
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ 3. Rate limit: 1 seconde wachten    │
│    tussen batches van 5             │
└──────────────────────────────────────┘
           ↓
Return: { synced: 35, failed: 1, skipped: 4, total: 40 }
```

## Belangrijke Features

- **Rate Limiting**: Max 5 parallelle requests per seconde (WhatsApp beperking)
- **Batch Processing**: Limit van 50 contacts per aanroep (voorkomt timeouts)
- **Error Handling**: Individuele failures stoppen niet de hele sync
- **Skip Logic**: 404 responses (geen profielfoto) worden als "skipped" geteld
- **Logging**: Uitgebreide logging voor debugging

