

# BSN 11-proef validatie in openclaw-proxy

## Wijzigingen in `supabase/functions/openclaw-proxy/index.ts`

### 1. Voeg `isValidBSN()` functie toe (na regel 54, vóór `stripPII`)
Elfproef-validatie: gewogen som met factoren `[9,8,7,6,5,4,3,2,-1]`, geldig als `sum > 0 && sum % 11 === 0`.

### 2. Verwijder BSN regex uit `PII_PATTERNS` (regel 52)
Alleen IBAN-patroon blijft over.

### 3. Update `stripPII` string-blok (regels 57-63)
Voeg BSN-specifieke replace toe vóór de PII_PATTERNS loop:
```
clean = clean.replace(/\b\d{9}\b/g, (match) => isValidBSN(match) ? '[VERBORGEN]' : match);
```

### Niet aanraken
- Object/array logica in stripPII
- Veldnaam-blacklist
- Action handlers, CORS, ADMIN_MAP

### Na deploy
- `123456789` (geldig BSN) → `[VERBORGEN]`
- `111111111` (ongeldig) → ongewijzigd
- Telefoonnummers → ongewijzigd

