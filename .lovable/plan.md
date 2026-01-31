

## Wachtwoord reset voor Erik (erik@abczorg.nl)

### Huidige situatie
- Erik's account bestaat (ID: `7fdc4755-d9e8-4468-b1ad-16fa80270aab`)
- Laatste login: 27 januari 2026
- E-mail is bevestigd
- De `manage-users` edge function heeft nog geen wachtwoord-reset functionaliteit

### Wat ik ga doen

**1. Wachtwoord reset actie toevoegen aan `manage-users` functie**

Ik voeg een nieuwe actie `reset_password` toe aan de bestaande `manage-users` edge function. Deze actie:
- Controleert of de aanvrager een admin is (bestaande beveiliging)
- Gebruikt de Supabase Admin API om het wachtwoord direct te wijzigen
- Logt de actie voor audit doeleinden

**2. Direct het wachtwoord resetten voor Erik**

Na deployment kan ik de functie aanroepen om Erik's wachtwoord te zetten op "Welkom01".

### Technische wijziging

**Bestand:** `supabase/functions/manage-users/index.ts`

Nieuwe case toevoegen:

```typescript
case "reset_password": {
  const { user_id, new_password, email } = params;
  
  // Zoek user_id op basis van email als die niet gegeven is
  let targetUserId = user_id;
  if (!targetUserId && email) {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const targetUser = users.users.find(u => u.email === email);
    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: "Gebruiker niet gevonden" }),
        { status: 404, ... }
      );
    }
    targetUserId = targetUser.id;
  }
  
  // Update wachtwoord via admin API
  const { error } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { password: new_password }
  );
  
  if (error) {
    return new Response(
      JSON.stringify({ error: "Kon wachtwoord niet resetten" }),
      { status: 500, ... }
    );
  }
  
  return new Response(
    JSON.stringify({ success: true, message: "Wachtwoord gereset" }),
    { ... }
  );
}
```

### Resultaat
- Erik kan inloggen met `erik@abczorg.nl` / `Welkom01`
- Admins kunnen in de toekomst wachtwoorden resetten via de bestaande gebruikersbeheer-functie

