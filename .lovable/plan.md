

# WhatsAppContactName Component - Implementatie Plan

## Overzicht

Maak een herbruikbare naam component met inline editing voor WhatsApp contacten. Gebruikers kunnen contactnamen aanpassen en resetten naar de originele WhatsApp naam.

## Componenten Te Maken

### 1. WhatsAppContactName Component

**Bestand:** `src/components/whatsapp/WhatsAppContactName.tsx`

**Props Interface:**
```typescript
interface WhatsAppContactNameProps {
  contactId: string;
  displayName: string | null;
  pushName: string | null;
  phoneNumber: string;
  editable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

**Size Mapping:**
| Size | Text Class | Line Height |
|------|------------|-------------|
| sm   | text-sm    | leading-tight |
| md   | text-base  | leading-normal |
| lg   | text-lg    | leading-relaxed |

**Weergave Logica:**
```text
┌────────────────────────────────────────────────────────┐
│  Jan de Vries  ✏️                                      │
│  (WhatsApp: Jan)         ← alleen als verschilt        │
└────────────────────────────────────────────────────────┘
```

**Component States:**
```text
Normale State:
┌──────────────────────────────────────┐
│  [Naam tekst] [Edit icoon]           │
│  (WhatsApp: {pushName})              │
└──────────────────────────────────────┘

Edit State:
┌──────────────────────────────────────┐
│  [Input field met huidige naam]      │
│  [Reset naar WhatsApp naam] (link)   │
└──────────────────────────────────────┘
```

**Gedrag:**
- **Klik op naam of edit icoon:** Input field verschijnt
- **Input field:** Focus automatisch, tekst is geselecteerd
- **Enter:** Opslaan
- **Escape:** Annuleren
- **Blur:** Opslaan
- **"Reset naar WhatsApp naam":** Zet display_name naar null

### 2. useUpdateContactName Hook

**Bestand:** `src/hooks/whatsapp/useUpdateContactName.ts`

**Interface:**
```typescript
interface UpdateContactNameParams {
  contactId: string;
  displayName: string | null;
}
```

**Implementatie:**
```typescript
export function useUpdateContactName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, displayName }: UpdateContactNameParams) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ display_name: displayName })
        .eq('id', contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate relevante queries
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contact'] });
      toast.success('Naam bijgewerkt');
    },
    onError: (error) => {
      console.error('Failed to update contact name:', error);
      toast.error('Kon naam niet bijwerken');
    },
  });
}
```

### 3. Component Integratie

**WhatsAppChatDetail.tsx (Regel 131-134):**

Vervang:
```tsx
<div className="flex-1 min-w-0">
  <h2 className="font-medium text-foreground truncate">{displayName}</h2>
  <p className="text-sm text-muted-foreground truncate">{formatPhone(phoneNumber)}</p>
</div>
```

Met:
```tsx
<div className="flex-1 min-w-0">
  <WhatsAppContactName
    contactId={chat.contact?.id || ''}
    displayName={chat.contact?.display_name}
    pushName={chat.contact?.push_name}
    phoneNumber={chat.contact?.phone_number || 'Onbekend'}
    editable={!!chat.contact?.id}
    size="md"
  />
  <p className="text-sm text-muted-foreground truncate">{formatPhone(phoneNumber)}</p>
</div>
```

**WhatsAppChatItem.tsx:** Geen wijziging nodig - naam blijft read-only in de lijst.

## Technische Details

### WhatsAppContactName Component Structuur

```tsx
export function WhatsAppContactName({
  contactId,
  displayName,
  pushName,
  phoneNumber,
  editable = false,
  size = 'md',
}: WhatsAppContactNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const updateName = useUpdateContactName();
  
  // Displayed name: displayName || pushName || phoneNumber
  const currentName = displayName || pushName || phoneNumber;
  
  // Show WhatsApp name hint if displayName differs from pushName
  const showPushNameHint = displayName && pushName && displayName !== pushName;
  
  // Show reset option if displayName is set (user changed it)
  const canReset = displayName !== null;
  
  const startEditing = () => {
    if (!editable) return;
    setEditValue(currentName);
    setIsEditing(true);
  };
  
  const saveEdit = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== currentName) {
      updateName.mutate({ contactId, displayName: trimmedValue });
    }
    setIsEditing(false);
  };
  
  const cancelEdit = () => {
    setIsEditing(false);
  };
  
  const resetToWhatsAppName = () => {
    updateName.mutate({ contactId, displayName: null });
    setIsEditing(false);
  };
  
  // Focus and select text when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };
  
  // Size classes
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base font-medium',
    lg: 'text-lg font-medium',
  };
  
  if (isEditing) {
    return (
      <div className="space-y-1">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm"
          disabled={updateName.isPending}
        />
        {canReset && (
          <button
            type="button"
            onClick={resetToWhatsAppName}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset naar WhatsApp naam
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 group">
        <span className={cn(sizeClasses[size], "truncate")}>
          {currentName}
        </span>
        {editable && (
          <button
            onClick={startEditing}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Naam bewerken"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      {showPushNameHint && (
        <p className="text-xs text-muted-foreground">
          (WhatsApp: {pushName})
        </p>
      )}
    </div>
  );
}
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| CREATE | `src/components/whatsapp/WhatsAppContactName.tsx` | Naam component met inline editing |
| CREATE | `src/hooks/whatsapp/useUpdateContactName.ts` | Mutation hook voor naam updates |
| EDIT | `src/components/whatsapp/WhatsAppChatDetail.tsx` | Integreer WhatsAppContactName |

## Belangrijke Features

1. **Inline Editing:**
   - Klik op naam of pencil icoon om te bewerken
   - Enter = opslaan, Escape = annuleren
   - Blur = opslaan

2. **WhatsApp Naam Hint:**
   - Toont "(WhatsApp: {pushName})" als displayName anders is
   - Helpt gebruiker te zien wat de originele naam was

3. **Reset Functie:**
   - "Reset naar WhatsApp naam" link in edit mode
   - Zet display_name naar null
   - Alleen zichtbaar als displayName is ingesteld

4. **Loading State:**
   - Input is disabled tijdens mutatie
   - Optimistic updates via react-query

## Test Na Implementatie

1. Open een chat in `/whatsapp`
2. Hover over contactnaam → pencil icoon verschijnt
3. Klik op naam → input field opent
4. Typ nieuwe naam → Enter → toast "Naam bijgewerkt"
5. Controleer dat "(WhatsApp: ...)" hint verschijnt
6. Klik "Reset naar WhatsApp naam" → naam reset
7. Test Escape om te annuleren

