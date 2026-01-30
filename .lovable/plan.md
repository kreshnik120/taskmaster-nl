
# Plan: Groepen Weergeven in Chat Lijst

## Probleem Analyse

Na database onderzoek blijkt dat groepen **WEL worden opgeslagen** in de database:

| Groep JID | Chat Type | Display Name | Phone Number |
|-----------|-----------|--------------|--------------|
| `31618710360-1629291774@g.us` | group | abczorg | 98917425365000 |
| `120363425639424898@g.us` | group | Shkelzen | 27281766486207 |
| `120363417411848202@g.us` | group | Sarah | 36782133502053 |
| `120363423224473357@g.us` | group | Simon de Jong | 150079176474722 |

De huidige code werkt correct:
- Edge Function maakt chats aan met juiste `chat_type`
- UI query haalt alle chats op (geen filter op `chat_type`)
- Groepen worden dus al getoond in de lijst

**Wat ontbreekt:**
1. Visuele groep-indicator (Users icoon) in de chat lijst
2. Betere handling voor groep display names (VPS moet groepsnaam sturen)
3. Optioneel: groep-specifieke avatar stijl

## Technische Wijzigingen

### 1. UI: Groep-icoon toevoegen aan WhatsAppChatItem

**Bestand:** `src/components/whatsapp/WhatsAppChatItem.tsx`

```typescript
// Import toevoegen
import { Check, Pin, BellOff, Users } from "lucide-react";

// Bij const declaraties toevoegen
const isGroup = chat.chat_type === 'group';

// In de render, bij de naam:
<div className="flex items-center gap-1.5 min-w-0">
  {/* Groep indicator */}
  {isGroup && (
    <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
  )}
  {/* Pin indicator */}
  {isPinned && (
    <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
  )}
  <span className={cn(...)}>
    {displayName}
  </span>
</div>
```

### 2. UI: Groep-avatar ondersteuning

**Bestand:** `src/components/whatsapp/WhatsAppContactAvatar.tsx`

Optioneel: Voeg een `isGroup` prop toe voor een andere avatar stijl:

```typescript
interface WhatsAppContactAvatarProps {
  // ... bestaande props
  isGroup?: boolean;
}

// Fallback voor groepen
{isGroup && !showImage && (
  <AvatarFallback className="bg-emerald-100 text-emerald-700">
    <Users className="h-5 w-5" />
  </AvatarFallback>
)}
```

### 3. Edge Function: Groepsnaam ophalen

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

De VPS zou de groepsnaam moeten sturen in `fromName` voor groepsberichten. Controleer of de VPS dit correct doet.

Optionele verbetering in `handleMessageReceived`:

```typescript
// Detecteer groep
const isGroup = chatJid.includes("@g.us");

let contact;
if (isGroup) {
  // Voor groepen: zoek/maak contact op basis van chatJid
  contact = await getOrCreateGroupContact(
    supabase, session.id, orgId, chatJid, fromName, requestId
  );
} else {
  contact = await getOrCreateContact(
    supabase, session.id, orgId, from, fromName, requestId
  );
}
```

## Wijzigingen Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `src/components/whatsapp/WhatsAppChatItem.tsx` | EDIT | Voeg Users icoon toe voor groepen |
| `src/components/whatsapp/WhatsAppContactAvatar.tsx` | EDIT | Optioneel: groep-avatar stijl |
| `supabase/functions/whatsapp-bridge/index.ts` | EDIT | Optioneel: betere groep contact handling |

## Prioriteit

| # | Wijziging | Impact | Effort |
|---|-----------|--------|--------|
| 1 | Users icoon in chat lijst | Hoog | Laag |
| 2 | Groep avatar stijl | Medium | Laag |
| 3 | Edge Function groep handling | Medium | Medium |

## Verificatie

Na implementatie:
1. Open `/whatsapp` pagina
2. Groepen moeten zichtbaar zijn met Users icoon
3. Groepsnaam moet worden getoond (indien VPS dit stuurt)
4. Klik op groep om chat te openen
