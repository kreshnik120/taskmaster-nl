

# WhatsApp Contact Profile Panel - Implementatie Plan

## Overzicht

Implementeer een 3-kolom layout met een collapsible Contact Profile sidebar aan de rechterkant. Dit paneel toont contactinformatie, labels, notities en acties.

## Huidige Layout Analyse

```text
HUIDIGE STRUCTUUR (2-kolom):
┌──────────────────────┬────────────────────────────────────┐
│   ChatList (380px)   │         ChatDetail (flex-1)        │
│                      │                                    │
└──────────────────────┴────────────────────────────────────┘

NIEUWE STRUCTUUR (3-kolom):
┌──────────────────────┬────────────────────────────┬─────────────────────┐
│   ChatList (280px)   │     ChatDetail (flex-1)    │ ContactProfile      │
│                      │        min-w-[400px]       │ (320px, collapsible)│
└──────────────────────┴────────────────────────────┴─────────────────────┘
```

## Database Migratie

De `whatsapp_contacts` tabel mist velden voor tags en notities:

```sql
ALTER TABLE whatsapp_contacts 
ADD COLUMN tags TEXT[] DEFAULT '{}',
ADD COLUMN contact_notes TEXT,
ADD COLUMN is_business_account BOOLEAN DEFAULT false;

ALTER TABLE whatsapp_chats
ADD COLUMN is_pinned BOOLEAN DEFAULT false,
ADD COLUMN is_muted BOOLEAN DEFAULT false,
ADD COLUMN is_archived BOOLEAN DEFAULT false;
```

## Nieuwe Componenten

### 1. WhatsAppContactProfile (Hoofd Component)

**Bestand:** `src/components/whatsapp/WhatsAppContactProfile.tsx`

**Props:**
```typescript
interface WhatsAppContactProfileProps {
  chat: WhatsAppChat;
  onClose: () => void;
}
```

**Structuur:**
```text
┌─────────────────────────────────┐
│  [X] Contactprofiel             │  ← Sticky header
├─────────────────────────────────┤
│                                 │
│       [  Avatar XL  ]           │
│       Jan de Vries  ✏️          │
│       +31 6 1234 5678 [📋]      │
│                                 │
├─────────────────────────────────┤
│  📋 INFO                        │
│  WhatsApp: Jan                  │
│  Type: Persoonlijk              │
│  Laatst actief: 14:30           │
├─────────────────────────────────┤
│  🏷️ LABELS                      │
│  [Cliënt] [VIP] [+ Label]       │
├─────────────────────────────────┤
│  📝 NOTITIES                    │
│  ┌───────────────────────────┐  │
│  │ Voeg notities toe...      │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  ⚙️ ACTIES                      │
│  [Toggle] AI antwoorden (disabled)│
│  [📌] Pin chat                  │
│  [🔇] Mute chat                 │
│  [📁] Archiveer                 │
│  ─────────────────────────────  │
│  [🚫] Niet meer contacteren     │
└─────────────────────────────────┘
```

### 2. useWhatsAppContact Hook

**Bestand:** `src/hooks/whatsapp/useWhatsAppContact.ts`

```typescript
export function useWhatsAppContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-contact', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });
}
```

### 3. Layout Wijzigingen

**WhatsApp.tsx:**
- Voeg `showProfile` state toe
- Voeg toggle functie toe
- Responsive 3-kolom layout
- localStorage persistence voor profile state

```typescript
// State
const [showProfile, setShowProfile] = useState(() => {
  return localStorage.getItem('whatsapp-profile-open') === 'true';
});

// Persist
useEffect(() => {
  localStorage.setItem('whatsapp-profile-open', String(showProfile));
}, [showProfile]);

// Toggle
const toggleProfile = () => setShowProfile(prev => !prev);
```

**Nieuwe layout structuur:**
```tsx
<div className="flex h-[calc(100vh-4rem)]">
  {/* Chat List - 280px */}
  <div className="w-[280px] border-r">
    <WhatsAppChatList ... />
  </div>

  {/* Chat Detail - flex-1 min-w-[400px] */}
  <div className="flex-1 min-w-[400px]">
    <WhatsAppChatDetail 
      chat={selectedChat}
      onToggleProfile={toggleProfile}
      showProfileButton={true}
    />
  </div>

  {/* Contact Profile - 320px collapsible */}
  {showProfile && selectedChat && (
    <div className="w-[320px] border-l">
      <WhatsAppContactProfile 
        chat={selectedChat}
        onClose={() => setShowProfile(false)}
      />
    </div>
  )}
</div>
```

### 4. WhatsAppChatDetail Update

Voeg Info toggle knop toe aan header:

