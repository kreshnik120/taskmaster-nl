

# Fix: PDF Generatie - Font Loading Error

## Probleem Geïdentificeerd

Bij het testen van de PDF download functionaliteit faalt de PDF generatie met de volgende foutmelding:

```
Failed to load resource: the server responded with a status of 404
https://fonts.gstatic.com/s/inter/v12/...woff2
```

**Oorzaak**: De Google Fonts URLs in `FactuurPDFDocument.tsx` zijn verouderd (v12) en niet meer beschikbaar.

---

## Oplossing

Verwijder de custom font registratie en gebruik de standaard Helvetica font van react-pdf. Dit is de meest betrouwbare oplossing omdat:
1. Geen externe dependencies
2. Werkt altijd offline
3. Helvetica is professioneel en universeel leesbaar

---

## Wijzigingen

### Bestand: `src/components/facturatie/pdf/FactuurPDFDocument.tsx`

#### 1. Verwijder Font Registratie (regels 13-30)

**Verwijderen:**
```typescript
// Register fonts for better typography
Font.register({
  family: 'Inter',
  fonts: [
    { 
      src: 'https://fonts.gstatic.com/s/inter/v12/...woff2',
      fontWeight: 400,
    },
    { 
      src: 'https://fonts.gstatic.com/s/inter/v12/...woff2', 
      fontWeight: 600,
    },
    { 
      src: 'https://fonts.gstatic.com/s/inter/v12/...woff2', 
      fontWeight: 700,
    },
  ],
});
```

#### 2. Update Import (regel 7)

**Verwijderen uit import:**
```typescript
Font,
```

**Nieuwe import:**
```typescript
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
```

#### 3. Update Styles - Page (regel 34-38)

**Van:**
```typescript
page: {
  padding: 40,
  fontSize: 10,
  fontFamily: 'Inter',
  color: '#1f2937',
},
```

**Naar:**
```typescript
page: {
  padding: 40,
  fontSize: 10,
  fontFamily: 'Helvetica',
  color: '#1f2937',
},
```

---

## Locaties in Code

| Regel | Wijziging |
|-------|-----------|
| 7 | Verwijder `Font` uit import |
| 13-30 | Verwijder complete `Font.register()` block |
| 37 | Wijzig `fontFamily: 'Inter'` naar `fontFamily: 'Helvetica'` |

---

## Verwacht Resultaat Na Fix

Na deze wijziging:
- PDF download werkt correct
- Geen externe font dependencies
- Professionele Helvetica typografie
- Alle overige PDF features blijven werken

---

## Alternatieve Oplossing (Optioneel)

Als je toch custom fonts wilt gebruiken, kun je:
1. De font bestanden lokaal hosten in `/public/fonts/`
2. Of gebruik maken van een betrouwbare CDN zoals unpkg of cdnjs

Maar de Helvetica oplossing is aanbevolen voor maximale betrouwbaarheid.

