

## Wachtwoord Reset voor Erik + Verbeterde Recovery Flow

### Directe oplossing voor Erik

Het wachtwoord voor **erik@abczorg.nl** is zojuist gereset. Erik kan nu inloggen met:

| Veld | Waarde |
|------|--------|
| E-mail | erik@abczorg.nl |
| Wachtwoord | Welkom01!ABCzorg2026 |

### Structurele verbetering: Password Recovery Flow

**Het huidige probleem:**
Wanneer een gebruiker op de wachtwoord-reset link klikt, wordt deze automatisch ingelogd door Supabase (via een recovery token in de URL). De app herkent dit niet en stuurt de gebruiker door naar het dashboard, zonder de mogelijkheid om daadwerkelijk een nieuw wachtwoord in te stellen.

**De oplossing:**
Ik voeg een "Nieuw wachtwoord instellen" scherm toe dat automatisch verschijnt wanneer:
1. De URL een `type=recovery` parameter bevat, OF
2. Het `PASSWORD_RECOVERY` auth event wordt gedetecteerd

### Wat ik ga aanpassen

**Bestand: `src/pages/Auth.tsx`**

1. **Recovery mode detectie toevoegen:**
   - Controleer URL parameters voor `type=recovery` of `access_token`
   - Luister naar `PASSWORD_RECOVERY` event van Supabase
   - Toon automatisch het "Nieuw wachtwoord instellen" formulier

2. **Nieuw wachtwoord formulier toevoegen:**
   - Wachtwoord invoerveld met sterkte-indicator (hergebruik bestaande component)
   - Bevestiging veld
   - "Wachtwoord opslaan" knop die `supabase.auth.updateUser({ password })` aanroept

3. **Flow na succesvol wijzigen:**
   - Toon succesmelding
   - Redirect naar dashboard

### Technische details

```text
+---------------------------+
|    Gebruiker klikt op     |
|    reset-link in email    |
+-------------+-------------+
              |
              v
+---------------------------+
|  App detecteert recovery  |
|  token in URL / event     |
+-------------+-------------+
              |
              v
+---------------------------+
|  Toon "Nieuw wachtwoord   |
|  instellen" formulier     |
+-------------+-------------+
              |
              v
+---------------------------+
|  User voert nieuw         |
|  wachtwoord in            |
+-------------+-------------+
              |
              v
+---------------------------+
|  supabase.auth.updateUser |
|  ({ password: ... })      |
+-------------+-------------+
              |
              v
+---------------------------+
|  Succes! Redirect naar    |
|  dashboard                |
+---------------------------+
```

### Verwacht resultaat

- Erik kan direct inloggen met het nieuwe wachtwoord
- Toekomstige gebruikers die een reset-link aanklikken zien automatisch een "Nieuw wachtwoord instellen" scherm
- Geen verwarring meer over "automatisch ingelogd maar wachtwoord niet gewijzigd"

