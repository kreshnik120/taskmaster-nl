

# Plan: Toevoegen van `whatsapp_jid` kolom aan `whatsapp_contacts` tabel

## Probleem
De Edge Function `whatsapp-bridge` probeert de kolom `whatsapp_jid` te gebruiken, maar deze bestaat niet in de `whatsapp_contacts` tabel. Dit veroorzaakt de foutmelding:

> Could not find the 'whatsapp_jid' column of 'whatsapp_contacts' in the schema cache

## Huidige situatie
De tabel heeft alleen `phone_number` voor identificatie, maar de code verwacht ook `whatsapp_jid` voor:
- Volledige WhatsApp JID opslag (`31612345678@s.whatsapp.net`)
- Groep JID opslag (`123456789@g.us`)
- Lookup van bestaande groepen via JID

## Oplossing
We voegen de `whatsapp_jid` kolom toe aan de `whatsapp_contacts` tabel.

## Implementatie

### Stap 1: Database Migratie
Voer een SQL migratie uit om de kolom toe te voegen:

```text
-- Add whatsapp_jid column to whatsapp_contacts
ALTER TABLE public.whatsapp_contacts 
ADD COLUMN whatsapp_jid TEXT;

-- Create index for efficient lookups (used by group chat logic)
CREATE INDEX idx_whatsapp_contacts_jid_session 
ON public.whatsapp_contacts(session_id, whatsapp_jid);

-- Backfill existing contacts with JID based on phone_number
UPDATE public.whatsapp_contacts 
SET whatsapp_jid = phone_number || '@s.whatsapp.net'
WHERE whatsapp_jid IS NULL 
AND phone_number NOT LIKE 'group-%';

-- Backfill group contacts (phone_number starts with 'group-')
UPDATE public.whatsapp_contacts 
SET whatsapp_jid = REPLACE(phone_number, 'group-', '') || '@g.us'
WHERE whatsapp_jid IS NULL 
AND phone_number LIKE 'group-%';
```

### Stap 2: Verificatie
Na de migratie:
1. Controleer dat de kolom bestaat
2. Test de whatsapp-bridge Edge Function opnieuw
3. Verwacht: berichten worden nu correct verwerkt

## Voordelen
- Volledige JID opslag (inclusief @s.whatsapp.net of @g.us suffix)
- Betere groepschat ondersteuning
- Backwards compatible met bestaande data

## Impact
- Minimale impact: alleen een kolom toevoegen
- Bestaande data blijft intact
- Edge Function werkt direct na migratie

