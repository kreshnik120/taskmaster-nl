
# WhatsApp Groepsleden ↔ Privé Chat Koppeling

## Doel
Groepsleden automatisch linken aan hun directe chats zodat je vanuit het groepsprofiel direct naar een privé gesprek kunt navigeren.

## Huidige Situatie

| Groepslid | member_jid | Directe Chat | Match |
|-----------|------------|--------------|-------|
| K | `260318672515302@lid` | `260318672515302` | ✅ Ja |
| 🙏 | `106949047808041@lid` | - | ❌ Nee |
| . | `131331560333399@lid` | - | ❌ Nee |
| Simon de Jong | `150079176474722@lid` | - | ❌ Nee |

**Conclusie**: De numerieke prefix van `member_jid` (`@lid`) komt overeen met het `phone_number` van directe contacten. "K" heeft zowel een groepslid-record als een privé chat.

---

## Implementatie in 3 Stappen

### Stap 1: Database - Link contact_id en voeg direct_chat_id toe

Update de `whatsapp_group_members` tabel met een extra kolom voor snelle navigatie:

```text
ALTER TABLE whatsapp_group_members
ADD COLUMN direct_chat_id UUID REFERENCES whatsapp_chats(id);

-- Update bestaande leden met hun directe chat
UPDATE whatsapp_group_members gm
SET 
  direct_chat_id = dc.chat_id,
  contact_id = dc.contact_id
FROM (
  SELECT 
    ch.id as chat_id,
    ch.contact_id,
    c.phone_number
  FROM whatsapp_chats ch
  JOIN whatsapp_contacts c ON ch.contact_id = c.id
  WHERE ch.chat_type = 'direct'
) dc
WHERE SPLIT_PART(gm.member_jid, '@', 1) = dc.phone_number;
```

### Stap 2: Edge Function - Auto-link bij nieuwe berichten

Bij elk inkomend groepsbericht: check of de afzender al een directe chat heeft.

```text
Locatie: whatsapp-bridge/index.ts → upsertGroupMember()

Logica:
1. Extract member_number = SPLIT_PART(member_jid, '@', 1)
2. Query: SELECT id, contact_id FROM whatsapp_chats 
          WHERE chat_type = 'direct' 
          AND contact_id IN (SELECT id FROM whatsapp_contacts WHERE phone_number = member_number)
3. Als gevonden: voeg direct_chat_id toe aan upsert
```

### Stap 3: UI - "Open privé chat" knop

Update `WhatsAppGroupProfile.tsx` om een klikbare rij te tonen:

```text
┌────────────────────────────┐
│ DEELNEMERS (4)             │
├────────────────────────────┤
│ [K ] K              💬 ──► │  ← Klikbaar naar privé chat
│ [🙏] 🙏                    │  ← Geen privé chat
│ [. ] .                     │
│ [S ] Simon de Jong         │
└────────────────────────────┘
```

**Gedrag**:
- **Met privé chat**: Toon 💬 icoon, klik navigeert naar `/whatsapp/chat/{direct_chat_id}`
- **Zonder privé chat**: Geen icoon, niet klikbaar (of toon disabled state)

---

## Bestandswijzigingen

| Bestand | Actie | Omschrijving |
|---------|-------|--------------|
| `migrations/xxx_link_group_members.sql` | Nieuw | `direct_chat_id` kolom + backfill |
| `supabase/functions/whatsapp-bridge/index.ts` | Update | Auto-link in `upsertGroupMember()` |
| `src/types/whatsapp.ts` | Update | `direct_chat_id` toevoegen aan interface |
| `src/hooks/whatsapp/useWhatsAppGroupMembers.ts` | Update | Include `direct_chat_id` in select |
| `src/components/whatsapp/WhatsAppGroupProfile.tsx` | Update | Klikbare rij met navigatie |

---

## Technische Details

### Database Migratie

```sql
-- 1. Nieuwe kolom toevoegen
ALTER TABLE whatsapp_group_members
ADD COLUMN direct_chat_id UUID REFERENCES whatsapp_chats(id);

-- 2. Index voor snelle lookups
CREATE INDEX idx_group_members_direct_chat 
ON whatsapp_group_members(direct_chat_id) 
WHERE direct_chat_id IS NOT NULL;

-- 3. Backfill: link bestaande leden aan hun directe chats
UPDATE whatsapp_group_members gm
SET direct_chat_id = matched.chat_id,
    contact_id = matched.contact_id
FROM (
  SELECT 
    ch.id as chat_id,
    ch.contact_id,
    c.phone_number as member_number
  FROM whatsapp_chats ch
  JOIN whatsapp_contacts c ON ch.contact_id = c.id
  WHERE ch.chat_type = 'direct'
) matched
WHERE SPLIT_PART(gm.member_jid, '@', 1) = matched.member_number
  AND gm.direct_chat_id IS NULL;
```

### Edge Function Update

```typescript
// In upsertGroupMember(), na member insert:
async function upsertGroupMember(...) {
  const memberNumber = memberJid.split('@')[0];
  
  // Zoek directe chat voor dit lid
  const { data: directChat } = await supabase
    .from('whatsapp_chats')
    .select('id, contact_id')
    .eq('chat_type', 'direct')
    .eq('org_id', orgId)
    .in('contact_id', 
      supabase.from('whatsapp_contacts')
        .select('id')
        .eq('phone_number', memberNumber)
    )
    .maybeSingle();

  await supabase.from('whatsapp_group_members').upsert({
    chat_id: chatId,
    member_jid: memberJid,
    display_name: displayName,
    direct_chat_id: directChat?.id || null,
    contact_id: directChat?.contact_id || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'chat_id,member_jid' });
}
```

### TypeScript Interface

```typescript
export interface WhatsAppGroupMember {
  // ... bestaande velden
  direct_chat_id: string | null; // Nieuw: link naar privé chat
}
```

### UI Component Update

```typescript
// WhatsAppGroupProfile.tsx
import { MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

// In de render:
{members?.map((member) => (
  <div
    key={member.id}
    className={cn(
      "flex items-center gap-3 p-2 rounded-lg transition-colors",
      member.direct_chat_id 
        ? "hover:bg-muted/50 cursor-pointer" 
        : ""
    )}
    onClick={() => {
      if (member.direct_chat_id) {
        navigate(`/whatsapp/chat/${member.direct_chat_id}`);
        onClose();
      }
    }}
  >
    <WhatsAppContactAvatar ... />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">
        {member.display_name || member.member_jid}
      </p>
    </div>
    {member.direct_chat_id && (
      <MessageCircle className="h-4 w-4 text-muted-foreground" />
    )}
  </div>
))}
```

---

## Verwacht Resultaat

### Voor:
- Groepsleden zijn losse entiteiten zonder link naar privé chats
- Geen manier om vanuit groepsprofiel naar privé gesprek te gaan

### Na:
- "K" toont een 💬 icoon en is klikbaar
- Klikken navigeert direct naar de privé chat met K
- Andere leden zonder privé chat zijn niet klikbaar
- Nieuwe groepsleden worden automatisch gelinkt als ze al een privé chat hebben

---

## Verificatie

```sql
-- Test: Welke groepsleden hebben een privé chat?
SELECT 
  gm.display_name,
  gm.member_jid,
  gm.direct_chat_id IS NOT NULL as has_private_chat,
  c.display_name as contact_name
FROM whatsapp_group_members gm
LEFT JOIN whatsapp_contacts c ON gm.contact_id = c.id
ORDER BY has_private_chat DESC, gm.display_name;
```
