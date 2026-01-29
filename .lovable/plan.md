

# WhatsApp Media/Image Support - Plan

## Huidige Situatie Analyse

De infrastructuur is BIJNA compleet. Dit is wat al bestaat:

| Component | Status | Bevinding |
|-----------|--------|-----------|
| Edge Function | ✅ Werkt | Media wordt geüpload naar Storage en opgeslagen in `whatsapp_media` tabel |
| Storage Bucket | ⚠️ Private | Bucket `whatsapp-media` is `public: false` → URLs zijn niet toegankelijk |
| Database | ✅ Werkt | 4 afbeeldingen reeds opgeslagen met `storage_url` |
| Hook | ❌ Incompleet | Query haalt `whatsapp_media` relatie NIET op |
| UI | ❌ Incompleet | `WhatsAppMessageBubble` toont geen afbeeldingen |
| Types | ✅ Correct | `WhatsAppMessage.media?: WhatsAppMedia[]` bestaat al |

## Wat Nodig Is

### 1. Database Migration - Maak bucket public

```sql
UPDATE storage.buckets 
SET public = true 
WHERE name = 'whatsapp-media';
```

Dit zorgt dat de bestaande `storage_url` waarden direct werken.

### 2. Hook Update - Fetch media relatie

**Bestand:** `src/hooks/whatsapp/useWhatsAppMessages.ts`

Huidige query:
```typescript
.select('*')
```

Nieuwe query:
```typescript
.select(`
  *,
  media:whatsapp_media(*)
`)
```

Dit haalt de gekoppelde media op via de foreign key `message_id`.

### 3. UI Update - Toon afbeeldingen

**Bestand:** `src/components/whatsapp/WhatsAppMessageBubble.tsx`

Wijzigingen:
- Check of `message.media` bestaat en items bevat
- Toon afbeeldingen met correcte styling
- Ondersteun image types (jpg, png, webp)
- Document/video/audio krijgen download link of placeholder

```text
┌─────────────────────────────────┐
│         ┌─────────────┐         │
│         │   📷 Image  │         │
│         │             │         │
│         └─────────────┘         │
│                                 │
│  [optionele caption tekst]      │
│                                 │
│                    14:30 ✓✓     │
└─────────────────────────────────┘
```

### 4. Lightbox Component (nieuw)

**Nieuw bestand:** `src/components/whatsapp/WhatsAppImageLightbox.tsx`

- Klik op afbeelding opent fullscreen overlay
- Escape of klik buiten sluit
- Zoom mogelijkheid

## Implementatie Details

### Hook Wijziging (useWhatsAppMessages.ts)

```typescript
const { data, error } = await supabase
  .from('whatsapp_messages')
  .select(`
    *,
    media:whatsapp_media(
      id,
      file_name,
      file_type,
      mime_type,
      storage_url
    )
  `)
  .eq('chat_id', chatId)
  .order('sent_at', { ascending: true });
```

### UI Componenten (WhatsAppMessageBubble.tsx)

```typescript
// Nieuwe helper functie
function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// In de component
const hasMedia = message.media && message.media.length > 0;
const imageMedia = hasMedia 
  ? message.media.filter(m => isImageMimeType(m.mime_type))
  : [];
```

**Afbeelding rendering:**

```tsx
{imageMedia.length > 0 && (
  <div className="mb-2">
    {imageMedia.map(media => (
      <img
        key={media.id}
        src={media.storage_url}
        alt={media.file_name}
        className="max-w-full rounded-lg cursor-pointer"
        loading="lazy"
        onClick={() => openLightbox(media.storage_url)}
      />
    ))}
  </div>
)}
```

### Lightbox Component

Eenvoudige fullscreen overlay:

```typescript
interface WhatsAppImageLightboxProps {
  imageUrl: string;
  onClose: () => void;
}

export function WhatsAppImageLightbox({ imageUrl, onClose }: Props) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-black/90">
        <img src={imageUrl} className="max-h-[90vh] mx-auto" />
      </DialogContent>
    </Dialog>
  );
}
```

## Te Wijzigen Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/hooks/whatsapp/useWhatsAppMessages.ts` | Query uitbreiden met media join |
| `src/components/whatsapp/WhatsAppMessageBubble.tsx` | Afbeeldingen renderen |

## Nieuwe Bestanden

| Bestand | Beschrijving |
|---------|--------------|
| `src/components/whatsapp/WhatsAppImageLightbox.tsx` | Fullscreen afbeelding viewer |

## Database Migratie

```sql
-- Maak whatsapp-media bucket public
UPDATE storage.buckets 
SET public = true 
WHERE name = 'whatsapp-media';
```

## Ondersteunde Media Types

| Type | Actie |
|------|-------|
| `image/jpeg`, `image/png`, `image/webp`, `image/gif` | Toon afbeelding met lightbox |
| `video/mp4` | Video player (stretch goal) |
| `audio/*` | Audio player (stretch goal) |
| `application/pdf` | Download link met PDF icoon |
| Overig | Download link met bestandsnaam |

## Bestaande Edge Function - Geen Wijzigingen Nodig

De `handleMessageReceived` functie (regels 254-298) werkt al correct:
1. Decodeert base64 media
2. Uploadt naar `whatsapp-media` bucket
3. Slaat metadata op in `whatsapp_media` tabel
4. Bewaart `storage_url` met public URL

## Test Na Implementatie

1. Stuur een afbeelding naar `+31618710360` via WhatsApp
2. Open de chat in `/whatsapp`
3. Afbeelding moet zichtbaar zijn in de message bubble
4. Klik op afbeelding → lightbox opent
5. Escape of klik erbuiten → lightbox sluit

## Geen Wijzigingen Aan

- Edge function `whatsapp-bridge` (werkt al)
- Database schema (tabellen bestaan al)
- Types (interface is al correct)
- Andere WhatsApp componenten

