

# WhatsApp Inbox Module - Volledig Implementatie Plan (v2)

## Overzicht

Enterprise WhatsApp Inbox module met 2-koloms responsive layout, realtime messaging, professional linking, en volledige accessibility ondersteuning.

---

## Database Status & Migration

### Huidige Database Status
- `whatsapp_chats` - Bestaat, mist `linked_professional_id`
- `whatsapp_messages` - Bestaat, realtime al enabled
- `whatsapp_contacts` - Bestaat, heeft `professional_id` kolom
- RLS policies - Al geconfigureerd voor org_id scoping
- Realtime - Al enabled voor beide tabellen

### Migration: linked_professional_id toevoegen

```sql
-- Add linked_professional_id to whatsapp_chats
ALTER TABLE public.whatsapp_chats
ADD COLUMN linked_professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Index for efficient queries
CREATE INDEX idx_whatsapp_chats_linked_professional 
ON public.whatsapp_chats(linked_professional_id);
```

**NIET nodig (al geconfigureerd):**
- Realtime voor whatsapp_chats (al enabled)
- Realtime voor whatsapp_messages (al enabled)
- RLS UPDATE policy (bestaat al: "Users can update own org chats")

---

## Nieuwe Bestanden Overzicht

| # | Bestand | Type | Functie |
|---|---------|------|---------|
| 1 | `src/hooks/whatsapp/useWhatsAppChats.ts` | Hook | Chats met filters, zoek, realtime |
| 2 | `src/hooks/whatsapp/useWhatsAppMessages.ts` | Hook | Berichten per chat, mark-as-read |
| 3 | `src/hooks/whatsapp/useWhatsAppUnreadCount.ts` | Hook | Globale unread count voor sidebar |
| 4 | `src/hooks/whatsapp/useLinkProfessional.ts` | Hook | Mutation voor koppeling |
| 5 | `src/components/whatsapp/WhatsAppChatList.tsx` | Component | Linker kolom: lijst + zoek + filters |
| 6 | `src/components/whatsapp/WhatsAppChatDetail.tsx` | Component | Rechter kolom: berichten + acties |
| 7 | `src/components/whatsapp/WhatsAppChatItem.tsx` | Component | Individueel chat list item |
| 8 | `src/components/whatsapp/WhatsAppMessageBubble.tsx` | Component | Bericht weergave |
| 9 | `src/components/whatsapp/WhatsAppEmptyState.tsx` | Component | Empty state geen chat geselecteerd |
| 10 | `src/components/whatsapp/WhatsAppLinkedBanner.tsx` | Component | Gekoppelde professional banner |
| 11 | `src/components/whatsapp/WhatsAppFilterTabs.tsx` | Component | Tabs: Alle / Ongelezen / Gekoppeld |
| 12 | `src/components/whatsapp/WhatsAppProfessionalDropdown.tsx` | Component | Dropdown voor professional koppeling |
| 13 | `src/components/whatsapp/WhatsAppSkeletonLoader.tsx` | Component | Skeleton loading states |
| 14 | `src/components/whatsapp/WhatsAppStatusIcon.tsx` | Component | Herbruikbare status icons |
| 15 | `src/pages/WhatsApp.tsx` | Page | Hoofdpagina met responsive layout |

---

## Bestaande Bestanden Wijzigen

| # | Bestand | Wijziging |
|---|---------|-----------|
| 1 | `src/components/AppSidebar.tsx` | WhatsApp menu item + badge |
| 2 | `src/App.tsx` | Routes toevoegen |

---

## Gedetailleerde Component Specificaties

### 1. WhatsAppFilterTabs.tsx

```typescript
interface WhatsAppFilterTabsProps {
  filter: 'all' | 'unread' | 'linked';
  onFilterChange: (filter: 'all' | 'unread' | 'linked') => void;
  unreadCount: number;
}
```

UI Structuur:
- Radix Tabs component
- 3 tabs: "Alle", "Ongelezen (n)", "Gekoppeld"
- Badge op Ongelezen tab met count
- `aria-label="Filter chats"`

### 2. WhatsAppProfessionalDropdown.tsx

```typescript
interface WhatsAppProfessionalDropdownProps {
  chatId: string;
  currentProfessionalId: string | null;
  onLink: (professionalId: string) => void;
}
```

Features:
- Zoekbaar dropdown met professionals
- Haalt professionals op uit database
- Toont gekoppelde professional indien aanwezig
- "Ontkoppelen" optie

### 3. WhatsAppSkeletonLoader.tsx

```typescript
// Chat list skeleton
export function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
}

// Message skeleton
export function MessageSkeleton() { ... }
```

### 4. WhatsAppStatusIcon.tsx

```typescript
type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'received';

interface WhatsAppStatusIconProps {
  status: MessageStatus;
  className?: string;
}

// Rendert:
// pending: Clock icon (gray)
// sent: Single Check (gray)
// delivered: Double Check (gray)  
// read: Double Check (blue #53bdeb)
// received: geen icon (inkomend bericht)
```

---

## Hooks Specificaties

### useWhatsAppChats.ts

