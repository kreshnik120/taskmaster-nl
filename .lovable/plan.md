
# P1 UX Verfijningen: WhatsApp Groepsleden

## Overzicht
Voeg accessibility en UX polish toe aan de groepsleden lijst in het groepsprofiel paneel.

---

## Wijzigingen

### WhatsAppGroupProfile.tsx

**1. Nieuwe imports toevoegen (regel 1-10)**

| Import | Doel |
|--------|------|
| `Tooltip, TooltipContent, TooltipTrigger, TooltipProvider` | Hover tooltip op icoon |
| `useCallback` | Optimalisatie event handlers |
| `WhatsAppGroupMember` type | Typing voor handlers |

**2. Event handlers toevoegen (na regel 48)**

```typescript
const handleMemberClick = useCallback((member: WhatsAppGroupMember) => {
  if (member.direct_chat_id) {
    navigate(`/whatsapp/chat/${member.direct_chat_id}`);
    onClose();
  }
}, [navigate, onClose]);

const handleMemberKeyDown = useCallback((
  e: React.KeyboardEvent,
  member: WhatsAppGroupMember
) => {
  if (member.direct_chat_id && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    navigate(`/whatsapp/chat/${member.direct_chat_id}`);
    onClose();
  }
}, [navigate, onClose]);
```

**3. Member row vervangen (regel 110-151)**

| Verbetering | Implementatie |
|-------------|---------------|
| ARIA labels | `role="button"`, `tabIndex={0}`, `aria-label` |
| Keyboard nav | `onKeyDown` handler voor Enter/Spatie |
| Visuele diff | `opacity-75` voor leden zonder privé chat |
| Klik feedback | `active:scale-[0.98]` animatie |
| Tooltip | Wrapper rond MessageCircle icoon |

```typescript
<TooltipProvider>
  <div className="space-y-1">
    {members?.map((member) => (
      <div
        key={member.id}
        role={member.direct_chat_id ? "button" : undefined}
        tabIndex={member.direct_chat_id ? 0 : undefined}
        aria-label={member.direct_chat_id 
          ? `Open privé gesprek met ${member.display_name || 'contact'}` 
          : undefined}
        className={cn(
          "flex items-center gap-3 p-2 rounded-lg transition-all",
          member.direct_chat_id 
            ? "hover:bg-muted/50 cursor-pointer active:scale-[0.98]" 
            : "opacity-75"
        )}
        onClick={() => handleMemberClick(member)}
        onKeyDown={(e) => handleMemberKeyDown(e, member)}
      >
        {/* Avatar + naam blijft hetzelfde */}
        
        {member.direct_chat_id && (
          <Tooltip>
            <TooltipTrigger asChild>
              <MessageCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Open privé gesprek</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    ))}
  </div>
</TooltipProvider>
```

---

## Bestandswijzigingen

| Bestand | Actie | Regels |
|---------|-------|--------|
| `src/components/whatsapp/WhatsAppGroupProfile.tsx` | Update | Imports, handlers, member row |

---

## Verwacht Resultaat

| Aspect | Voor | Na |
|--------|------|-----|
| Tooltip | Geen | "Open privé gesprek" bij hover |
| Keyboard | Niet navigeerbaar | Tab + Enter/Spatie werkt |
| Screen reader | Geen context | "Open privé gesprek met K" |
| Visuele feedback | Geen | Scale animatie bij klik |
| Differentiatie | Subtiel | Duidelijke opacity voor niet-klikbaar |
