
# Plan: Media Upload via Data Object in whatsapp-bridge

## Samenvatting
De Edge Function wordt aangepast om media data te accepteren vanuit het `data` object (nieuwe ClawdBot format), naast het bestaande `media` object.

## Implementatie

### Stap 1: Edge Function aanpassen - handleMessageReceived

**Bestand**: `supabase/functions/whatsapp-bridge/index.ts`

**Wijziging 1 - Data extractie uitbreiden (regel 229-239)**:
Voeg de nieuwe ClawdBot media velden toe aan de destructuring:

```text
const { 
  messageId, chatJid, from, fromName, body, timestamp, type, isGroup, groupName,
  // New ClawdBot format: media fields in data object
  media_base64, media_filename, mediaType 
} = data as {
  messageId: string;
  chatJid: string;
  from: string;
  fromName?: string;
  body?: string;
  timestamp: number;
  type?: string;
  isGroup?: boolean;
  groupName?: string;
  // ClawdBot media fields
  media_base64?: string;
  media_filename?: string;
  mediaType?: string;
};

// Merge media sources: prefer top-level media object, fallback to inline ClawdBot format
let effectiveMedia: MediaData | undefined = media;
if (!effectiveMedia && media_base64) {
  const binaryData = base64Decode(media_base64);
  effectiveMedia = {
    base64: media_base64,
    mimetype: mediaType || 'image/jpeg',
    filename: media_filename || `image-${Date.now()}.jpg`,
    filesize: binaryData.length,
  };
  console.log(`[${requestId}] ClawdBot inline media detected: ${effectiveMedia.filename} (${effectiveMedia.filesize} bytes)`);
}

// Determine effective body: use original body, or emoji placeholder for media-only messages
const effectiveBody = body || (effectiveMedia ? '📷 Afbeelding' : '');
```

**Wijziging 2 - Message insert aanpassen (regel 272)**:
Gebruik `effectiveBody` in plaats van `body`:

```text
message_body: effectiveBody,
```

**Wijziging 3 - Media upload path aanpassen (regel 290-293)**:
Gebruik het nieuwe `inbound/{chatJid}/{timestamp}_{filename}` format en vervang `media` door `effectiveMedia`:

```text
// 5. Handle media upload if present
if (effectiveMedia && effectiveMedia.base64) {
  try {
    // New path format: inbound/{safeJid}/{timestamp}_{filename}
    const safeJid = chatJid.replace(/@/g, '-').replace(/\./g, '-');
    const uploadTimestamp = Date.now();
    const storagePath = `inbound/${safeJid}/${uploadTimestamp}_${effectiveMedia.filename}`;
    const fileBuffer = base64Decode(effectiveMedia.base64);

    console.log(`[${requestId}] Uploading media: ${effectiveMedia.filename} (${effectiveMedia.filesize} bytes) to ${storagePath}`);
```

**Wijziging 4 - Rest van media upload (regel 298-329)**:
Vervang alle `media.` referenties door `effectiveMedia.`:

```text
const { error: uploadError } = await supabase.storage
  .from('whatsapp-media')
  .upload(storagePath, fileBuffer, {
    contentType: effectiveMedia.mimetype,
    upsert: false,
  });

if (uploadError) {
  console.error(`[${requestId}] Media upload error:`, uploadError);
} else {
  const { data: urlData } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(storagePath);

  // Save to whatsapp_media table
  const { error: mediaDbError } = await supabase.from('whatsapp_media').insert({
    org_id: orgId,
    message_id: message.id,
    file_name: effectiveMedia.filename,
    file_type: type || 'image',
    file_size_bytes: effectiveMedia.filesize,
    mime_type: effectiveMedia.mimetype,
    storage_bucket: 'whatsapp-media',
    storage_path: storagePath,
    storage_url: urlData.publicUrl,
  });

  if (mediaDbError) {
    console.error(`[${requestId}] Media DB error:`, mediaDbError);
  } else {
    console.log(`[${requestId}] ✅ Media stored: ${storagePath}`);
  }
}
```

**Wijziging 5 - Chat preview aanpassen (regel 341)**:
Gebruik `effectiveBody` voor de preview:

```text
last_message_preview: effectiveBody.substring(0, 100) || '📷 Afbeelding',
```

## Verificatie
Na deployment:
1. Stuur een test-afbeelding via WhatsApp
2. Check Edge Function logs: upload moet slagen naar `inbound/{jid}/{timestamp}_{filename}`
3. Check database: `whatsapp_media` tabel moet URL bevatten
4. Check UI: afbeelding moet zichtbaar zijn in chat met "📷 Afbeelding" preview

## Impact
- Backwards compatible: bestaande `media` object format blijft werken
- Forward compatible: nieuwe ClawdBot inline format werkt nu ook
- Geen database migraties nodig (bucket bestaat al en is public)
