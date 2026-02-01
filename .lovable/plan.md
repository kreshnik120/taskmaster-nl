

# WhatsApp Contacten Zoekfunctie - Implementatieplan

## Overzicht

Deze feature voegt een geavanceerde zoekfunctie toe waarmee gebruikers WhatsApp contacten kunnen zoeken op naam of telefoonnummer. Zoekresultaten tonen als overlay boven de chatlijst.

---

## Architectuur

```text
┌────────────────────────────────────────────────┐
│            WhatsAppChatList.tsx                │
│  ┌──────────────────────────────────────────┐  │
│  │    Zoekbalk (bestaand, uitbreiden)       │  │
│  │    - placeholder: "Zoek contact..."      │  │
│  │    - onFocus: contactSearchMode = true   │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │    WhatsAppContactSearchResults (NEW)    │  │
│  │    - Absolute overlay                     │  │
│  │    - Toont bij query.length >= 2         │  │
│  │    - ESC/click-outside sluit             │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │    Bestaande chat lijst (virtuoso)       │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

---

## Nieuwe Bestanden

### 1. `src/hooks/whatsapp/useSearchContacts.ts`

Hook voor het zoeken van contacten met debouncing:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { WhatsAppContact } from "@/types/whatsapp";

interface UseSearchContactsOptions {
  query: string;
  enabled?: boolean;
}

export function useSearchContacts({ query, enabled = true }: UseSearchContactsOptions) {
  // Debounce de query met 300ms
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  
  // Alleen zoeken als query >= 2 karakters
  const shouldSearch = enabled && debouncedQuery.length >= 2;

  return useQuery({
    queryKey: ['whatsapp-contact-search', debouncedQuery],
    queryFn: async (): Promise<WhatsAppContact[]> => {
      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .or(`display_name.ilike.%${debouncedQuery}%,phone_number.ilike.%${debouncedQuery}%`)
        .order('display_name', { ascending: true, nullsFirst: false })
        .limit(20);

      if (error) {
        console.error('[useSearchContacts] Error:', error);
        throw error;
      }

      return data || [];
    },
    enabled: shouldSearch,
    staleTime: 60000, // 1 minuut cache
  });
}
```

---

### 2. `src/components/whatsapp/WhatsAppContactSearchResults.tsx`

Overlay component voor zoekresultaten:

```typescript
interface WhatsAppContactSearchResultsProps {
  results: WhatsAppContact[];
  isLoading: boolean;
  searchQuery: string;
  onSelectContact: (contact: WhatsAppContact) => void;
  onClose: () => void;
}
```

**Features:**
- Absolute positioned overlay onder zoekbalk
- Skeleton loading state
- Empty state bij geen resultaten
- Per resultaat: avatar, naam, telefoonnummer
- Hover/focus states voor keyboard navigatie
- Click handler roept `onSelectContact` aan

**UI Layout per resultaat:**
```text
┌─────────────────────────────────────┐
│  [Avatar]  Jan Jansen               │
│            +31 6 12345678           │
│            ✓ Business account       │
└─────────────────────────────────────┘
```

---

## Bestaande Bestanden Aanpassen

### 3. Update `src/components/whatsapp/WhatsAppChatList.tsx`

**Wijzigingen:**
1. Voeg state toe voor contact search mode
2. Integreer `useSearchContacts` hook
3. Toon `WhatsAppContactSearchResults` overlay bij actieve zoekquery

```typescript
// Nieuwe imports
import { useSearchContacts } from "@/hooks/whatsapp/useSearchContacts";
import { WhatsAppContactSearchResults } from "./WhatsAppContactSearchResults";

// Nieuwe props
interface WhatsAppChatListProps {
  // ... bestaande props ...
  onSelectContact: (contact: WhatsAppContact) => void;  // NIEUW
}

// In component
const [isContactSearchMode, setIsContactSearchMode] = useState(false);
const { data: searchResults, isLoading: isSearching } = useSearchContacts({
  query: searchQuery,
  enabled: isContactSearchMode
});

const showContactResults = isContactSearchMode && 
                           searchQuery.length >= 2;
```

**Placeholder update:**
```typescript
<Input
  placeholder={isContactSearchMode 
    ? "Zoek contact op naam of nummer..." 
    : "Zoek in gesprekken..."}
  onFocus={() => setIsContactSearchMode(true)}
  // ...
/>
```

---

### 4. Update `src/pages/WhatsApp.tsx`

**Wijzigingen:**
1. Voeg `handleSelectContact` callback toe
2. Logica voor openen/aanmaken van chat met geselecteerd contact

```typescript
// Nieuwe functie om contact te selecteren
const handleSelectContact = useCallback(async (contact: WhatsAppContact) => {
  // Zoek bestaande chat met dit contact
  const existingChat = chats.find(c => c.contact_id === contact.id);
  
  if (existingChat) {
    // Open bestaande chat
    handleSelectChat(existingChat.id);
  } else {
    // Toon melding dat er nog geen chat bestaat
    toast.info(`Start een gesprek met ${contact.display_name || contact.phone_number}`);
    // Optioneel: stuur naar nieuwe chat creatie flow
  }
}, [chats, handleSelectChat]);
```

---

## User Experience Flow

```text
1. Gebruiker typt in zoekbalk
   │
   ├─── < 2 karakters → Geen overlay, normale chat filtering
   │
   └─── >= 2 karakters → Overlay toont met:
        │
        ├─── Loading state (skeleton)
        │
        ├─── Zoekresultaten (0-20 contacten)
        │    │
        │    ├─── Click op contact → Open/maak chat
        │    │
        │    └─── Enter op eerste resultaat → Open/maak chat
        │
        └─── ESC of click buiten overlay → Sluit overlay
```

---

## Keyboard Navigatie

| Toets | Actie |
|-------|-------|
| Arrow Down/Up | Navigeer door resultaten |
| Enter | Selecteer gefocust resultaat |
| Escape | Sluit zoekresultaten |
| Cmd/Ctrl+F | Focus zoekbalk (bestaand) |

---

## Implementatie Stappen

| # | Taak | Bestand |
|---|------|---------|
| 1 | Maak `useSearchContacts` hook | `src/hooks/whatsapp/useSearchContacts.ts` |
| 2 | Maak `WhatsAppContactSearchResults` component | `src/components/whatsapp/WhatsAppContactSearchResults.tsx` |
| 3 | Update `WhatsAppChatList` met search integration | `src/components/whatsapp/WhatsAppChatList.tsx` |
| 4 | Update `WhatsApp.tsx` met contact selectie handler | `src/pages/WhatsApp.tsx` |

---

## Technische Details

### Database Query
```sql
SELECT *
FROM whatsapp_contacts
WHERE display_name ILIKE '%query%'
   OR phone_number ILIKE '%query%'
ORDER BY display_name ASC NULLS LAST
LIMIT 20;
```

### Performance Overwegingen
- **Debounce**: 300ms om database load te beperken
- **Limit**: Max 20 resultaten per zoekopdracht
- **Stale time**: 1 minuut cache om herhaalde zoekopdrachten te versnellen
- **Conditional query**: Query alleen uitvoeren bij >= 2 karakters

