

# WhatsApp Profile Picture Handler - Implementatie Plan

## Overzicht

Voeg een nieuwe event handler `contact.profilePicture` toe aan de whatsapp-bridge Edge Function voor het synchroniseren van contact profielfoto's.

## Huidige Situatie

| Component | Status |
|-----------|--------|
| `whatsapp_contacts.profile_picture_url` kolom | Bestaat |
| `whatsapp-media` storage bucket | Bestaat |
| Event handler `contact.profilePicture` | Niet geimplementeerd |

## Implementatie Stappen

### 1. Update whatsapp-bridge Edge Function

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

#### A. Voeg nieuw case toe aan switch statement (regel 164-165):

```typescript
case "contact.profilePicture":
  result = await handleContactProfilePicture(supabase, sessionId, orgId, data, media, requestId);
  break;
```

#### B. Implementeer nieuwe handler functie (na handleSendMessage, voor HELPER FUNCTIONS sectie):

```typescript
async function handleContactProfilePicture(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  media: MediaData | undefined,
  requestId: string
): Promise<Record<string, unknown>> {
  const { contactJid, phone } = data as {
    contactJid?: string;
    phone: string;
  };

  if (!phone) {
    throw new Error("Missing required data: phone");
  }

  if (!media || !media.base64) {
    throw new Error("Missing required media data");
  }

  console.log(`[${requestId}] Processing profile picture for ${phone}`);

  // 1. Upload image to storage
  const storagePath = `profile-pictures/${orgId}/${phone}.jpg`;
  const fileBuffer = base64Decode(media.base64);

  console.log(`[${requestId}] Uploading profile picture: ${storagePath} (${media.filesize || 'unknown'} bytes)`);

  // Upsert: delete existing file first, then upload new one
  await supabase.storage
    .from('whatsapp-media')
    .remove([storagePath]);

  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(storagePath, fileBuffer, {
      contentType: media.mimetype || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error(`[${requestId}] Profile picture upload error:`, uploadError);
    throw new Error(`Upload failed: ${formatError(uploadError)}`);
  }

  // 2. Generate public URL
  const { data: urlData } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;
  console.log(`[${requestId}] Profile picture URL: ${publicUrl}`);

  // 3. Update contact in database
  const { data: updatedContacts, error: updateError } = await supabase
    .from('whatsapp_contacts')
    .update({ profile_picture_url: publicUrl })
    .eq('phone_number', phone)
    .eq('org_id', orgId)
    .select('id');

  if (updateError) {
    console.error(`[${requestId}] Contact update error:`, updateError);
    throw new Error(`Contact update failed: ${formatError(updateError)}`);
  }

  if (!updatedContacts || updatedContacts.length === 0) {
    console.warn(`[${requestId}] ⚠️ No contact found for phone ${phone} in org ${orgId} - photo stored but contact not updated`);
    return { success: true, url: publicUrl, contactUpdated: false };
  }

  console.log(`[${requestId}] ✅ Profile picture updated for ${updatedContacts.length} contact(s)`);

  return { success: true, url: publicUrl, contactUpdated: true, contactCount: updatedContacts.length };
}
```

## Handler Logica Diagram

```text
VPS POST /contacts/:jid/profile-picture
         ↓
whatsapp-bridge Edge Function
         ↓
event: "contact.profilePicture"
data: { contactJid, phone }
media: { base64, mimetype, filename, filesize }
         ↓
┌─────────────────────────────────────────────────────┐
│ 1. Upload naar Storage                              │
│    bucket: whatsapp-media                           │
│    pad: profile-pictures/{orgId}/{phone}.jpg        │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ 2. Genereer Public URL                              │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ 3. Update whatsapp_contacts                         │
│    SET profile_picture_url = {url}                  │
│    WHERE phone_number = {phone}                     │
│          AND org_id = {orgId}                       │
└─────────────────────────────────────────────────────┘
         ↓
Response: { success: true, url: publicUrl }
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| EDIT | `supabase/functions/whatsapp-bridge/index.ts` | Voeg `contact.profilePicture` handler toe |

## Belangrijke Features

1. **Upsert Strategie:**
   - Verwijder bestaand bestand eerst om overschrijven te garanderen
   - Upload nieuwe foto met `upsert: true` als fallback

2. **Consistent Pad:**
   - `profile-pictures/{orgId}/{phone}.jpg`
   - Altijd .jpg extensie (afbeelding wordt geconverteerd indien nodig)

3. **Graceful Error Handling:**
   - Contact niet gevonden = warning log, maar geen error
   - Upload failure = throw error met details

4. **Multi-Contact Support:**
   - Dezelfde phone kan in meerdere sessions voorkomen
   - Alle contacts met zelfde phone+org krijgen update

## Test Na Implementatie

Via SSH naar VPS:
```bash
ssh root@72.61.155.82
curl -X POST http://localhost:3001/contacts/sync-profile-pictures \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "61f4b1fb-5bcf-46c3-9cd5-5758d5b5c9f6"}'
```

Of voor enkele foto:
```bash
curl -X POST http://localhost:3001/contacts/31612345678@s.whatsapp.net/profile-picture \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "61f4b1fb-5bcf-46c3-9cd5-5758d5b5c9f6"}'
```

Verwachte response:
```json
{
  "success": true,
  "url": "https://oelmsmcgryeoryhonexw.supabase.co/storage/v1/object/public/whatsapp-media/profile-pictures/550e8400.../31612345678.jpg",
  "contactUpdated": true,
  "contactCount": 1
}
```

