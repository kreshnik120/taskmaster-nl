
# Plan: Fix Security RLS Policies (PROMPT #51)

## 📊 Analyse Resultaat

Na uitgebreid onderzoek van de security scan resultaten en database configuratie:

### Issue 1: Profiles RLS Policy 
**Status**: FIX NODIG

De `profiles` tabel heeft RLS enabled met bestaande policies voor:
- Eigen profiel zien (werkt)
- Org leden profielen zien (werkt)
- Eigen profiel bewerken (werkt)

**Ontbreekt**: Admin kan NIET alle profielen zien

### Issue 2: AI Knowledge Base RLS Policy
**Status**: ✅ CORRECT GECONFIGUREERD

De `ai_knowledge_base` tabel heeft al complete RLS:
- Users kunnen org knowledge zien (met ACL check)
- Admins/Managers kunnen alles beheren
- Org-gebaseerde filtering is correct

### Issue 3: Chat Messages Exposed (Security Tab)
**Status**: ❌ FALSE POSITIVE

Dit is een VIEW (`chat_messages`) met `security_invoker=true` die verwijst naar `ai_chat_messages`. De base table HAS correcte RLS. Geen actie nodig - moet worden gemarkeerd als opgelost.

---

## Implementatie

### Stap 1: Database Migratie - Profiles Admin Policy

Voeg een nieuwe RLS policy toe voor admin toegang:

```sql
-- Admin kan alle profielen zien
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);
```

**Let op**: De `has_role` functie bestaat al en is correct geconfigureerd met `SECURITY DEFINER`.

### Stap 2: Update Security Findings

Markeer de `chat_messages_public_exposure` finding als opgelost/genegeerd met een uitleg dat dit een secure VIEW is met `security_invoker=true`.

---

## Technische Details

### Bestaande Infrastructure (Geen Wijzigingen)

| Component | Status |
|-----------|--------|
| `has_role()` functie | ✅ Bestaat (SECURITY DEFINER) |
| `app_role` enum | ✅ Bestaat (admin, manager, user) |
| `user_roles` tabel | ✅ Correct RLS |
| `profiles` RLS enabled | ✅ Ja |
| `ai_knowledge_base` RLS | ✅ Compleet |

### Nieuwe Policy Details

| Aspect | Waarde |
|--------|--------|
| **Tabel** | `profiles` |
| **Operatie** | SELECT |
| **Target** | `authenticated` users |
| **Conditie** | `has_role(auth.uid(), 'admin')` |
| **Recursie-safe** | ✅ Ja (via SECURITY DEFINER functie) |

### Waarom geen INSERT policy nodig voor profiles?

De `profiles` tabel wordt automatisch aangemaakt via een database trigger wanneer een user zich registreert. INSERT policies zijn niet nodig voor normale gebruikers.

---

## Verwachte Resultaat

Na implementatie:

| Policy | Wie Kan Zien | 
|--------|--------------|
| Eigen profiel | ✅ Iedereen |
| Org leden | ✅ Org members |
| Alle profielen | ✅ Alleen admins |

De security scan errors worden:
- Profiles: ✅ Opgelost
- Chat messages: ✅ Gemarkeerd als false positive

---

## Risico Analyse

| Risico | Niveau | Mitigatie |
|--------|--------|-----------|
| Policy conflict | Laag | PERMISSIVE policies combineren met OR |
| Recursie | Geen | `has_role()` is SECURITY DEFINER |
| Breaking change | Geen | Alleen toevoegen, niet wijzigen |

