

# Plan: VPS Webhook Specificatie Opslaan

## Doel
Opslaan van de complete VPS WhatsApp Relay webhook specificatie als documentatie in de repository.

## Bestand
**`docs/VPS_WEBHOOK_SPEC.md`**

## Inhoud
Het document zal bevatten:

1. **Header met doel en endpoint informatie**
2. **Authenticatie vereisten** (x-api-key header)
3. **Alle webhook event types** met JSON voorbeelden:
   - `message.received` (tekst + media)
   - `message.ack` (read receipts)
   - `message.typing` (typing indicator)
   - `session.connected` / `session.disconnected`
   - `session.qr`
4. **Technische vereisten** (timestamps, orgId, JID formaten)
5. **Testen sectie** met cURL voorbeelden

## Technische Details
- Markdown formaat voor leesbaarheid
- Code blocks met JSON syntax highlighting
- Tabellen voor overzichtelijke referentie

## Actie
Nieuw bestand aanmaken: `docs/VPS_WEBHOOK_SPEC.md`

