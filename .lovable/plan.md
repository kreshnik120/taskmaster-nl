

# BENDY-REQ-9C: Email-match fallback voor 495 constraint failures

## Probleem
Regels 108-112 matchen al op email, maar alleen als `!p.bendy_id`. Professionals met een **ander** bendy_id worden overgeslagen, waardoor die users in de INSERT terechtkomen en falen op de email unique constraint.

## Oplossing
Verander de matching logica (regels 106-113) in drie stappen:

```text
1. Match op bendy_id        → UPDATE (bestaand)
2. Match op email, geen bendy_id → UPDATE + set bendy_id (nieuw)
3. Match op email, ander bendy_id → SKIP (voorkom corruptie)
4. Geen match               → INSERT
```

### Wijzigingen in `bendy-sync-users.ts`

**Regels 106-113** — Vervang de matching logica:
```typescript
let matchedPro: any = null;
let emailSkipped = false;
matchedPro = professionals.find((p: any) => p.bendy_id === bendyId);
if (!matchedPro && attrs.email) {
  const bendyEmail = attrs.email.trim().toLowerCase();
  const emailPro = professionals.find((p: any) =>
    p.email && p.email.trim().toLowerCase() === bendyEmail
  );
  if (emailPro) {
    if (!emailPro.bendy_id) {
      // Stap 2a: email match, geen bendy_id → koppel
      matchedPro = emailPro;
    } else {
      // Stap 2b: email match, ander bendy_id → skip
      emailSkipped = true;
      result.skipped++;
      logWarning(FUNCTION_NAME, `User ${bendyId}: email match maar ander bendy_id (${emailPro.bendy_id})`);
    }
  }
}
```

**Na regel 113** — Guard de else-tak met emailSkipped:
```typescript
if (matchedPro) {
  // ... bestaande UPDATE logica (ongewijzigd)
} else if (!emailSkipped) {
  // ... bestaande INSERT logica (ongewijzigd)
}
// emailSkipped=true → niets doen (al geteld als skipped)
```

**Metadata** — Voeg twee tellers toe aan result:
```typescript
// Na de loop, voor de return
(result as any).email_matched = /* tel uit updates waar email-match was */;
(result as any).email_skipped_other_bendy = result.skipped;
```

Simpeler: twee counters bovenaan de loop bijhouden (`emailMatchCount`, `emailSkippedCount`) en na de loop toevoegen aan result.

### Deploy
Redeploy `bendy-sync` edge function.

### Verwacht resultaat
- Mislukt: 495 → ~0
- Bijgewerkt: 999 → ~1494
- Overgeslagen: 0 → ~495
- Status: "success"

