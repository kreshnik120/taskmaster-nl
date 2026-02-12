

# Taken toewijzen + Gebruikersnamen bijwerken

## Stap 1: Alle 20 verweesd taken toewijzen aan Erik Hendriks
Alle taken waar `assignee_id IS NULL` worden bijgewerkt naar Erik's account (`7fdc4755-d9e8-4468-b1ad-16fa80270aab`). Hetzelfde voor `reporter_id` waar dat NULL is.

## Stap 2: Profielnamen bijwerken in database
Directe data-updates in de `profiles` tabel:

| Email | Was | Wordt |
|-------|-----|-------|
| k.atashi@citozorg.nl | Kreshnik | Kreshnik Atashi |
| erik@abczorg.nl | Erik van ABCzorg | Erik Hendriks |
| admin@abczorg.nl | Marianne | Marianne Greven |
| d.caro@abczorg.nl | D. Caro | Dilmar Caro |
| l.pattipeilohy@citozorg.nl | Leonie Pattipeilohy | (al compleet) |

## Stap 3: Gebruikerspagina naam-weergave verbeteren
In `src/pages/Gebruikers.tsx` toont de naam kolom nu `user.raw_user_meta_data?.name` wat uit auth metadata komt. Dit moet als fallback ook het `profiles.name` veld gebruiken. Aangezien de edge function `list_users` al auth user metadata teruggeeft, voegen we daar ook het profiel-name veld aan toe zodat er altijd een naam zichtbaar is.

### Technisch
- **Edge function** (`manage-users/index.ts`): Bij `list_users`, ook `profiles` tabel joinen om `name` op te halen als fallback
- **Frontend** (`Gebruikers.tsx`): Toon `profile_name` als `raw_user_meta_data.name` leeg is
- **Database**: 4x UPDATE op `profiles.name`, 20x UPDATE op `tasks.assignee_id` en `tasks.reporter_id`

