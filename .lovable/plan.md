# Plan: Edge Function Groepen Fix - ✅ GEÏMPLEMENTEERD

## Status: Voltooid

De edge function `whatsapp-bridge` is aangepast voor volledige groepsondersteuning.

## Wijzigingen Uitgevoerd

### 1. `handleMessageReceived` (L203-246)
- ✅ `isGroup` en `groupName` toegevoegd aan destructuring
- ✅ Groepsdetectie: `isGroupChat = isGroup === true || chatJid.includes("@g.us")`
- ✅ Aparte contact-logica: `getOrCreateGroupContact()` voor groepen
- ✅ `isGroupChat` parameter doorgegeven aan `getOrCreateChat()`

### 2. `getOrCreateContact` (L957-1002)
- ✅ `whatsapp_jid: ${phoneNumber}@s.whatsapp.net` toegevoegd
- ✅ `push_name` veld voor originele WhatsApp naam
- ✅ Verbeterde update-logica (overschrijft geen bestaande naam)

### 3. `getOrCreateGroupContact` (L1004-1050) - NIEUW
- ✅ Zoekt op `whatsapp_jid` (niet phone_number)
- ✅ Maakt contact aan met:
  - `phone_number: "group-{groupId}"`
  - `whatsapp_jid: "{chatJid}"`
  - `display_name: groupName || "Groep {laatste 6 cijfers}"`

### 4. `getOrCreateChat` (L1052-1090)
- ✅ Nieuwe parameter: `isGroupChat: boolean`
- ✅ Expliciete `chat_type` toewijzing

## Verificatie

Test door een bericht te sturen in een WhatsApp groep:
1. Check Edge Function logs: `Creating group contact: ...@g.us`
2. Check database: `chat_type = "group"`, `phone_number = "group-..."`
3. Refresh `/whatsapp` - groep moet zichtbaar zijn met Users icoon
