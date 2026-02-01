# WhatsApp Groepsberichten Sender Data - Fix Geïmplementeerd

## Status: ✅ VOLTOOID

**Datum:** 2026-02-01

---

## Probleem

De `whatsapp-bridge` Edge Function gebruikte verkeerde veldnamen:
- Code verwachtte: `from`, `fromName`  
- VPS stuurt: `senderJid`, `pushName`

---

## Oplossing Geïmplementeerd

### Wijziging in `supabase/functions/whatsapp-bridge/index.ts`

```typescript
// Nu worden BEIDE veldnamen ondersteund:
const { 
  from, fromName,           // Legacy
  senderJid, pushName,      // VPS Spec v1.0
  // ... andere velden
} = data;

// Prioriteer spec-compliant, fallback naar legacy
const effectiveFrom = senderJid || from;
const effectiveFromName = pushName || fromName;
```

### Debug Logging Toegevoegd

```typescript
console.log(`[${requestId}] 🔍 RAW DATA FIELDS:`, {
  from, fromName, senderJid, pushName, isGroup, chatJid, messageId
});
```

---

## Volgende Stappen

1. **Test een nieuw groepsbericht** - stuur een bericht in een groep
2. **Check edge function logs** - zoek naar "🔍 RAW DATA FIELDS"
3. **Verifieer in database:**
   ```sql
   SELECT message_id, sender_jid, sender_name 
   FROM whatsapp_messages 
   WHERE sender_jid IS NOT NULL 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

---

## VPS-zijde Verificatie Nodig

Als `senderJid` nog steeds leeg is in de logs, moet de VPS code worden gecontroleerd:
- Is `senderJid` correct gevuld voor groepsberichten?
- Wordt `pushName` meegegeven?

---

## Bestanden Gewijzigd

| Bestand | Status |
|---------|--------|
| `supabase/functions/whatsapp-bridge/index.ts` | ✅ Updated |
