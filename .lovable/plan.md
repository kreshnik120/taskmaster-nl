
# Admin Impersonation Feature voor Kreshnik

## Overzicht

Deze feature stelt admin Kreshnik in staat om tijdelijk in te loggen als elke andere gebruiker, zonder hun wachtwoord te weten. Dit is een krachtige ondersteuningsfunctie die vaak wordt gebruikt voor:

- **Troubleshooting**: Problemen zien zoals de gebruiker ze ervaart
- **Support**: Taken namens een gebruiker uitvoeren
- **Testing**: Features testen vanuit verschillende rollen

---

## Beveiligingsarchitectuur

### Waarom dit veilig is

1. **Alleen admins** kunnen impersoneren (server-side verificatie)
2. **Audit logging** van elke impersonation actie
3. **Visuele indicator** zodat admin weet dat ze impersoneren
4. **Eenvoudig stoppen** - één klik om terug te keren
5. **Geen wachtwoorden blootgesteld** - gebruikt admin API tokens

### Flow Diagram

```text
┌─────────────────┐      ┌──────────────────────┐      ┌────────────────┐
│  Admin klikt    │ ──▶  │   Edge Function      │ ──▶  │  Genereer      │
│  "Login als..." │      │   (admin check)      │      │  magic link    │
└─────────────────┘      └──────────────────────┘      └────────────────┘
                                                              │
                                                              ▼
┌─────────────────┐      ┌──────────────────────┐      ┌────────────────┐
│  Admin ziet     │ ◀──  │   localStorage:      │ ◀──  │  Redirect met  │
│  impersonation  │      │   impersonating_as   │      │  magic link    │
│  banner         │      │   original_admin_id  │      └────────────────┘
└─────────────────┘      └──────────────────────┘
```

---

## Implementatie

### Stap 1: Database - Audit Tabel

Nieuwe tabel voor het loggen van impersonation acties:

```sql
-- Audit log for admin impersonation actions
CREATE TABLE public.admin_impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'start' | 'stop'
  admin_email TEXT,
  target_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (only admins can read)
ALTER TABLE public.admin_impersonation_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view logs
CREATE POLICY "Admins can view impersonation logs"
  ON public.admin_impersonation_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

---

### Stap 2: Edge Function - `impersonate-user`

Nieuwe edge function: `supabase/functions/impersonate-user/index.ts`

**Functionaliteit:**
- Verificeert dat aanvrager admin is
- Genereert een magic link voor de target gebruiker via Supabase Admin API
- Logt de actie naar `admin_impersonation_log`
- Retourneert de magic link URL

**Acties:**
- `start_impersonation`: Genereer magic link voor target user
- `stop_impersonation`: Log dat admin terug is (informatief)

**Veiligheidsmaatregelen:**
- Admin check via `user_roles` tabel met service role key
- Voorkomt dat admin zichzelf impersonereert
- Rate limiting via Supabase (standaard)

---

### Stap 3: Frontend - Gebruikers Pagina Update

**Bestand:** `src/pages/Gebruikers.tsx`

Toevoegen aan elke gebruikersrij:
- **"Inloggen als..." knop** naast "Rol wijzigen"
- Alleen zichtbaar voor admins
- Opent een bevestigingsdialog

**Nieuwe mutation:**
```typescript
const impersonateMutation = useMutation({
  mutationFn: async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("impersonate-user", {
      body: { action: "start_impersonation", target_user_id: userId }
    });
    if (error) throw error;
    return data;
  },
  onSuccess: (data) => {
    // Sla originele admin ID op
    localStorage.setItem('original_admin_id', currentUser.id);
    localStorage.setItem('impersonating_as', data.target_email);
    
    // Redirect naar magic link
    window.location.href = data.magic_link;
  }
});
```

---

### Stap 4: Impersonation Banner Component

**Nieuw bestand:** `src/components/ImpersonationBanner.tsx`

Een sticky banner bovenaan het scherm die toont:
- "Je bekijkt de app als [Naam] (email@example.nl)"
- Rode/oranje waarschuwingskleur
- "Stop impersonation" knop

**Gedrag:**
- Controleert `localStorage.getItem('impersonating_as')`
- Bij "Stop" knop: logout + redirect naar admin login
- Verwijdert localStorage items

---

### Stap 5: Banner Integratie in Layout

**Bestand:** `src/App.tsx` of `src/layouts/AppLayout.tsx`

Voeg de `ImpersonationBanner` toe bovenaan de app layout:

```tsx
<ImpersonationBanner />
<SidebarProvider>
  ...rest of app
