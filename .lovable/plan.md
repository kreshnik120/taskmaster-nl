

# Fix: Phone Number Formaat Mismatch in Profile Picture Handler

## Probleem Analyse

| Bron | Voorbeeld | Format |
|------|-----------|--------|
| VPS stuurt `phone` | `31612345678` | Alleen nummer |
| Database contact (oud) | `31687654321@s.whatsapp.net` | Met JID suffix |
| Database contact (nieuw) | `31615366083` | Alleen nummer |

De database bevat **gemengde formaten** omdat `getOrCreateContact` het `from` veld opslaat zoals het binnenkomt (soms met JID suffix, soms zonder).

## Oplossing

Pas `handleContactProfilePicture` aan om te zoeken met **meerdere formaat-varianten**:

1. Exact zoals ontvangen: `phone`
2. Met JID suffix: `phone@s.whatsapp.net`
3. Met `+` prefix: `+phone`

## Implementatie

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Regels 715-721** - Vervang de huidige query:

```typescript
// 3. Update contact in database - try multiple phone formats
const phoneVariants = [
  phone,
  `${phone}@s.whatsapp.net`,
  `+${phone}`,
  phone.replace('@s.whatsapp.net', ''),
];

// Remove duplicates
const uniquePhones = [...new Set(phoneVariants)];
console.log(`[${requestId}] Searching contacts with phone variants: ${uniquePhones.join(', ')}`);

const { data: updatedContacts, error: updateError } = await supabase
  .from('whatsapp_contacts')
  .update({ profile_picture_url: publicUrl })
  .in('phone_number', uniquePhones)
  .eq('org_id', orgId)
  .select('id');
```

## Bestanden Overzicht

| Actie | Bestand | Regel | Beschrijving |
|-------|---------|-------|--------------|
| EDIT | `supabase/functions/whatsapp-bridge/index.ts` | 715-721 | Multi-format phone lookup |

## Logica Diagram

```text
VPS stuurt: phone = "31612345678"
                ↓
Edge Function genereert varianten:
  ├─ "31612345678"
  ├─ "31612345678@s.whatsapp.net"
  ├─ "+31612345678"
  └─ "31612345678" (na strip suffix - duplicate verwijderd)
                ↓
SQL: UPDATE ... WHERE phone_number IN (...variants...)
                ↓
Vindt match ongeacht opgeslagen formaat ✓
```

## Test Na Implementatie

```bash
ssh root@72.61.155.82
curl -X POST http://localhost:3001/contacts/sync-profile-pictures \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "61f4b1fb-5bcf-46c3-9cd5-5758d5b5c9f6"}'
```

Verwachte log output:
```
[REQ-xxx] Searching contacts with phone variants: 31612345678, 31612345678@s.whatsapp.net, +31612345678
[REQ-xxx] ✅ Profile picture updated for 1 contact(s)
```

