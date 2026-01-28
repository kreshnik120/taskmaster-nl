
# WhatsApp Media Upload Ondersteuning

## Overzicht

Uitbreiding van de WhatsApp Bridge Edge Function om media/afbeeldingen te ontvangen, op te slaan in Supabase Storage, en te registreren in een nieuwe `whatsapp_media` tabel.

## Benodigde wijzigingen

### 1. Database: Nieuwe `whatsapp_media` tabel

Maak een tabel aan voor media-metadata met RLS policies:

```sql
CREATE TABLE public.whatsapp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'whatsapp-media',
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index voor snelle lookups
CREATE INDEX idx_whatsapp_media_message_id ON public.whatsapp_media(message_id);
CREATE INDEX idx_whatsapp_media_org_id ON public.whatsapp_media(org_id);

-- RLS inschakelen
ALTER TABLE public.whatsapp_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view media" ON public.whatsapp_media
  FOR SELECT USING (
    org_id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can insert media" ON public.whatsapp_media
  FOR INSERT WITH CHECK (true);
```

### 2. Storage: Nieuwe `whatsapp-media` bucket

Maak een private storage bucket aan:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800,  -- 50MB limiet
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'audio/ogg', 'audio/mpeg', 'application/pdf']
);

-- Storage RLS policies
CREATE POLICY "Org members can view media files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'whatsapp-media' AND
    (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM organizations o
      JOIN user_organizations uo ON uo.organization_id = o.id
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can upload media files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'whatsapp-media');
```

### 3. Edge Function: Media handling toevoegen

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/whatsapp-bridge/index.ts` | Media interface + upload logica |

**Wijzigingen in detail:**

**A. Nieuwe import (regel 1):**
```typescript
import { decode as base64Decode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
```

**B. Uitgebreide interfaces (regel 10-20):**
```typescript
interface MediaData {
  base64: string;
  mimetype: string;
  filename: string;
  filesize: number;
}

interface WhatsAppEvent {
  event: string;
  sessionId: string;
  orgId: string;
  data: Record<string, unknown>;
  media?: MediaData;
}
```

**C. Body parsing update (regel 84-85):**
```typescript
const body: WhatsAppEvent = await req.json();
const { event, sessionId, orgId, data, media } = body;
```

**D. handleMessageReceived aanroep update (regel 122):**
```typescript
result = await handleMessageReceived(supabase, sessionId, orgId, data, media, requestId);
```

**E. handleMessageReceived functie update (regel 174-245):**
- Voeg `media` parameter toe
- Na het opslaan van het bericht, upload media naar storage
- Registreer media in `whatsapp_media` tabel

### 4. TypeScript Types: WhatsAppMedia interface

| Bestand | Wijziging |
|---------|-----------|
| `src/types/whatsapp.ts` | Nieuw `WhatsAppMedia` interface |

```typescript
export interface WhatsAppMedia {
  id: string;
  org_id: string;
  message_id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number | null;
  mime_type: string;
  storage_bucket: string;
  storage_path: string;
  storage_url: string | null;
  created_at: string;
}

// Update WhatsAppMessage interface
export interface WhatsAppMessage {
  // ... bestaande velden
  media?: WhatsAppMedia[];  // Optionele relatie
}
```

## Technische details

### Storage pad structuur
```
whatsapp-media/
  └── {org_id}/
      └── {session_id}/
          └── {message_id}/
              └── {filename}
```

### VPS integratie
De VPS stuurt nu een optioneel `media` object mee bij `message.received` events:
```json
{
  "event": "message.received",
  "sessionId": "...",
  "orgId": "...",
  "data": { ... },
  "media": {
    "base64": "...",
    "mimetype": "image/jpeg",
    "filename": "photo.jpg",
    "filesize": 123456
  }
}
```

## Samenvatting

| Component | Actie |
|-----------|-------|
| Database migratie | Nieuwe `whatsapp_media` tabel met RLS |
| Storage bucket | Nieuwe `whatsapp-media` bucket (private) |
| Edge Function | Media upload logica in `handleMessageReceived` |
| TypeScript types | Nieuwe `WhatsAppMedia` interface |
