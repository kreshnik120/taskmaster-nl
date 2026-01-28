

# Fix: WhatsApp UI Toont Geen Berichten

## Probleem Gevonden

De gebruiker k.atashi is lid van **2 organisaties** (ABCzorg en CitoZorg), maar de WhatsApp hooks gebruiken `.single()` op `user_organizations`. Dit veroorzaakt HTTP 406 errors:

```
"The result contains 2 rows"  
"Cannot coerce the result to a single JSON object"
```

## Database Status

| Tabel | Records | Status |
|-------|---------|--------|
| whatsapp_chats | 4 | Data aanwezig |
| whatsapp_messages | 4 | Data aanwezig |
| whatsapp_contacts | 4 | Data aanwezig |
| RLS policies | Correct | Geen blokkade |

## Root Cause

```typescript
// useWhatsAppChats.ts, regel 34-38
const { data: userOrg } = await supabase
  .from('user_organizations')
  .select('org_id')
  .eq('user_id', user.id)
  .single();  // ❌ FAALT bij 2+ organisaties
```

## Oplossing

Vervang `.single()` door `.limit(1).maybeSingle()` of haal alle org_ids op en query chats voor ALLE organisaties van de gebruiker.

### Optie A: Eerste org gebruiken (snelle fix)

```typescript
const { data: userOrg } = await supabase
  .from('user_organizations')
  .select('org_id')
  .eq('user_id', user.id)
  .limit(1)
  .maybeSingle();
```

### Optie B: Alle orgs tonen (betere UX)

```typescript
// Haal alle org_ids op
const { data: userOrgs } = await supabase
  .from('user_organizations')
  .select('org_id')
  .eq('user_id', user.id);

const orgIds = userOrgs?.map(o => o.org_id) ?? [];

// Query chats voor alle orgs
const { data } = await supabase
  .from('whatsapp_chats')
  .select(`*, contact:whatsapp_contacts!contact_id (*)`)
  .in('org_id', orgIds)  // ✅ Alle organisaties
  .order('last_message_at', { ascending: false });
```

## Bestanden te Wijzigen

| # | Bestand | Wijziging |
|---|---------|-----------|
| 1 | `src/hooks/whatsapp/useWhatsAppChats.ts` | Vervang `.single()` door multi-org query |
| 2 | `src/hooks/whatsapp/useWhatsAppUnreadCount.ts` | Vervang `.single()` door multi-org query |
| 3 | `src/hooks/whatsapp/useWhatsAppMessages.ts` | Controleren en eventueel fixen |

## Aanbeveling

Ik raad **Optie B** aan: toon chats van ALLE organisaties waar de gebruiker lid van is. Dit geeft een betere gebruikerservaring en voorkomt dat berichten "verdwijnen".

## Implementatie Stappen

1. Update `useWhatsAppChats.ts`:
   - Haal alle org_ids op met array query
   - Gebruik `.in('org_id', orgIds)` filter

2. Update `useWhatsAppUnreadCount.ts`:
   - Som unread counts van alle organisaties

3. Update `useWhatsAppMessages.ts`:
   - Verwijder `.single()` indien aanwezig

4. Test:
   - Verifieer dat alle 4 chats verschijnen
   - Verifieer unread badge in sidebar

## Verwachte Resultaat

Na de fix ziet k.atashi:
- 3 chats van ABCzorg
- 1 chat van CitoZorg
- Totaal 4 unread berichten in sidebar badge

