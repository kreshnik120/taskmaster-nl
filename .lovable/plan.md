
## Wat er nu feitelijk “fout gaat” (bevindingen uit logs + code)

### 1) Versturen lijkt te “hangen”, maar de backend stuurt wél
- In de recente netwerklogs zie ik een succesvolle call:
  - `POST /functions/v1/mcp-proxy` met `tool:"whatsapp_send_message"` → **Status 200**
  - Response: `{"result":{"success":true,"sent":true,"providerId":"sent_..."}}`
- In de backend-logs van de WhatsApp-bridge zie ik ook succesvolle afleveringen via de relay (“Relay response … success: true”).

Conclusie: het versturen zelf werkt (nu), maar de UI geeft geen duidelijk resultaat terug (geen zichtbaar nieuw bericht).

### 2) Waarom je na verzenden “niks ziet” in de chat
In de code staat het kernprobleem:

- De chat-detail (`WhatsAppChatDetail`) toont berichten via `useWhatsAppMessages()`.
- `useWhatsAppMessages()` haalt berichten **uitsluitend uit de database** (`whatsapp_messages`).
- Bij `event: "message.send"` doet `whatsapp-bridge` momenteel: **“Message sent via Relay (no DB storage)”** (dit zie ik expliciet in de logs).

Gevolg:
- Je drukt op verzenden → knop draait (pending) → call rondt af → maar **er wordt geen nieuw “sent” bericht in `whatsapp_messages` geschreven**, dus de UI heeft niets om te tonen. Het voelt alsof er “niks gebeurt”.

### 3) Waarom chats van “een ander nummer” soms niet verschijnen
De chatlijst (`useWhatsAppChats`) haalt chats niet uit de database, maar uit de externe MCP tool:
- `useWhatsAppChats` → `mcp-proxy` → `tool: whatsapp_get_chats` → standaard route: forward naar `mcp.abcito.io`.

Maar inkomende berichten worden door `whatsapp-bridge` in de **database** gezet (message.received pad).
Als de externe MCP bron niet exact dezelfde data (of timing) heeft, krijg je:
- in DB staat de chat wél,
- maar in de UI-lijst (MCP) verschijnt hij niet (of pas later).

Dit verklaart jouw observatie: “als ik vanuit een ander nummer app, zie ik chats niet verschijnen”.

---

## Doel van de fix
1) Na verzenden moet je direct een “uitgaand bericht” zien in de chat (eventueel eerst als “pending”, daarna “sent”).
2) Nieuwe inkomende chats moeten betrouwbaar in de chatlijst verschijnen (op basis van dezelfde bron als de message view: de database).
3) De “hang” moet UX-technisch netjes worden afgehandeld: duidelijke feedback + timeouts + foutmelding.

---

## Implementatie-aanpak (wat ik ga aanpassen)

### A) Chatlijst consistent maken: `whatsapp_get_chats` uit de database serveren
**Probleem nu:** chatlijst komt van externe MCP, messages komen uit DB → inconsistent.

**Oplossing:**
- In de backendfunctie `mcp-proxy` voeg ik een speciale route toe:
  - Als `tool === "whatsapp_get_chats"`: niet doorsturen naar `mcp.abcito.io`, maar intern chats ophalen uit `whatsapp_chats` + join naar `whatsapp_contacts` (zelfde als de bestaande `handleGetChats` logica).
- Belangrijk: dit moet veilig per gebruiker:
  - We gebruiken de bestaande JWT-check in UI mode.
  - Daarna filteren we chats op org(s) waar de gebruiker toegang toe heeft (bijv. via `user_organizations`), zodat niemand chats van andere organisaties ziet.

**Resultaat:**
- Chatlijst update realtime/consistent met de database (en dus met inkomende webhooks).

### B) Uitgaande berichten wél opslaan in de database (zodat ze zichtbaar worden)
**Probleem nu:** `message.send` levert wel af via relay, maar er is geen DB insert.

