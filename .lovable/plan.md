

# Plan: Fix CLAWDBOT_VPS_URL Secret

## Root Cause Analyse

De logs tonen twee verschillende errors in chronologische volgorde:

| Timestamp | Error | Oorzaak |
|-----------|-------|---------|
| 01:07:32 - 01:10:48 | `Cannot read properties of undefined (reading 'to')` | Oude code draaide nog zonder de `data` wrapper fix |
| 01:11:51 | `Invalid URL: 'CLAWDBOT_VPS_URL=http://72.61.155.82:58438/send'` | Secret bevat key naam als prefix |

**Bewijs dat de data wrapper fix WERKT:**
```
[b2c1396c] Sending message via Relay to: 31648005001@s.whatsapp.net
```

Dit log-statement bewijst dat `data.to` correct wordt uitgelezen. De nieuwe error komt van de volgende stap: het aanroepen van de Relay URL.

## Het Probleem

De `CLAWDBOT_VPS_URL` secret is verkeerd opgeslagen. In plaats van:
```
http://72.61.155.82:58438
```

Bevat het:
```
CLAWDBOT_VPS_URL=http://72.61.155.82:58438
```

Wanneer de code dit doet:
```typescript
const vpsUrl = Deno.env.get("CLAWDBOT_VPS_URL");
await fetch(`${vpsUrl}/send`, ...)
```

Wordt de URL:
```
CLAWDBOT_VPS_URL=http://72.61.155.82:58438/send
```

Dit is geen geldige URL en faalt.

## Oplossing

De secret `CLAWDBOT_VPS_URL` moet opnieuw worden ingesteld met ALLEEN de waarde:

**Correcte waarde:** `http://72.61.155.82:58438`

## Actie

1. Verwijder of update de `CLAWDBOT_VPS_URL` secret
2. Voeg opnieuw toe met de correcte waarde (zonder `CLAWDBOT_VPS_URL=` prefix)
3. De code hoeft NIET aangepast te worden - de huidige implementatie is correct

## Verificatie Na Fix

Na het corrigeren van de secret:
1. Verstuur een testbericht via WhatsApp
2. De logs moeten tonen: `Relay response:` met een succesvolle response
3. Het bericht moet aankomen op de ontvanger