</SidebarProvider>
```

---

## UI Preview

### Gebruikers Tabel (Admin View)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Naam          │ Email               │ Rol        │ Actie                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Leonie P.     │ l.patti...@cito...  │ 🟢 USER   │ [Rol wijzigen] [👤↗] │
│ Erik          │ erik@abczorg.nl     │ 🔴 ADMIN  │ [Rol wijzigen] [👤↗] │
│ Dion          │ d.caro@abczorg.nl   │ 🟢 USER   │ [Rol wijzigen] [👤↗] │
└──────────────────────────────────────────────────────────────────────────┘

[👤↗] = "Inloggen als..." knop met tooltip
```

### Impersonation Banner

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚠️  Je bekijkt de app als Leonie Pattipeilohy (l.patti...@citozorg.nl)  │
│                                                     [Stop Impersonation] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Bestanden die worden aangemaakt/gewijzigd

### Nieuwe Bestanden

| Bestand | Doel |
|---------|------|
| `supabase/functions/impersonate-user/index.ts` | Edge function voor magic link generatie |
| `src/components/ImpersonationBanner.tsx` | Visuele indicator + stop knop |

### Gewijzigde Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/pages/Gebruikers.tsx` | "Inloggen als..." knop + bevestigingsdialog |
| `src/App.tsx` | ImpersonationBanner integratie |

### Database Migratie

| Wijziging | Details |
|-----------|---------|
| Nieuwe tabel | `admin_impersonation_log` voor audit trail |
| RLS Policy | Alleen admins kunnen logs bekijken |

---

## Technische Details

### Magic Link Generatie (Supabase Admin API)

```typescript
// In edge function
const { data, error } = await adminClient.auth.admin.generateLink({
  type: 'magiclink',
  email: targetUserEmail,
  options: {
    redirectTo: `${origin}/dashboard`
  }
});
```

Dit genereert een eenmalige login link die direct werkt zonder wachtwoord.

### Audit Log Entry

```typescript
await adminClient.from('admin_impersonation_log').insert({
  admin_user_id: adminUserId,
  target_user_id: targetUserId,
  action: 'start',
  admin_email: adminEmail,
  target_email: targetEmail
});
```

### LocalStorage Keys

| Key | Doel |
|-----|------|
| `original_admin_id` | ID van de admin om terug te kunnen keren |
| `impersonating_as` | Email van de gebruiker die we impersoneren |

---

## Beperkingen & Overwegingen

1. **Magic links verlopen** - Standaard na 24 uur (Supabase config)
2. **Sessie is echt** - Admin heeft volledige toegang als target user
3. **Geen nested impersonation** - Als admin A als user B inlogt, kan B niet als C inloggen
4. **Audit trail** - Alle acties zijn te traceren naar de originele admin

---

## Samenvatting

Deze feature geeft Kreshnik (en andere admins) de mogelijkheid om:

1. ✅ Op de Gebruikers pagina te klikken op "Inloggen als..."
2. ✅ Bevestigen dat ze willen impersoneren
3. ✅ Automatisch ingelogd worden als die gebruiker
4. ✅ Een duidelijke banner zien dat ze impersoneren
5. ✅ Met één klik terug te keren naar hun eigen account
6. ✅ Volledig audit trail van alle impersonation acties