```typescript
interface UseWhatsAppChatsReturn {
  chats: WhatsAppChat[];
  isLoading: boolean;
  error: Error | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filter: 'all' | 'unread' | 'linked';
  setFilter: (f: 'all' | 'unread' | 'linked') => void;
  stats: {
    totalChats: number;
    unreadChats: number;
    linkedChats: number;
  };
}
```

Query met org_id filtering via `get_user_whatsapp_org_id()` functie (bestaand).

### useWhatsAppMessages.ts (met mark-as-read)

```typescript
export function useWhatsAppMessages(chatId: string | null) {
  const query = useQuery({ ... });

  // Auto mark-as-read wanneer chat geopend wordt
  useEffect(() => {
    if (!chatId) return;
    
    // Update unread_count naar 0
    supabase
      .from('whatsapp_chats')
      .update({ unread_count: 0 })
      .eq('id', chatId);
  }, [chatId]);

  // Groepeer berichten per dag
  const groupedByDate = useMemo(() => {
    return groupMessagesByDate(query.data ?? []);
  }, [query.data]);

  return { messages: query.data ?? [], isLoading: query.isLoading, groupedByDate };
}
```

---

## Responsive Layout Specificaties

### Breakpoints (gecorrigeerd per feedback)

| Breakpoint | Chat List Width | Chat Detail | Navigatie |
|------------|-----------------|-------------|-----------|
| Mobile (<768px) | 100% (full screen) | 100% (full screen) | Route-based |
| Tablet (768-1023px) | **380px** (was 300px) | flex-1 | Side-by-side |
| Desktop (≥1024px) | 380px | flex-1 | Side-by-side |

### CSS Classes

```tsx
// WhatsApp.tsx layout
<div className="flex h-full">
  {/* Chat List - responsive width */}
  <div className={cn(
    "border-r bg-background",
    // Mobile: full width when no chat selected
    "w-full md:w-[380px] md:flex-shrink-0",
    // Hide on mobile when chat is selected
    selectedChatId && "hidden md:block"
  )}>
    <WhatsAppChatList />
  </div>
  
  {/* Chat Detail - fills remaining space */}
  <div className={cn(
    "flex-1 min-w-0",
    // Mobile: only show when chat selected
    !selectedChatId && "hidden md:flex"
  )}>
    {selectedChatId ? <WhatsAppChatDetail /> : <WhatsAppEmptyState />}
  </div>
</div>
```

---

## Accessibility Specificaties (WCAG 2.1 AA)

### Chat List

```tsx
<div 
  role="listbox" 
  aria-label="WhatsApp gesprekken"
  aria-activedescendant={selectedChatId ? `chat-${selectedChatId}` : undefined}
>
  {chats.map(chat => (
    <div
      key={chat.id}
      id={`chat-${chat.id}`}
      role="option"
      aria-selected={selectedChatId === chat.id}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') selectChat(chat.id);
      }}
    >
      <WhatsAppChatItem chat={chat} />
    </div>
  ))}
</div>
```

### Nieuwe Berichten Announcer

```tsx
// In WhatsAppChatDetail
<div 
  role="status" 
  aria-live="polite" 
  aria-atomic="true"
  className="sr-only"
>
  {newMessageAnnouncement}
</div>
```

### Button Labels

```tsx
// Alle buttons met aria-label
<Button aria-label="Koppel aan professional">
  <Link2 className="h-4 w-4" />
  Koppelen
</Button>

<Button aria-label="Ga terug naar chatlijst">
  <ArrowLeft className="h-4 w-4" />
</Button>

<Button aria-label="Meer acties">
  <MoreVertical className="h-4 w-4" />
</Button>
```

---

## AppSidebar.tsx Wijzigingen

### Imports toevoegen

```typescript
import { MessageCircle } from "lucide-react";
import { useWhatsAppUnreadCount } from "@/hooks/whatsapp/useWhatsAppUnreadCount";
```

### Menu item toevoegen (na Dashboard)

```typescript
// In menuGroups array, "Mijn Werk" groep, na Dashboard:
{
  title: "WhatsApp",
  url: "/whatsapp",
  icon: MessageCircle,
  badge: 'whatsappUnreadCount'
}
```

### Badge functie uitbreiden

```typescript
// In CollapsibleGroup, getBadgeCount functie:
if (badgeType === 'whatsappUnreadCount') return whatsappUnreadCount;

// In AppSidebar component:
const whatsappUnreadCount = useWhatsAppUnreadCount();

// Pass to CollapsibleGroup:
whatsappUnreadCount={whatsappUnreadCount}
```

---

## App.tsx Route Toevoegingen

```typescript
// Import
import WhatsApp from "./pages/WhatsApp";

// Routes (binnen Layout element, na /dashboard)
<Route path="/whatsapp" element={<WhatsApp />} />
<Route path="/whatsapp/chat/:chatId" element={<WhatsApp />} />
```

---

## TypeScript Interfaces

