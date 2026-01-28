
# Diagnose & Fix: NotFoundError removeChild DOM Error

## Probleem Analyse

De foutmelding **"NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node"** treedt op wanneer personeel een taak probeert aan te maken.

### Oorzaak

Dit is een **bekende React DOM conflict** die voorkomt wanneer:

1. **Browser extensies** de DOM manipuleren (Grammarly, LastPass, Google Translate, password managers)
2. **Twee toast systemen actief zijn** - De app gebruikt momenteel **BEIDE**:
   - `<Toaster />` van Radix UI (`@radix-ui/react-toast`)
   - `<Sonner />` van sonner library
3. **React portals overlappen** - Dialogs, popovers en toasts gebruiken allemaal portals die naar dezelfde DOM node renderen

### Technische Details

In `src/App.tsx`:
```tsx
<Toaster />   // Radix UI toast - niet gebruikt
<Sonner />    // Sonner toast - WEL gebruikt
```

De codebase importeert `toast` van sonner (90+ bestanden), maar de Radix `<Toaster />` component is ook actief. Dit veroorzaakt potentiële DOM conflicten.

---

## Voorgestelde Oplossing

### Fix 1: Verwijder Ongebruikte Radix Toaster

**Bestand**: `src/App.tsx`

De Radix UI `<Toaster />` wordt nergens gebruikt (alle toasts gaan via sonner). Verwijder deze om DOM conflicten te elimineren:

```tsx
// VERWIJDER:
import { Toaster } from "@/components/ui/toaster";

// VERWIJDER uit JSX:
<Toaster />

// BEHOUD:
<Sonner />
```

### Fix 2: Voeg Stabiele Container Toe voor Sonner

**Bestand**: `src/App.tsx`

Wrap de Sonner in een stabiel container element zodat React de DOM node niet per ongeluk verwijdert:

```tsx
<div id="sonner-container">
  <Sonner />
</div>
```

### Fix 3: Verbeter ErrorBoundary met suppressHydrationWarning

**Bestand**: `src/components/ErrorBoundary.tsx`

Voeg `suppressHydrationWarning` toe aan elementen die dynamisch content renderen om potentiële hydration mismatches te voorkomen.

---

## Samenvatting Wijzigingen

| Bestand | Wijziging |
|---------|-----------|
| `src/App.tsx` | Verwijder ongebruikte `<Toaster />` import en component |
| `src/App.tsx` | Optioneel: wrap Sonner in stabiel container element |

---

## Extra Aanbevelingen

### Voor de eindgebruiker (Leonie):

1. **Controleer browser extensies**: Vraag of er extensies actief zijn die tekst manipuleren (Grammarly, Google Translate, password managers)
2. **Hard refresh**: Ctrl+F5 of Cmd+Shift+R om cache te wissen
3. **Probeer incognito/privé modus**: Dit schakelt extensies uit

### Toekomstige preventie:

De ErrorBoundary vangt deze fouten al op en toont een nette UI. De fix zorgt ervoor dat de root cause wordt aangepakt door het verwijderen van dubbele toast systemen.

---

## Flow Na Fix

```text
1. Gebruiker klikt "Nieuwe taak"
2. TaskDialog opent (portal naar body)
3. Gebruiker vult formulier in
4. Gebruiker klikt "Opslaan"
5. Sonner toast toont "Taak aangemaakt" ✅
6. Dialog sluit ✅
7. Geen DOM conflicts meer
```
