

# Fix: Alle medewerkers kunnen professionals bekijken

## Probleem
De huidige RLS policy "HR can view full professional data" op de `professionals` tabel staat alleen `admin` en `manager` rollen toe om data te lezen. Gebruikers met de rol `user` zien een lege lijst.

## Oplossing
Vervang de SELECT policy zodat **alle ingelogde gebruikers** binnen dezelfde organisatie professionals kunnen bekijken.

## Wijziging (1 database migratie)

```sql
DROP POLICY "HR can view full professional data" ON public.professionals;

CREATE POLICY "Org members can view professionals"
ON public.professionals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = professionals.org_id
    AND user_organizations.user_id = auth.uid()
  )
);
```

## Wat verandert
- Alle ingelogde gebruikers die tot dezelfde organisatie behoren kunnen professionals zien
- De org-check blijft behouden (je ziet alleen professionals van je eigen organisatie)

## Wat NIET verandert
- INSERT policy (alleen managers)
- UPDATE policy (alleen managers)
- DELETE policy (alleen admins)
- Admin ALL policy (ongewijzigd)
- Geen code-wijzigingen nodig
- Geen frontend-wijzigingen nodig

