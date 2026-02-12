
# Notificatie Bel: Specialist Audit & Fix Plan

## Audit Resultaat: 5 Bugs Gevonden

### BUG 1 (KRITIEK): Cross-User Zichtbaarheid
**Ernst**: Hoog -- privacy schending
**Probleem**: De `useUnreadNotifications` hook filtert NIET op `user_id`. De RLS-policy staat toe dat gebruikers ALLE notificaties van hun organisatie zien via `org_id` match. Resultaat:
- Erik ziet 59 notificaties (waarvan slechts ~29 voor hem)
- Marianne ziet 81 notificaties (waarvan ~30 voor haar)
- Iedereen ziet elkaars subtask_assignment en task_assigned meldingen

**Oorzaak**: RLS SELECT policy: `org_id match OR user_id match` -- te breed voor persoonlijke notificaties.

**Fix**: Filter in `useUnreadNotifications.ts` toevoegen: `.eq("user_id", user.id)` voor persoonlijke types (task_assigned, subtask_assignment). Diploma/VOG blijven org-breed (die zijn voor alle recruiters relevant).

---

### BUG 2 (HOOG): 21 Ghost Task-Assigned Spam
**Ernst**: Hoog -- UX vervuiling
**Probleem**: 21 `task_assigned` notificaties voor Erik, allemaal exact hetzelfde tijdstip (`2026-02-12 16:03:27`), geen `triggered_by` in metadata. Waarschijnlijk veroorzaakt door een bulk role-assignment operatie die de oude trigger versie gebruikte (zonder `triggered_by`).

**Fix**: Data cleanup -- markeer deze 21 records als gelezen. De trigger is al gefixt in migratie `20260210114314` (bevat nu `triggered_by`).

---

### BUG 3 (HOOG): 23 Onzichtbare Orphaned Diploma Notificaties
**Ernst**: Hoog -- data-integriteit
**Probleem**: 23 `diploma_upgrade` notificaties met `user_id = NULL` EN `org_id = NULL`. Door RLS zijn ze voor NIEMAND zichtbaar en kunnen niet worden opgeruimd.

**Oorzaak**: De `verify-diploma-duo` edge function (regel 1531-1546) insert notificaties ZONDER `user_id` en `org_id` velden.

**Fix**:
1. Edge function aanpassen: `org_id` meegeven uit de application data
2. Data cleanup: 23 orphaned records markeren als gelezen

---

### BUG 4 (MIDDEL): 13 Zelf-getriggerde Subtask Notificaties
**Ernst**: Middel -- UX ruis
**Probleem**: 13 subtask_assignment notificaties waar `triggered_by = user_id` (SELF). De client-side filter werkt correct voor records MET `triggered_by`, maar 32 records hebben `triggered_by = NULL` en passeren daardoor het filter onterecht.

**Oorzaak**: Oudere subtask_assignment records (voor migratie `20260210114314`) missen het `triggered_by` veld in metadata.

**Fix**: De client-side filter in `useUnreadNotifications.ts` behandelt `metadata = null` als "toon notificatie" (regel 36: `if (!metadata) return true`). Na fix van BUG 1 (user_id filter) worden cross-user notificaties al geblokkeerd. Resterende orphans: data cleanup.

---

### BUG 5 (LAAG): Popover sluit niet na klik
**Ernst**: Laag -- UX polish
**Probleem**: Na klikken op een notificatie wordt `markAsRead` aangeroepen en navigeert de gebruiker, maar de Popover sluit niet automatisch (afhankelijk van of navigatie een re-render triggert).

**Fix**: Popover state beheren en expliciet sluiten bij klik.

---

## Implementatie Plan

### Stap 1: Database Cleanup (Data operaties)
Markeer alle corrupte/orphaned notificaties als gelezen:
- 21 ghost `task_assigned` records (Erik, timestamp `2026-02-12 16:03:27`)
- 23 orphaned `diploma_upgrade` records (user_id IS NULL)
- 13 self-triggered `subtask_assignment` records

### Stap 2: useUnreadNotifications.ts -- User-ID Filter
Wijzig de query om expliciet te filteren op de ingelogde gebruiker:
- Voor `task_assigned` en `subtask_assignment`: filter op `.eq("user_id", user.id)`
- Dit voorkomt cross-user zichtbaarheid permanent

### Stap 3: verify-diploma-duo Edge Function
Fix de INSERT zodat `org_id` wordt meegegeven (opgehaald uit de application/candidate data). Dit voorkomt toekomstige orphaned records.

### Stap 4: NotificationBell.tsx -- Popover Close
Voeg `open` state toe aan de Popover en sluit bij klik op een notificatie.

---

## Technisch Overzicht

| Component | Bug | Fix |
|-----------|-----|-----|
| Database (data cleanup) | 21 ghost + 23 orphaned + 13 self | UPDATE read_at |
| `useUnreadNotifications.ts` | Cross-user zichtbaarheid | `.eq("user_id", user.id)` filter |
| `verify-diploma-duo/index.ts` | Geen org_id bij insert | org_id meegeven |
| `NotificationBell.tsx` | Popover sluit niet | Controlled open state |

## Verwacht Resultaat Na Fix
- Erik: van 59 naar ~8 relevante notificaties
- Marianne: van 81 naar ~10 relevante notificaties
- Geen orphaned records meer
- Geen cross-user lekkage
- Popover sluit netjes bij interactie
