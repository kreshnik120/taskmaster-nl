

# BENDY-REQ-7B: Verwijder flex_user_companies uit include parameter

## Wijziging

**Bestand:** `supabase/functions/_shared/bendy-sync-users.ts`, regel 30

```typescript
// WAS:
{ include: 'groups,company,flex_user_companies' }

// WORDT:
{ include: 'groups,company' }
```

Eén regel, geen andere wijzigingen. Deploy edge function na implementatie.

