
# Plan: WhatsApp Module Cleanup - Problemen en Duplicaties Oplossen

## Overzicht Gevonden Issues

Na kritische analyse van de WhatsApp pagina zijn de volgende problemen geïdentificeerd:

| # | Probleem | Prioriteit |
|---|----------|------------|
| 1 | Media placeholder tekst (`<media:image>`, `[Media]`) zichtbaar in chat list | Hoog |
| 2 | Dubbele "Archiveren" opties in context menu | Hoog |
| 3 | Dubbele hernoem-functionaliteit (dialog + inline) | Medium |
| 4 | Profiel panel acties zijn disabled maar zichtbaar | Medium |
| 5 | MessageBubble filtert `<media:image>` niet | Medium |

---

## Stap 1: Database Cleanup - Media Placeholders

Bestaande berichten en chat previews bevatten nog `<media:image>` en `[Media]`. Dit moet opgeschoond worden.

**SQL Migratie:**
```text
-- Fix message bodies
UPDATE whatsapp_messages 
SET message_body = '📷 Afbeelding'
WHERE message_body IN ('[Media]', '<media:image>', '<media:video>', '<media:audio>');

-- Fix chat previews  
UPDATE whatsapp_chats
SET last_message_preview = '📷 Afbeelding'
WHERE last_message_preview IN ('[Media]', '<media:image>', '<media:video>', '<media:audio>')
   OR last_message_preview LIKE '<media:%>';
```

---

## Stap 2: UI-side Fallback Filter

Als extra vangnet wordt de chat list en message bubble aangepast om placeholders te vervangen:

**WhatsAppChatItem.tsx** (regel 118):
```text
// Before:
{chat.last_message_preview || 'Geen berichten'}

// After:
{(() => {
  const preview = chat.last_message_preview;
  if (!preview) return 'Geen berichten';
  if (preview === '[Media]' || preview.startsWith('<media:')) return '📷 Afbeelding';
  return preview;
})()}
```

**WhatsAppMessageBubble.tsx** (regel 118):
```text
// Before:
{message.message_body && message.message_body !== '[Media]' && (

// After:
{message.message_body && 
 message.message_body !== '[Media]' && 
 !message.message_body.startsWith('<media:') && (
```

---

## Stap 3: Fix Dubbele Archiveren in Context Menu

Het rode "Chat archiveren" item is misleidend. Het roept `handleDelete` aan maar de tekst suggereert archiveren.

**WhatsAppChatContextMenu.tsx** - Wijziging:
```text
// Verwijder de dubbele archiveer optie en maak de delete duidelijker:

<ContextMenuItem onClick={handleArchive}>
  <Archive className="h-4 w-4 mr-2" />
  Chat archiveren
</ContextMenuItem>

<ContextMenuSeparator />

<ContextMenuItem 
  onClick={handleDelete}
  className="text-destructive focus:text-destructive"
>
  <Trash2 className="h-4 w-4 mr-2" />
  Chat verwijderen        {/* Duidelijke tekst voor delete */}
</ContextMenuItem>
```

---

## Stap 4: Verwijder Overbodige Rename Dialog

De inline editing in `WhatsAppContactName` is voldoende. We verwijderen:
- De "Contact hernoemen" optie uit het context menu
- De `WhatsAppRenameDialog` component

**WhatsAppChatContextMenu.tsx** - Verwijder:
```text
<ContextMenuItem onClick={onRename}>
  <Pencil className="h-4 w-4 mr-2" />
  Contact hernoemen
</ContextMenuItem>
```

---

## Stap 5: Maak Profiel Panel Acties Werkend of Verberg

De disabled knoppen in het profiel panel zijn verwarrend. Twee opties:

**Optie A (aanbevolen):** Maak de acties werkend door dezelfde hooks te gebruiken als het context menu:
```text
<Button variant="outline" className="w-full justify-start" onClick={handlePin}>
  <Pin className="h-4 w-4 mr-2" />
  {chat.is_pinned ? 'Chat losmaken' : 'Pin chat'}
</Button>
```

**Optie B:** Verberg de acties tot ze geïmplementeerd zijn.

---

## Bestanden die Gewijzigd Worden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/whatsapp/WhatsAppChatItem.tsx` | Filter placeholder in preview |
| `src/components/whatsapp/WhatsAppMessageBubble.tsx` | Filter `<media:>` placeholder |
| `src/components/whatsapp/WhatsAppChatContextMenu.tsx` | Fix dubbele archiveren, verwijder hernoemen |
| `src/components/whatsapp/WhatsAppChatList.tsx` | Verwijder rename dialog props |
| `src/components/whatsapp/WhatsAppContactProfile.tsx` | Maak acties werkend |
| `supabase/migrations/*.sql` | Cleanup bestaande data |

---

## Samenvatting Impact

- **Gebruikerservaring**: Geen verwarrende `<media:image>` tekst meer
- **Consistentie**: Één manier om te hernoemen (inline)
- **Duidelijkheid**: Context menu heeft logische, niet-dubbele opties
- **Functionaliteit**: Profiel panel acties werken echt

---

## Verificatie

Na implementatie:
1. Bekijk chat lijst - geen `[Media]` of `<media:image>` zichtbaar
2. Open een afbeelding-chat - bubble toont afbeelding, geen placeholder tekst
3. Rechtermuisklik op chat - geen dubbele archiveren, hernoemen optie weg
4. Open profiel panel - acties werken (pin, mute, archiveer)