```typescript
// src/types/whatsapp.ts

export interface WhatsAppChat {
  id: string;
  org_id: string;
  session_id: string;
  contact_id: string | null;
  chat_jid: string;
  chat_type: 'direct' | 'group';
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  linked_professional_id: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  contact?: WhatsAppContact;
  linked_professional?: { id: string; full_name: string };
}

export interface WhatsAppContact {
  id: string;
  org_id: string;
  session_id: string;
  phone_number: string;
  display_name: string | null;
  professional_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessage {
  id: string;
  org_id: string;
  chat_id: string;
  message_id: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  message_body: string | null;
  sender_type: 'contact' | 'self';
  sender_phone: string | null;
  sent_at: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'received';
  created_at: string;
}

export interface MessageGroup {
  date: Date;
  label: string; // "Vandaag", "Gisteren", "15 januari"
  messages: WhatsAppMessage[];
}
```

---

## Keyboard Shortcuts

```typescript
// In WhatsApp.tsx
useHotkeys([
  ['mod+k', () => focusSearch()],
  ['Escape', () => setSelectedChatId(null)],
  ['ArrowDown', () => selectNextChat()],
  ['ArrowUp', () => selectPreviousChat()],
  ['Enter', () => openSelectedChat()],
]);
```

---

## Implementatie Volgorde

### Fase 1: Foundation
1. Database migration (linked_professional_id)
2. TypeScript interfaces (`src/types/whatsapp.ts`)
3. useWhatsAppUnreadCount hook
4. AppSidebar.tsx update met badge

### Fase 2: Core Hooks
5. useWhatsAppChats hook met realtime
6. useWhatsAppMessages hook met mark-as-read + realtime
7. useLinkProfessional mutation hook

### Fase 3: Utility Components
8. WhatsAppStatusIcon component
9. WhatsAppSkeletonLoader component
10. WhatsAppFilterTabs component
11. WhatsAppProfessionalDropdown component

### Fase 4: Main Components
12. WhatsAppChatItem component
13. WhatsAppMessageBubble component
14. WhatsAppLinkedBanner component
15. WhatsAppEmptyState component

### Fase 5: Layout & Integration
16. WhatsAppChatList component
17. WhatsAppChatDetail component
18. WhatsApp.tsx page met responsive layout
19. App.tsx routes

---

## Samenvatting Wijzigingen

| # | Bestand | Actie |
|---|---------|-------|
| 1 | Database | Migration: linked_professional_id |
| 2 | `src/types/whatsapp.ts` | NIEUW |
| 3 | `src/hooks/whatsapp/useWhatsAppChats.ts` | NIEUW |
| 4 | `src/hooks/whatsapp/useWhatsAppMessages.ts` | NIEUW |
| 5 | `src/hooks/whatsapp/useWhatsAppUnreadCount.ts` | NIEUW |
| 6 | `src/hooks/whatsapp/useLinkProfessional.ts` | NIEUW |
| 7 | `src/components/whatsapp/WhatsAppFilterTabs.tsx` | NIEUW |
| 8 | `src/components/whatsapp/WhatsAppProfessionalDropdown.tsx` | NIEUW |
| 9 | `src/components/whatsapp/WhatsAppSkeletonLoader.tsx` | NIEUW |
| 10 | `src/components/whatsapp/WhatsAppStatusIcon.tsx` | NIEUW |
| 11 | `src/components/whatsapp/WhatsAppChatItem.tsx` | NIEUW |
| 12 | `src/components/whatsapp/WhatsAppMessageBubble.tsx` | NIEUW |
| 13 | `src/components/whatsapp/WhatsAppLinkedBanner.tsx` | NIEUW |
| 14 | `src/components/whatsapp/WhatsAppEmptyState.tsx` | NIEUW |
| 15 | `src/components/whatsapp/WhatsAppChatList.tsx` | NIEUW |
| 16 | `src/components/whatsapp/WhatsAppChatDetail.tsx` | NIEUW |
| 17 | `src/pages/WhatsApp.tsx` | NIEUW |
| 18 | `src/components/AppSidebar.tsx` | WIJZIG |
| 19 | `src/App.tsx` | WIJZIG |

**Totaal: 16 nieuwe bestanden, 2 wijzigingen, 1 database migration**

---

## Acceptatie Criteria

**Functioneel:**
- WhatsApp menu item zichtbaar in sidebar met realtime unread badge
- 2-koloms layout op tablet/desktop (beide 380px chat list)
- Route-based navigatie op mobile
- Chats laden met realtime updates
- Zoeken in chats werkt
- Filter tabs werken (Alle/Ongelezen/Gekoppeld)
- Professional koppeling via dropdown
- Berichten gegroepeerd per dag met dividers
- Status icons correct (pending/sent/delivered/read)
- Auto mark-as-read bij openen chat
- Back button op mobile

**Accessibility:**
- `role="listbox"` op chat lijst
- `role="option"` + `aria-selected` op items
- `aria-label` op alle buttons
- `aria-live="polite"` voor nieuwe berichten
- Keyboard navigatie (pijltjes, Enter, Escape)
- Focus management

**Technisch:**
- Geen TypeScript errors
- Realtime subscriptions correct opgeruimd
- Skeleton loaders tijdens laden
- Error states met retry
- Volgt bestaande patterns

