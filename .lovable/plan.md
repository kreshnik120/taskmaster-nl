
# Diagnose: Afbeeldingen niet zichtbaar van andere contacten

## Root Cause Analyse

### Bevindingen uit Database

| Contact | Message ID Pattern | Message Type | Media Record | Status |
|---------|-------------------|--------------|--------------|--------|
| **Kreshnik** | `2A...` | `image` | ✅ Aanwezig | Werkt |
| Noortje | `3A...` | `unknown` | ❌ Ontbreekt | Kapot |
| Simon de Jong | `3A...`, `3EB...` | `unknown` | ❌ Ontbreekt | Kapot |
| Anass Bouloum | `3A...` | `unknown` | ❌ Ontbreekt | Kapot |

### Technische Analyse

De Edge Function code (regel 263-306) verwerkt media correct:

```typescript
if (media && media.base64) {
  // Upload naar storage
  // Opslaan in whatsapp_media tabel
}
```

**Probleem**: De VPS stuurt voor de meeste berichten:
- `type: undefined` → wordt opgeslagen als `unknown`
- `media: undefined` → geen base64 data om te verwerken

**Waarom werkt Kreshnik wel?**
- Kreshnik's berichten komen binnen met `type: 'image'` en een volledig `media` object
- Dit wijst op een VPS-side bug waarbij media alleen voor bepaalde berichten correct wordt verwerkt

## Mogelijke Oorzaken (VPS-side)

1. **WhatsApp Web.js Media Download Failure**
   - De VPS downloadt de media niet succesvol voor sommige berichten
   - Mogelijk een timing issue of rate limiting

2. **Message Type Detection Bug**
   - De VPS detecteert niet correct dat het een media bericht is
   - Resultaat: `type` wordt `undefined`

3. **Session-specifiek Issue**
   - Mogelijk een probleem met de WhatsApp sessie connectie

## Aanbevolen Oplossing

### Optie A: VPS Debug (Aanbevolen)

Check de VPS logs voor de berichten met `message_id` die beginnen met `3A...`:

```bash
# Op de VPS
grep "3ACA7EF8B20EBEB8DA53" /var/log/whatsapp-bridge.log
```

Verwachte output zou moeten tonen waarom media download faalt.

### Optie B: VPS Code Fix

Pas de VPS message handler aan om:
1. Altijd te proberen media te downloaden als `message.hasMedia === true`
2. Betere error logging toe te voegen

### Optie C: Retry Mechanism (Edge Function)

Voeg een "retry media download" endpoint toe die de VPS vraagt om media opnieuw te downloaden voor berichten die type `unknown` hebben maar eigenlijk media zouden moeten bevatten.

---

## Actieplan

| # | Actie | Waar | Prioriteit |
|---|-------|------|------------|
| 1 | Check VPS logs voor media download errors | VPS Server | Hoog |
| 2 | Voeg media download retry endpoint toe | Edge Function | Medium |
| 3 | Fix VPS media handling voor alle berichten | VPS Code | Hoog |

## Conclusie

Dit is een **VPS-side probleem**, niet een Edge Function of database probleem. De Edge Function is correct geconfigureerd om media te verwerken, maar ontvangt simpelweg geen media data van de VPS voor de meeste berichten.

**Volgende stap**: Check de VPS server logs om te begrijpen waarom media download faalt voor berichten anders dan die van Kreshnik.
