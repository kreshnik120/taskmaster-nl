

# M6 Facturatie - Deel 1: Foundation Components

## Overzicht

Dit plan implementeert de foundation components voor de Facturatie module:
- Route configuratie voor `/facturatie/nieuw` en `/facturatie/:id`
- BetalingRegistrerenDialog component
- StatusWijzigenDialog component
- Placeholder pagina's voor FactuurDetail en FactuurAanmaken

---

## Fase 1: Routing Updates

### Bestand: `src/App.tsx`

Voeg imports en routes toe (LET OP: `/nieuw` VOOR `/:id`):

```typescript
import FactuurDetail from "./pages/FactuurDetail";
import FactuurAanmaken from "./pages/FactuurAanmaken";

// Na regel 106 (<Route path="/facturatie" element={<Facturatie />} />):
<Route path="/facturatie/nieuw" element={<FactuurAanmaken />} />
<Route path="/facturatie/:id" element={<FactuurDetail />} />
```

---

## Fase 2: Dialog Components

### 2.1 BetalingRegistrerenDialog

**Nieuw bestand:** `src/components/facturatie/BetalingRegistrerenDialog.tsx`

| Element | Beschrijving |
|---------|--------------|
| Props | `open`, `onOpenChange`, `factuurId`, `openstaandBedrag` |
| Form fields | Bedrag, Datum, Methode, Referentie, Opmerking |
| Hook | `useCreateBetaling` voor opslaan |
| Validatie | Bedrag verplicht, datum verplicht |

### 2.2 StatusWijzigenDialog

**Nieuw bestand:** `src/components/facturatie/StatusWijzigenDialog.tsx`

Status transitie matrix:

| Huidige Status | Toegestane Transities |
|----------------|----------------------|
| CONCEPT | DEFINITIEF |
| DEFINITIEF | CONCEPT, VERZONDEN |
| VERZONDEN | HERINNERING_1, BETWIST, BETAALD, AFGEBOEKT |
| HERINNERING_1 | HERINNERING_2, BETWIST, BETAALD, AFGEBOEKT |
| HERINNERING_2 | HERINNERING_3, BETWIST, BETAALD, AFGEBOEKT |
| HERINNERING_3 | BETWIST, BETAALD, AFGEBOEKT |
| BETWIST | VERZONDEN, BETAALD, AFGEBOEKT |
| BETAALD | (geen) |
| AFGEBOEKT | (geen) |

---

## Fase 3: Placeholder Pagina's

### 3.1 FactuurDetail Placeholder

**Nieuw bestand:** `src/pages/FactuurDetail.tsx`

Tijdelijke pagina met:
- Terug knop naar `/facturatie`
- Toont factuur ID uit URL params
- Placeholder tekst

### 3.2 FactuurAanmaken Placeholder

**Nieuw bestand:** `src/pages/FactuurAanmaken.tsx`

Tijdelijke pagina met:
- Terug knop naar `/facturatie`
- Placeholder tekst

---

## Fase 4: Technische Details

### Bestanden Overzicht

| Bestand | Actie | Regels |
|---------|-------|--------|
| `src/App.tsx` | EDIT | +4 regels |
| `src/components/facturatie/BetalingRegistrerenDialog.tsx` | CREATE | ~120 regels |
| `src/components/facturatie/StatusWijzigenDialog.tsx` | CREATE | ~100 regels |
| `src/pages/FactuurDetail.tsx` | CREATE | ~35 regels |
| `src/pages/FactuurAanmaken.tsx` | CREATE | ~35 regels |

### Hooks Verificatie

De benodigde hooks zijn beschikbaar:
- `useCreateBetaling` - geëxporteerd via `src/hooks/facturatie/index.ts`
- `useUpdateFactuur` - bevat `updateStatus` functie

### Types Verificatie

Alle types beschikbaar in `src/types/facturatie.ts`:
- `BetalingMethode`
- `FactuurStatus`
- `BETALING_METHODE_LABELS`
- `FACTUUR_STATUS_LABELS`

---

## Verificatie Checklist

Na implementatie:

| Check | Item |
|-------|------|
| [ ] | Route `/facturatie/nieuw` laadt placeholder |
| [ ] | Route `/facturatie/:id` laadt placeholder met ID |
| [ ] | BetalingRegistrerenDialog.tsx bestaat |
| [ ] | StatusWijzigenDialog.tsx bestaat |
| [ ] | Geen TypeScript errors |
| [ ] | ALLOWED_TRANSITIONS bevat alle 9 statussen |

