

# Fix: Bendy Sync Admin Check — has_role RPC

## Probleem
De admin check op regels 629-639 gebruikt `user_organizations` tabel met verkeerde case. Moet `has_role()` RPC gebruiken, consistent met alle andere edge functions.

## Wijziging -- `supabase/functions/bendy-sync/index.ts`

### Regels 629-639 vervangen

**Van:**
```text
const { data: userOrg } = await adminClient
  .from('user_organizations')
  .select('role')
  .eq('user_id', user.id)
  .in('role', ['admin', 'eigenaar'])
  .limit(1)
  .single();

if (!userOrg) {
  return errorResponse('Admin toegang vereist', 403);
}
```

**Naar:**
```text
const { data: isAdmin } = await adminClient.rpc('has_role', {
  _user_id: user.id,
  _role: 'admin'
});

if (!isAdmin) {
  return errorResponse('Admin toegang vereist', 403);
}
```

## Geen andere wijzigingen
- Alleen de admin check verandert (regels 629-639)
- Sync, update_config, cron, status logica blijft identiek
- Consistent met orchestrator-control, invite-user, en andere edge functions

