

# Fix: Bendy base64 data extractie — JSON:API formaat

## Probleem
De Bendy API retourneert data in JSON:API formaat:
```json
{ "data": { "id": "...", "type": "...", "attributes": { "data": "base64..." } } }
```

De code op regel 433 zoekt verkeerd:
```typescript
const base64Data = typeof response.data.data === 'string' ? response.data.data : response.data.data?.file_data;
```

`response.data.data` is een object (niet een string), en `file_data` bestaat niet — de base64 zit in `attributes.data`.

## Fix
**Bestand**: `src/components/ProfessionalDetailModal.tsx`, regel 433

Vervang:
```typescript
const base64Data = typeof response.data.data === 'string' ? response.data.data : response.data.data?.file_data;
```

Door:
```typescript
const base64Data = response.data.data?.attributes?.data
  || response.data.data?.file_data
  || (typeof response.data.data === 'string' ? response.data.data : null);
```

Dit checkt eerst de JSON:API structuur (`attributes.data`), dan een fallback (`file_data`), dan directe string data. Eén regel wijzigen, geen andere bestanden.

