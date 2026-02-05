

# Fix: Impersonatie Stop Functie

## Probleem

Wanneer een admin een andere gebruiker impersoneert en probeert te stoppen, krijgt deze een 403 error omdat:

1. De huidige sessie is van de geïmpersoneerde gebruiker (bijv. Leonie)
2. De edge function checkt of de **huidige** gebruiker admin is
3. Leonie is geen admin → "Alleen admins kunnen impersoneren"

```text
Admin (k.atashi)                   Leonie (target)
     │                                  │
     │ ─── Start Impersonation ───────> │
     │     (inloggen als Leonie)        │
     │                                  │
     │ <── Sessie is nu Leonie ──────── │
     │                                  │
     │ ─── Stop Impersonation ────────> │ ❌ 403 Error!
     │     (Leonie is geen admin)       │
```

---

## Oplossing

De `stop_impersonation` actie moet **geen admin check** uitvoeren. In plaats daarvan:

1. Skip de admin check voor `stop_impersonation`
2. Gebruik de `original_admin_id` uit de request body om te loggen
3. Laat de client gewoon uitloggen (geen server-side validatie nodig)

---

## Implementatie

### Stap 1: Edge Function - Bypass Admin Check voor Stop

**Bestand:** `supabase/functions/impersonate-user/index.ts`

Verplaats de body parsing vóór de admin check, zodat we de actie kunnen controleren:

```typescript
// Parse request body FIRST
const body: ImpersonateRequest = await req.json();
const { action, target_user_id, original_admin_id } = body;

// For stop_impersonation, skip admin check - just log and return success
if (action === 'stop_impersonation') {
  // Log the stop action using the original admin ID from the request
  if (original_admin_id) {
    const { error: logError } = await adminClient
      .from('admin_impersonation_log')
      .insert({
        admin_user_id: original_admin_id,
        target_user_id: target_user_id,
        action: 'stop',
        admin_email: null,
        target_email: null
      });
    
    if (logError) {
      console.error('Failed to log stop impersonation:', logError);
    }
  }
  
  console.log(`Impersonation stopped for user ${target_user_id}`);
  
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Only check admin for start_impersonation
const { data: isAdmin, error: roleError } = await adminClient.rpc('has_role', {
  _user_id: adminUserId,
  _role: 'admin'
});
// ... rest of admin check
```

### Stap 2: Frontend - Stuur original_admin_id mee

**Bestand:** `src/components/ImpersonationBanner.tsx`

Update de request body om `original_admin_id` mee te sturen:

```typescript
await supabase.functions.invoke('impersonate-user', {
  body: {
    action: 'stop_impersonation',
    target_user_id: session.user.id,
    original_admin_id: originalAdminId  // Voeg dit toe!
  }
})
```

### Stap 3: Interface Update

**Bestand:** `supabase/functions/impersonate-user/index.ts`

Voeg `original_admin_id` toe aan de interface:

```typescript
interface ImpersonateRequest {
  action: 'start_impersonation' | 'stop_impersonation';
  target_user_id: string;
  original_admin_id?: string;  // Optioneel, alleen voor stop
}
```

---

## Volledige Flow Na Fix

```text
Admin (k.atashi)                   Leonie (target)
     │                                  │
     │ ─── Start Impersonation ───────> │ ✅ Admin check passed
     │     (admin_id opgeslagen)        │
     │                                  │
     │ <── Sessie is nu Leonie ──────── │
     │                                  │
     │ ─── Stop Impersonation ────────> │ ✅ Geen admin check!
     │     (original_admin_id meegegeven)│
     │                                  │
     │ <── Uitloggen, redirect ──────── │
```

---

## Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/impersonate-user/index.ts` | Interface update, admin check bypass voor stop |
| `src/components/ImpersonationBanner.tsx` | Stuur `original_admin_id` mee in request |

---

## Veiligheidsoverweging

Dit is veilig omdat:
1. `stop_impersonation` doet niets meer dan loggen en success retourneren
2. De client doet vervolgens zelf de signOut() en redirect
3. Er wordt geen gevoelige actie uitgevoerd zonder admin verificatie

