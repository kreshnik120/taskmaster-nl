
# WhatsApp Contact Notes - Implementatie Plan

## Overzicht

Implementeer een notities sectie in het Contact Profile panel met auto-save functionaliteit, debounce (1000ms), en visuele feedback tijdens opslaan.

## Huidige Situatie

| Component | Status |
|-----------|--------|
| `whatsapp_contacts.contact_notes` kolom | Bestaat (TEXT) |
| WhatsAppContactProfile Notes sectie | Disabled placeholder Textarea |

## Implementatie Stappen

### 1. useUpdateContactNotes Hook

**Bestand:** `src/hooks/whatsapp/useUpdateContactNotes.ts`

```typescript
interface UpdateContactNotesParams {
  contactId: string;
  notes: string | null;
}

export function useUpdateContactNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, notes }: UpdateContactNotesParams) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ contact_notes: notes })
        .eq('id', contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contact'] });
      // Geen toast hier - feedback via save indicator
    },
    onError: (error) => {
      console.error('Failed to update notes:', error);
      toast.error('Kon notities niet opslaan');
    },
  });
}
```

### 2. WhatsAppContactNotes Component

**Bestand:** `src/components/whatsapp/WhatsAppContactNotes.tsx`

**Props:**
```typescript
interface WhatsAppContactNotesProps {
  contactId: string;
  notes: string | null;
  editable?: boolean;
}
```

**Structuur:**
```text
┌─────────────────────────────────────────────────────────┐
│  📝 NOTITIES                           Opgeslagen ✓     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Voeg notities toe over dit contact...           │   │
│  │                                                  │   │
│  │                                                  │   │
│  │                                                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Component Implementatie:**
```tsx
export function WhatsAppContactNotes({ contactId, notes, editable = false }: WhatsAppContactNotesProps) {
  const [value, setValue] = useState(notes || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const updateNotes = useUpdateContactNotes();
  
  // Sync local state when contact changes
  useEffect(() => {
    setValue(notes || '');
    setSaveStatus('idle');
  }, [contactId, notes]);
  
  // Debounced save
  useEffect(() => {
    if (!editable) return;
    
    // Don't save on initial load
    if (value === (notes || '')) {
      return;
    }
    
    setSaveStatus('saving');
    
    const timer = setTimeout(() => {
      const trimmedValue = value.trim();
      updateNotes.mutate(
        { contactId, notes: trimmedValue || null },
        {
          onSuccess: () => setSaveStatus('saved'),
          onError: () => setSaveStatus('idle'),
        }
      );
    }, 1000); // 1 second debounce
    
    return () => clearTimeout(timer);
  }, [value, contactId, editable, notes, updateNotes]);
  
  // Reset "saved" indicator after 2 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          Notities
        </h4>
        {saveStatus !== 'idle' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Opslaan...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Opgeslagen
              </>
            )}
          </span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Voeg notities toe over dit contact..."
        className="min-h-[100px] resize-none"
        disabled={!editable}
      />
    </div>
  );
}
```

### 3. Update WhatsAppContactProfile

Vervang de placeholder Notes sectie (regels 149-159):

**Huidige code:**
```tsx
{/* Notes section - placeholder for 6.5 */}
<div className="px-4 py-4 space-y-2">
  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
    Notities
  </h4>
  <Textarea
    placeholder="Voeg notities toe..."
    className="min-h-[100px] resize-none"
    disabled
  />
</div>
```

**Nieuwe code:**
```tsx
{/* Notes section */}
<div className="px-4 py-4">
  <WhatsAppContactNotes
    contactId={displayContact?.id || ''}
    notes={displayContact?.contact_notes || null}
    editable={!!displayContact?.id}
  />
</div>
```

## Visuele Feedback Flow

```text
Gebruiker typt → "Opslaan..." (met spinner) → 1s wachten → 
API call → "Opgeslagen" (met check) → 2s wachten → indicator verdwijnt
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| CREATE | `src/hooks/whatsapp/useUpdateContactNotes.ts` | Mutation hook voor notes update |
| CREATE | `src/components/whatsapp/WhatsAppContactNotes.tsx` | Notes component met auto-save |
| EDIT | `src/components/whatsapp/WhatsAppContactProfile.tsx` | Integreer notes component |

## Belangrijke Features

1. **Auto-Save met Debounce:**
   - 1000ms debounce na laatste toetsaanslag
   - Voorkomt teveel API calls
   - Geen handmatige "Opslaan" knop nodig

2. **Visuele Feedback:**
   - "Opslaan..." met spinner tijdens saving
   - "Opgeslagen" met checkmark na success
   - Indicator verdwijnt na 2 seconden

3. **Contact Switch Handling:**
   - Reset lokale state wanneer ander contact wordt geselecteerd
   - Voorkomt dat notities van vorig contact zichtbaar blijven

4. **Null Handling:**
   - Lege string wordt als `null` opgeslagen
   - Bespaart ruimte in database

## Test Na Implementatie

1. Open een chat en open het profiel paneel
2. Typ tekst in notities veld → "Opslaan..." verschijnt
3. Stop met typen → na 1 seconde wordt opgeslagen
4. "Opgeslagen" verschijnt → verdwijnt na 2 seconden
5. Ververs pagina → notities zijn behouden
6. Wissel naar andere chat → notities veld is leeg of toont andere notities
7. Wissel terug → originele notities zijn nog steeds zichtbaar
