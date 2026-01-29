

# WhatsAppContactAvatar Component - Implementatie Plan

## Overzicht

Maak een herbruikbare avatar component voor WhatsApp contacten met profielfoto's, initialen fallback, en color hashing.

## Huidige Situatie

| Component | Locatie | Huidige Avatar Implementatie |
|-----------|---------|------------------------------|
| WhatsAppChatItem | Regel 64-68 | Eenvoudige AvatarFallback met groene styling |
| WhatsAppChatDetail | Regel 132-136 | Zelfde als ChatItem |

**Database velden (whatsapp_contacts):**
- `display_name` - Gebruiker-aanpasbare naam
- Geen `push_name` (WhatsApp's originele naam)
- Geen `profile_picture_url`

## Implementatie Stappen

### 1. Database Migratie

Voeg ontbrekende kolommen toe aan `whatsapp_contacts`:

```sql
ALTER TABLE whatsapp_contacts 
ADD COLUMN push_name TEXT,
ADD COLUMN profile_picture_url TEXT;
```

### 2. Nieuw Component: WhatsAppContactAvatar

**Bestand:** `src/components/whatsapp/WhatsAppContactAvatar.tsx`

**Props Interface:**
```typescript
interface WhatsAppContactAvatarProps {
  contactId?: string;
  profilePictureUrl?: string | null;
  displayName?: string | null;
  pushName?: string | null;
  phoneNumber: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showOnlineStatus?: boolean;
  className?: string;
}
```

**Size Mapping:**
| Size | Pixels | Tailwind Class |
|------|--------|----------------|
| sm   | 32px   | h-8 w-8        |
| md   | 48px   | h-12 w-12      |
| lg   | 64px   | h-16 w-16      |
| xl   | 96px   | h-24 w-24      |

**Initialen Logica:**
```typescript
function getInitials(displayName, pushName, phoneNumber): string {
  const name = displayName || pushName;
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  // Fallback: laatste 2 cijfers telefoonnummer
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.slice(-2) || '?';
}
```

**Kleur Hashing Algoritme:**
```typescript
// Consistent kleuren per contact op basis van naam hash
const AVATAR_COLORS = [
  { bg: 'bg-red-100', text: 'text-red-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-green-100', text: 'text-green-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
];

function hashToColor(str: string): typeof AVATAR_COLORS[0] {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
```

**Component States:**
```text
┌─────────────────────────────────────────────────────────────┐
│  Loading State     →  Skeleton pulse animatie               │
│  Image Loading     →  Skeleton, dan fade-in naar foto      │
│  Image Error       →  Fallback naar initialen              │
│  No Image          →  Initialen met kleur hash             │
└─────────────────────────────────────────────────────────────┘
```

**Component Structuur:**
```tsx
export function WhatsAppContactAvatar({
  profilePictureUrl,
  displayName,
  pushName,
  phoneNumber,
  size = 'md',
  className,
}: WhatsAppContactAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  const initials = getInitials(displayName, pushName, phoneNumber);
  const colorScheme = hashToColor(displayName || pushName || phoneNumber);
  const sizeClasses = SIZE_MAP[size];
  
  const showImage = profilePictureUrl && !imageError;
  
  return (
    <Avatar className={cn(sizeClasses, "border-2 border-border", className)}>
      {showImage ? (
        <>
          {imageLoading && <Skeleton className="absolute inset-0 rounded-full" />}
          <AvatarImage 
            src={profilePictureUrl}
            onLoad={() => setImageLoading(false)}
            onError={() => setImageError(true)}
            className={cn(imageLoading && "opacity-0")}
          />
        </>
      ) : (
        <AvatarFallback className={cn(colorScheme.bg, colorScheme.text, "font-medium")}>
          {initials}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
```

### 3. Type Updates

**Bestand:** `src/types/whatsapp.ts`

Uitbreiden `WhatsAppContact` interface:
```typescript
export interface WhatsAppContact {
  id: string;
  org_id: string;
  session_id: string;
  phone_number: string;
  display_name: string | null;
  push_name: string | null;           // NIEUW
  profile_picture_url: string | null; // NIEUW
  professional_id: string | null;
  created_at: string;
  updated_at: string;
}
```

### 4. Component Integratie

**WhatsAppChatItem.tsx (Regel 64-68):**
```tsx
// Oud:
<Avatar className="h-12 w-12 flex-shrink-0">
  <AvatarFallback className="bg-[#25D366]/20 text-[#25D366] font-medium">
    {getInitials(chat.contact?.display_name)}
  </AvatarFallback>
</Avatar>

// Nieuw:
<WhatsAppContactAvatar
  contactId={chat.contact?.id}
  profilePictureUrl={chat.contact?.profile_picture_url}
  displayName={chat.contact?.display_name}
  pushName={chat.contact?.push_name}
  phoneNumber={chat.contact?.phone_number || 'Onbekend'}
  size="md"
/>
```

**WhatsAppChatDetail.tsx (Regel 132-136):**
```tsx
// Oud:
<Avatar className="h-10 w-10">
  <AvatarFallback className="bg-[#25D366]/20 text-[#25D366] font-medium">
    {getInitials(chat.contact?.display_name)}
  </AvatarFallback>
</Avatar>

// Nieuw:
<WhatsAppContactAvatar
  contactId={chat.contact?.id}
  profilePictureUrl={chat.contact?.profile_picture_url}
  displayName={chat.contact?.display_name}
  pushName={chat.contact?.push_name}
  phoneNumber={chat.contact?.phone_number || 'Onbekend'}
  size="md"
/>
```

### 5. Verwijder Gedupliceerde Code

Verwijder lokale `getInitials` functies uit:
- `WhatsAppChatItem.tsx` (regel 15-23)
- `WhatsAppChatDetail.tsx` (regel 27-35)

## Bestanden Overzicht

| Actie | Bestand |
|-------|---------|
| CREATE | `src/components/whatsapp/WhatsAppContactAvatar.tsx` |
| EDIT | `src/types/whatsapp.ts` - Voeg push_name en profile_picture_url toe |
| EDIT | `src/components/whatsapp/WhatsAppChatItem.tsx` - Gebruik nieuwe component |
| EDIT | `src/components/whatsapp/WhatsAppChatDetail.tsx` - Gebruik nieuwe component |
| MIGRATE | Voeg push_name en profile_picture_url kolommen toe |

## Technische Details

### Edge Function Update (Later - Buiten Scope 6.1)
De Edge Function zou later moeten worden bijgewerkt om `push_name` apart op te slaan van `display_name`:
- `display_name` = Gebruiker-aanpasbare naam (handmatig gewijzigd)
- `push_name` = WhatsApp's originele naam (automatisch van API)

Voor nu werkt de component met de bestaande data (initialen fallback).

## Test Na Implementatie

1. Open `/whatsapp` pagina
2. Controleer dat alle avatars correct renderen met initialen
3. Controleer dat kleuren consistent zijn per contact
4. Controleer responsiviteit (size prop werkt)
5. Als er een `profile_picture_url` zou zijn, test image loading + error fallback