**Oplossing:**
- In `whatsapp-bridge` bij `event: "message.send"`:
  1. Valideer `data.to` en `data.body` (hard fail met duidelijke 400 als ontbreekt).
  2. Zorg dat session/contact/chat bestaan of maak ze aan (voor uitgaand verkeer moet je ook een chat kunnen “materialiseren”).
  3. Insert een record in `whatsapp_messages` met:
     - `sender_type = "user"`
     - `status = "pending"` (of direct `"sent"` als relay meteen success teruggeeft)
     - `message_body = body`
     - `sent_at = now()`
     - een lokale `message_id` (bijv. `client_<timestamp>` of `sent_<timestamp>`) zodat de UI iets kan key’en
  4. Update `whatsapp_chats.last_message_at` en `last_message_preview`.

**Resultaat:**
- Na verzenden verschijnt direct een bubble (minimaal “sent/pending”), dus geen “niks gebeurd” gevoel.

### C) UX: Optimistic UI + duidelijke feedback + timeout
Zelfs met DB-opslag blijft een netwerkcall soms 10–15s duren. We maken dat gebruikersvriendelijk:

1) **Optimistic update in de frontend** (bij verzenden):
   - Zodra gebruiker op “Send” drukt: voeg onmiddellijk een tijdelijk bericht toe aan de React Query cache voor `['whatsapp-messages', chatId]`.
   - Toon status “Bezig met verzenden…”.
   - Als backend succesvol: markeer status “Verzonden”.
   - Als backend faalt: markeer status “Mislukt” + “opnieuw proberen” knop.

2) **Timeout handling in backend**:
   - In `whatsapp-bridge` rond de relay `fetch()` voeg ik een `AbortController` timeout toe (bijv. 12s).
   - Bij timeout: return 504 met een nette fouttekst (“Relay niet bereikbaar / te traag”).

3) **Timeout handling in frontend** (optioneel extra):
   - Als `mutateAsync` langer dan X seconden duurt, toon een toast “Het duurt langer dan normaal…”, maar laat het proces doorlopen.

### D) Diagnostiek: logging en correlatie
Om dit soort issues sneller te debuggen:
- Voeg in `mcp-proxy` en `whatsapp-bridge` een herkenbare `requestId` toe aan logs en (veilig) teruggeven in response, zodat we UI → proxy → bridge → relay kunnen volgen.

---

## Controle / Validatie (acceptatiecriteria)

### 1) End-to-end test (handmatig)
- Open WhatsApp-scherm → selecteer chat → verstuur “test”.
- Verwacht:
  - Binnen 0–1s verschijnt een uitgaande bubble (pending/sent).
  - Binnen enkele seconden status “sent” (afhankelijk van relay).
  - Geen “hang zonder resultaat”.

### 2) Inkomend bericht vanaf ander nummer
- Stuur vanaf een ander nummer een bericht naar de WhatsApp die gekoppeld is aan de relay.
- Verwacht:
  - Nieuwe chat verschijnt in chatlijst binnen korte tijd (zonder refresh-hacks).
  - Bericht verschijnt in chatdetail (DB insert via message.received).

### 3) Foutscenario’s
- Relay token fout / relay down:
  - UI toont foutmelding (toast) + berichtstatus “mislukt”.
  - Geen “blijvend draaien”.

---

## Risico’s en aandachtspunten
- **Autorisatie/organisatie-scheiding**: als we `whatsapp_get_chats` uit de database serveren met elevated access, moeten we strikt filteren op org(s) van de ingelogde gebruiker.
- **Datamodel**: uitgaande messages moeten aan een chat gekoppeld worden. Als er chats bestaan met `chat_jid = "unknown"`, moeten we daar robuust mee omgaan (liefst normaliseren/vermijden).
- **Dubbele berichten**: als later ook een `message.sent` webhook binnenkomt, moeten we dubbel-insert voorkomen (idempotency op `message_id` of een dedupe-strategie).

---

## Bestandslijst (wat ik ga wijzigen)
- `supabase/functions/mcp-proxy/index.ts`
  - Special-case routing voor `whatsapp_get_chats` (DB-based) met org-filter
- `supabase/functions/whatsapp-bridge/index.ts`
  - `message.send` handler: DB insert + chat update + relay timeout
- `src/hooks/whatsapp/useWhatsAppSendMessage.ts`
  - (optioneel) extra feedback / error details
- `src/components/whatsapp/WhatsAppChatDetail.tsx`
  - Optimistic UI: direct message bubble + status updates

