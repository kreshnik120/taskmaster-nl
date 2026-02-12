

# Fix: Rol toewijzen werkt niet (database constraint mismatch)

## Probleem
De edge function `manage-users` gebruikt `upsert({ onConflict: "user_id" })` maar de database heeft alleen een unique constraint op `(user_id, role)` -- niet op `user_id` alleen. Hierdoor faalt elke rol-toewijzing met error `42P10`.

## Oplossing

### Stap 1: Database migratie
Voeg een unique constraint toe op `user_id` alleen (aangezien elke gebruiker maar 1 rol heeft):

```sql
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
```

Dit vervangt de `(user_id, role)` constraint door een `(user_id)` constraint, zodat de upsert correct werkt.

### Stap 2: Erik's rol toewijzen
Na de migratie, via de UI de rol "user" (of gewenste rol) toewijzen aan Erik. Dit zal nu wel werken.

---

## Technisch overzicht

| Component | Wijziging |
|-----------|-----------|
| Database | Unique constraint wijzigen van `(user_id, role)` naar `(user_id)` |
| Edge function | Geen wijziging nodig -- `onConflict: "user_id"` klopt dan |

