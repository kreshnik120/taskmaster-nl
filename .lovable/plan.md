
# Gebruiker Erik Hendriks volledig verwijderen

## Wat er moet gebeuren
De gebruiker Erik Hendriks (erik@inforzo.nl) moet volledig worden verwijderd uit het systeem, inclusief alle gerelateerde data.

## Gevonden data
- **Auth user**: `fe32904f-5e40-4a61-80c6-7c7acf10b46e`
- **user_roles**: 1 record
- **profiles**: 1 record
- **user_organizations**: 2 records

## Aanpak

### Stap 1: `delete_user` action toevoegen aan edge function
Voeg een nieuw `case "delete_user"` toe aan `supabase/functions/manage-users/index.ts` dat:
1. Gerelateerde records verwijdert (user_roles, profiles, user_organizations)
2. De auth user verwijdert via `adminClient.auth.admin.deleteUser()`
3. Alleen door admins uitgevoerd kan worden (al afgedekt door bestaande auth check)

### Stap 2: Delete knop toevoegen aan Gebruikers pagina
In `src/pages/Gebruikers.tsx`:
- Nieuwe `deleteUserMutation` toevoegen die de edge function aanroept
- Een delete-knop (prullenbak icoon) toevoegen naast "Rol wijzigen" en impersonatie
- Bevestigingsdialoog met AlertDialog voordat de gebruiker definitief wordt verwijderd
- Bescherming: admin kan zichzelf niet verwijderen

### Stap 3: Direct Erik Hendriks verwijderen
Na deployment van de edge function, de delete actie aanroepen voor deze specifieke gebruiker.

---

## Technisch overzicht

| Bestand | Wijziging |
|---------|-----------|
| `manage-users/index.ts` | Nieuw `delete_user` case: verwijdert user_roles, profiles, user_organizations, en auth user |
| `Gebruikers.tsx` | Delete mutation, bevestigingsdialoog, prullenbak-knop per gebruiker |
