# WhatsApp Groepsleden Module - VOLTOOID ✅

## Implementatiestatus

| Stap | Status | Detail |
|------|--------|--------|
| 1. Database tabel | ✅ | `whatsapp_group_members` aangemaakt met RLS |
| 2. Backfill data | ✅ | 4 leden geïmporteerd uit bestaande berichten |
| 3. Edge function | ✅ | `upsertGroupMember()` toegevoegd aan whatsapp-bridge |
| 4. React hook | ✅ | `useWhatsAppGroupMembers` gemaakt |
| 5. UI component | ✅ | `WhatsAppGroupProfile` gemaakt |
| 6. Profiel switcher | ✅ | WhatsApp.tsx toont juiste profiel op basis van chat_type |

## Gebackfillde Groepsleden

| Groep | Leden |
|-------|-------|
| Shkelzen | 🙏, K, . |
| Simon de Jong | Simon de Jong |

## Nieuwe Bestanden

- `src/hooks/whatsapp/useWhatsAppGroupMembers.ts`
- `src/components/whatsapp/WhatsAppGroupProfile.tsx`

## Gewijzigde Bestanden

- `supabase/functions/whatsapp-bridge/index.ts` - `upsertGroupMember()` helper
- `src/types/whatsapp.ts` - `WhatsAppGroupMember` interface
- `src/pages/WhatsApp.tsx` - Profiel switcher logica

