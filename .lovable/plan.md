

# WhatsApp Data Integriteit - Herstelplan

## 📊 Huidige Situatie (Geverifieerd)

### Issue 1: BLOEZEM Chat JID Probleem
| Chat ID | JID Format | Status | Berichten |
|---------|------------|--------|-----------|
| `95649281...` | `26873727819967@lid` (LID) | **Actief** | 2 berichten |
| `f07c22ec...` | `31686861816@s.whatsapp.net` (Standaard) | **Soft-deleted** | 1 bericht |

**Probleem:** De migratie heeft de **verkeerde** chat behouden. De LID-format chat (`@lid`) is actief, terwijl de leesbare standaard-format chat (`@s.whatsapp.net`) is verwijderd. Dit is problematisch omdat:
- LID is een intern WhatsApp ID dat kan veranderen
- Standaard JID bevat het telefoonnummer en is stabieler

### Issue 2: Ontbrekende Profielfoto's
- **56 van 840 contacten** (6.7%) hebben geen profielfoto
- De automatische sync-code is geïmplementeerd maar gebruikt `WHATSAPP_VPS_URL`
- **Status:** `WHATSAPP_VPS_URL` secret **ontbreekt** (alleen `CLAWDBOT_VPS_URL` bestaat)

### Issue 3: Geen Duplicaten Meer
✅ De eerdere migratie heeft alle duplicaten succesvol gemerged - er zijn geen actieve duplicate chats meer per contact.

---

## 🔧 Oplossingsplan

### Stap 1: BLOEZEM Chat Herstellen (KRITIEK)

**Doel:** Behoud de actieve LID-chat maar update de JID naar het standaard formaat, en verplaats het bericht uit de verwijderde chat.

**Aanpak (veilig - geen data verlies):**

```sql
-- A. Update de actieve chat naar standaard JID formaat
UPDATE whatsapp_chats
SET chat_jid = '31686861816@s.whatsapp.net'
WHERE id = '95649281-0d37-490f-9494-236a260e01d4';

-- B. Verplaats het bericht uit de soft-deleted chat naar de actieve chat
UPDATE whatsapp_messages
SET chat_id = '95649281-0d37-490f-9494-236a260e01d4'
WHERE chat_id = 'f07c22ec-33ea-4ee6-bb77-01ac1c2914b6';

-- C. Verwijder nu definitief de lege duplicate chat (was al soft-deleted)
-- (optioneel - kan ook soft-deleted blijven voor audit trail)
```

**Verificatie na uitvoering:**
- BLOEZEM heeft 1 chat met JID `31686861816@s.whatsapp.net`
- Alle 3 berichten zitten in deze ene chat

---

### Stap 2: Profielfoto Sync Repareren

**Probleem:** De code in `fetchProfilePictureForNewContact` zoekt naar:
```typescript
const vpsUrl = Deno.env.get("WHATSAPP_VPS_URL");  // ❌ Bestaat niet
const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");  // ✅ Bestaat
```

**Oplossing - twee opties:**

#### Optie A: Bestaande secret hergebruiken (Aanbevolen)
Pas de code aan om `CLAWDBOT_VPS_URL` te gebruiken (die al bestaat):

```typescript
// Gewijzigde code:
const vpsUrl = Deno.env.get("WHATSAPP_VPS_URL") || Deno.env.get("CLAWDBOT_VPS_URL");
```

#### Optie B: Nieuwe secret toevoegen
Voeg `WHATSAPP_VPS_URL` toe met dezelfde waarde als `CLAWDBOT_VPS_URL`.

---

### Stap 3: Bestaande Contacten Profielfoto's Ophalen

**Doel:** De 56 contacten zonder foto een profielfoto geven.

**Aanpak:**
1. Voeg een admin-endpoint toe aan `whatsapp-bridge` voor handmatige sync trigger
2. Of gebruik de bestaande `syncAllProfilePictures` functie via een API call

**Filtering:** Sla groep-contacten over (phone_number begint met `group-`) en contacten met `unknown` als nummer.

---

## 📋 Implementatievolgorde

| # | Actie | Risico | Rollback |
|---|-------|--------|----------|
| 1 | SQL: Update BLOEZEM chat_jid | Laag | Herstel oude JID |
| 2 | SQL: Verplaats bericht naar actieve chat | Laag | Verplaats terug |
| 3 | Code: Fallback naar CLAWDBOT_VPS_URL | Geen | Revert code |
| 4 | Deploy: Herstart Edge Function | Geen | - |
| 5 | Trigger: Bulk profielfoto sync | Laag | - |

---

## ⚠️ Belangrijke Waarborgen

### Wat wordt NIET aangepast:
- Chat ID's blijven ongewijzigd (berichten blijven gekoppeld)
- Contact ID's blijven ongewijzigd
- Session ID's blijven ongewijzigd
- De `getOrCreateChat` logica die duplicaten voorkomt blijft intact

### Backup-strategie:
- Alle wijzigingen zijn omkeerbaar
- Soft-deleted records blijven beschikbaar
- Berichten worden alleen verplaatst, niet verwijderd

---

## 🧪 Verificatie Stappen

Na implementatie:
1. **BLOEZEM test:** Stuur bericht naar BLOEZEM via telefoon, controleer dat het in dezelfde chat komt
2. **Geen duplicaten:** Query `SELECT contact_id, COUNT(*) FROM whatsapp_chats WHERE deleted_at IS NULL GROUP BY contact_id HAVING COUNT(*) > 1`
3. **Profielfoto's:** Controleer dat nieuwe contacten automatisch een foto krijgen

