
# Enterprise-Niveau Subtiele Verbeteringen voor WhatsApp Module

## Huidige Status (Reeds Geïmplementeerd)

| Feature | Status |
|---------|--------|
| Virtualisatie chatlijst + berichten | ✅ react-virtuoso |
| Infinite scrolling berichten | ✅ useInfiniteQuery |
| Command Palette (Cmd+K) | ✅ Volledig werkend |
| Keyboard shortcuts | ✅ Uitgebreid |
| Online status indicator | ✅ Groene stip |
| Scroll-to-bottom FAB | ✅ Met unread badge |
| Hover Previews | ✅ HoverCard met details |
| Error Boundary | ✅ Robuuste foutafhandeling |
| Connection monitor | ✅ Exponential backoff |
| Deduplicatie berichten | ✅ Zojuist gefixt |

---

## Voorgestelde Enterprise Verbeteringen

### 1. Typing Indicator ("...is aan het typen")
Toon wanneer de andere partij aan het typen is - essentieel voor enterprise-communicatie.

**Technisch:**
- Luister naar `message.typing` events van WhatsApp webhook
- Opslaan in realtime state (niet in database - ephemeral)
- Toon animatie onder de header: "Jan is aan het typen..."

**Locatie:** `WhatsAppChatDetail.tsx` + nieuw `useTypingIndicator.ts` hook

---

### 2. Leesbevestigingen (Read Receipts)
Update berichtstatus wanneer WhatsApp confirmeert dat een bericht is gelezen.

**Huidige flow:**
- pending → sent → delivered → read

**Ontbrekend:**
- Webhook handler voor `message.ack` events
- Realtime updates van berichtstatus

**Technisch:**
- Voeg `handleMessageAck` toe aan `whatsapp-bridge`
- Update `whatsapp_messages.status` naar 'delivered' of 'read'
- Frontend: realtime subscription voor status updates

---

### 3. Quick Replies (/ Trigger)
Snelle antwoordtemplates via `/` in het invoerveld.

**UX:**
- Typ `/` → dropdown met templates verschijnt
- Selecteer template → tekst wordt ingevoerd
- Templates: `/dank` → "Bedankt voor je bericht!", `/afwezig` → "Ik ben momenteel niet beschikbaar"

**Technisch:**
- Nieuw component: `WhatsAppQuickReplies.tsx`
- Templates opslaan in `ai_knowledge_base` met category: `whatsapp_quick_reply`
- Detectie van `/` in input field

---

### 4. Reactie op Specifiek Bericht (Inline Reply)
Quote een bericht waar je op reageert.

**UX:**
- Swipe of klik op bericht → "Reageer" actie
- Bericht wordt geciteerd boven het invoerveld
- Verzonden met `quoted_message_id` referentie

**Technisch:**
- Voeg `quoted_message_id` kolom toe aan `whatsapp_messages`
- Pas `WhatsAppMessageBubble` aan om quotes te tonen
- State in `WhatsAppChatDetail` voor geselecteerd bericht

---

### 5. Bulk Acties voor Meerdere Chats
Enterprise-niveau: selecteer meerdere chats en voer bulk-acties uit.

**UX:**
- Long-press of checkbox → selectiemodus
- Bulk: archiveren, muten, pinnen, verwijderen

**Technisch:**
- `selectedChats: Set<string>` state
- Multi-select mode toggle
- Batch update via `Promise.all`

---

### 6. Message Search Binnen Chat
Zoek door berichten binnen een specifieke conversatie.

**UX:**
- Zoekicoon in chat header
- Overlay met zoekresultaten
- Spring naar bericht bij selectie

**Technisch:**
- `useWhatsAppMessageSearch(chatId, query)` hook
- Fulltext search op `message_body`
- Highlight matching tekst in resultaten

---

### 7. Audio Message Recording
Opnemen en versturen van spraakberichten.

**UX:**
- Microfoon icoon naast verzendknop
- Hold-to-record met visuele feedback
- Preview voor verzenden

**Technisch:**
- `MediaRecorder` API voor opname
- Upload naar Supabase Storage
- Verzend als `message_type: 'audio'`

---

### 8. Scheduled Messages
Plan berichten om later te versturen.

**UX:**
- Klok icoon naast verzendknop
- Kies datum/tijd
- Geplande berichten in aparte tab

**Technisch:**
- Nieuwe tabel: `whatsapp_scheduled_messages`
- Edge function cron job om te versturen
- UI voor beheren van geplande berichten

---

## Prioritering

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| **P1** | Typing Indicator | Hoog | Laag |
| **P1** | Read Receipts | Hoog | Laag |
| **P2** | Quick Replies | Medium | Medium |
| **P2** | Inline Reply | Hoog | Medium |
| **P3** | Bulk Actions | Medium | Medium |
| **P3** | Message Search | Medium | Medium |
| **P4** | Audio Recording | Laag | Hoog |
| **P4** | Scheduled Messages | Laag | Hoog |

---

## Aanbevolen Eerste Stap

Start met **P1 features** (Typing Indicator + Read Receipts) omdat:
1. Hoogste impact op gebruikerservaring
2. Relatief lage implementatie-effort
3. Benut bestaande webhook infrastructuur
4. Direct zichtbaar voor eindgebruikers

### Geschatte Tijdsinvestering
- Typing Indicator: ~2-3 uur
- Read Receipts: ~3-4 uur
- Quick Replies: ~4-5 uur
- Inline Reply: ~6-8 uur