```tsx
// Nieuwe prop
interface WhatsAppChatDetailProps {
  chat: WhatsAppChat;
  onBack: () => void;
  showBackButton?: boolean;
  onToggleProfile?: () => void;  // NIEUW
  showProfileButton?: boolean;   // NIEUW
}

// In header actions
{showProfileButton && (
  <Button 
    variant="ghost" 
    size="icon" 
    onClick={onToggleProfile}
    aria-label="Toggle contactprofiel"
  >
    <Info className="h-5 w-5" />
  </Button>
)}
```

### 5. Responsive Gedrag

**Desktop (>1024px):** 3 kolommen side-by-side
**Tablet/Mobile (<1024px):** Sheet/Drawer van rechts

```tsx
// Desktop: inline panel
{showProfile && selectedChat && (
  <div className="hidden lg:block w-[320px] border-l">
    <WhatsAppContactProfile ... />
  </div>
)}

// Mobile: Sheet overlay
<Sheet open={showProfile && !!selectedChat && isMobile} onOpenChange={setShowProfile}>
  <SheetContent side="right" className="w-[320px] p-0">
    <WhatsAppContactProfile ... />
  </SheetContent>
</Sheet>
```

## Profile Secties (Placeholders voor 6.4 en 6.5)

De volgende secties worden als placeholder toegevoegd:

### A. Info Sectie
```tsx
<div className="space-y-2">
  <h4 className="text-sm font-medium text-muted-foreground">Info</h4>
  <div className="space-y-1 text-sm">
    {contact.push_name && (
      <p>WhatsApp: {contact.push_name}</p>
    )}
    <p>Type: {contact.is_business_account ? 'Zakelijk' : 'Persoonlijk'}</p>
    <p>Laatst actief: {formatRelativeTime(chat.last_message_at)}</p>
  </div>
</div>
```

### B. Labels Sectie (Placeholder)
```tsx
<div className="space-y-2">
  <h4 className="text-sm font-medium text-muted-foreground">Labels</h4>
  <p className="text-sm text-muted-foreground italic">
    Labels worden toegevoegd in een volgende update
  </p>
</div>
```

### C. Notities Sectie (Placeholder)
```tsx
<div className="space-y-2">
  <h4 className="text-sm font-medium text-muted-foreground">Notities</h4>
  <Textarea 
    placeholder="Voeg notities toe..."
    className="min-h-[100px]"
    disabled
  />
</div>
```

### D. Acties Sectie
```tsx
<div className="space-y-2">
  <h4 className="text-sm font-medium text-muted-foreground">Acties</h4>
  <div className="space-y-2">
    <Button variant="outline" className="w-full justify-start" disabled>
      <Bot className="h-4 w-4 mr-2" />
      AI antwoorden
    </Button>
    <Button variant="outline" className="w-full justify-start">
      <Pin className="h-4 w-4 mr-2" />
      Pin chat
    </Button>
    <Button variant="outline" className="w-full justify-start">
      <BellOff className="h-4 w-4 mr-2" />
      Mute chat
    </Button>
    <Button variant="outline" className="w-full justify-start">
      <Archive className="h-4 w-4 mr-2" />
      Archiveer
    </Button>
  </div>
</div>
```

## Type Updates

**src/types/whatsapp.ts:**
```typescript
export interface WhatsAppContact {
  // ... bestaande velden
  tags: string[];           // NIEUW
  contact_notes: string | null;  // NIEUW
  is_business_account: boolean;  // NIEUW
}
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| MIGRATE | SQL | Voeg tags, contact_notes, is_business_account, is_pinned, is_muted, is_archived toe |
| CREATE | `src/components/whatsapp/WhatsAppContactProfile.tsx` | Contact profiel sidebar |
| CREATE | `src/hooks/whatsapp/useWhatsAppContact.ts` | Fetch contact data |
| EDIT | `src/pages/WhatsApp.tsx` | 3-kolom layout + profile state |
| EDIT | `src/components/whatsapp/WhatsAppChatDetail.tsx` | Info toggle knop |
| EDIT | `src/types/whatsapp.ts` | Uitbreiden WhatsAppContact interface |

## Implementatie Volgorde

1. **Database migratie** - Nieuwe kolommen toevoegen
2. **Type updates** - WhatsAppContact interface uitbreiden
3. **useWhatsAppContact hook** - Data fetching
4. **WhatsAppContactProfile component** - Profiel sidebar
5. **WhatsAppChatDetail update** - Info knop toevoegen
6. **WhatsApp.tsx update** - 3-kolom layout + responsive Sheet

## Test Na Implementatie

1. Open `/whatsapp` en selecteer een chat
2. Klik op Info icoon in header → profile panel verschijnt
3. Klik nogmaals → panel sluit
4. Ververs pagina → panel state is behouden (localStorage)
5. Resize naar mobile → panel is Sheet/Drawer
6. Avatar en naam zijn groot en bewerkbaar in panel
7. Telefoonnummer heeft copy functionaliteit

