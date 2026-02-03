
# M6 Facturatie - Betalingen + Herinneringen UI (DEEL 1 van 2)

## Overzicht

Dit plan implementeert de betalingen hooks en componenten voor de M6 Facturatie module. De herinneringen-functionaliteit en integratie volgt in DEEL 2.

---

## Fase 1: Nieuwe Hooks

### 1.1 useBetalingen Hook

**Nieuw bestand:** `src/hooks/facturatie/useBetalingen.ts`

Bevat drie hooks:

| Hook | Functie |
|------|---------|
| `useBetalingen` | Query voor betalingen per factuur |
| `useDeleteBetaling` | Betaling verwijderen met cache invalidatie |
| `useUpdateBetaling` | Betaling bijwerken (bedrag, datum, methode, etc.) |

Alle hooks volgen het bestaande patroon in `useCreateBetaling.ts`:
- Gebruik van `FACTURATIE_QUERY_KEYS` voor cache management
- Toast notificaties voor succes/fout
- `isDeleting`/`isUpdating` loading states

### 1.2 useHerinneringen Hook

**Nieuw bestand:** `src/hooks/facturatie/useHerinneringen.ts`

| Hook | Functie |
|------|---------|
| `useHerinneringen` | Query voor herinneringen per factuur |
| `useSendHerinnering` | Herinnering versturen + status update naar HERINNERING_1/2/3 |

De `useSendHerinnering` hook:
- Valideert niveau (1, 2, of 3)
- Controleert of niveau al verstuurd is
- Insert in `factuur_herinnering` tabel
- Update factuur status automatisch

### 1.3 Hooks Index Update

**Bestand:** `src/hooks/facturatie/index.ts`

Toevoegen van exports:
```typescript
export { useBetalingen, useDeleteBetaling, useUpdateBetaling } from './useBetalingen';
export { useHerinneringen, useSendHerinnering } from './useHerinneringen';
```

---

## Fase 2: Verbeterde BetalingRegistrerenDialog

**Bestand:** `src/components/facturatie/BetalingRegistrerenDialog.tsx` (vervangen)

### Nieuwe Features

| Feature | Beschrijving |
|---------|--------------|
| Factuur samenvatting | Toont totaal, reeds betaald, openstaand |
| Quick amount buttons | "Volledig" en "50%" knoppen |
| Deelbetaling warning | Info alert bij gedeeltelijke betaling |
| Overbetaling warning | Warning alert bij bedrag > openstaand |
| Volledige betaling success | Success indicator bij volledige betaling |
| useEffect reset | Form reset bij openen dialog |

### Nieuwe Props

```typescript
interface BetalingRegistrerenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factuurId: string;
  factuurNummer?: string;        // NIEUW
  openstaandBedrag: number;
  totaalBedrag?: number;         // NIEUW
  reedsBetaald?: number;         // NIEUW
}
```

---

## Fase 3: Betalingen Historie Componenten

### 3.1 BetalingenHistorie Component

**Nieuw bestand:** `src/components/facturatie/BetalingenHistorie.tsx`

Structuur:
```text
┌─────────────────────────────────────────────────────────┐
│ Betalingen                      [Betaling registreren]  │
├─────────────────────────────────────────────────────────┤
│ Voortgang: €500 van €1.210 (41%)                        │
│ ████████████░░░░░░░░░░░░░░░░░                           │
│ Openstaand: €710                                        │
├─────────────────────────────────────────────────────────┤
│ Datum       │ Methode   │ Referentie │ Bedrag │    │
│ 1 feb 2025  │ Bank      │ TXN-123    │ €300   │ ⋮ │
│ 15 jan 2025 │ iDEAL     │ —          │ €200   │ ⋮ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 BetalingBewerkDialog Component

**Nieuw bestand:** `src/components/facturatie/BetalingBewerkDialog.tsx`

Vergelijkbaar met BetalingRegistrerenDialog maar:
- Pre-filled met bestaande betaling data
- Gebruikt `useUpdateBetaling` hook
- Titel: "Betaling bewerken"

---

## Fase 4: Types Uitbreiden

**Bestand:** `src/types/facturatie.ts`

Toevoegen:

```typescript
// Herinnering niveau constanten
export const HERINNERING_NIVEAUS: HerinneringNiveau[] = [1, 2, 3];

export const HERINNERING_NIVEAU_LABELS: Record<HerinneringNiveau, string> = {
  1: 'Eerste herinnering',
  2: 'Tweede herinnering',
  3: 'Laatste herinnering',
};

export const HERINNERING_NIVEAU_COLORS: Record<HerinneringNiveau, string> = {
  1: 'yellow',
  2: 'orange',
  3: 'red',
};

// Betaling samenvatting voor dashboard
export interface BetalingSummary {
  factuur_id: string;
  factuur_nummer: string;
  totaal_bedrag: number;
  betaald_bedrag: number;
  openstaand_bedrag: number;
  aantal_betalingen: number;
  laatste_betaling_datum: string | null;
}
```

---

## Fase 5: Componenten Index

**Nieuw bestand:** `src/components/facturatie/index.ts`

```typescript
// Dialogs
export { BetalingRegistrerenDialog } from './BetalingRegistrerenDialog';
export { BetalingBewerkDialog } from './BetalingBewerkDialog';
export { StatusWijzigenDialog } from './StatusWijzigenDialog';

// Panels
export { BetalingenHistorie } from './BetalingenHistorie';
```

---

## Bestanden Overzicht

| Bestand | Actie | Regels |
|---------|-------|--------|
| `src/hooks/facturatie/useBetalingen.ts` | CREATE | ~85 |
| `src/hooks/facturatie/useHerinneringen.ts` | CREATE | ~95 |
| `src/hooks/facturatie/index.ts` | EDIT | +2 |
| `src/components/facturatie/BetalingRegistrerenDialog.tsx` | REPLACE | ~180 |
| `src/components/facturatie/BetalingenHistorie.tsx` | CREATE | ~200 |
| `src/components/facturatie/BetalingBewerkDialog.tsx` | CREATE | ~130 |
| `src/components/facturatie/index.ts` | CREATE | ~10 |
| `src/types/facturatie.ts` | EDIT | +25 |

---

## Dependencies Check

Alle benodigde componenten zijn beschikbaar:
- Alert, AlertDescription (`@/components/ui/alert`)
- Progress styling via inline div
- DropdownMenu voor acties
- AlertDialog voor delete confirmatie
- date-fns voor datum formatting

---

## Verificatie Checklist DEEL 1

| Check | Item |
|-------|------|
| [ ] | useBetalingen hook werkt |
| [ ] | useDeleteBetaling hook werkt |
| [ ] | useUpdateBetaling hook werkt |
| [ ] | useHerinneringen hook werkt |
| [ ] | useSendHerinnering hook werkt |
| [ ] | BetalingRegistrerenDialog toont factuur samenvatting |
| [ ] | Quick amount buttons werken |
| [ ] | Deelbetaling/Overbetaling warnings tonen |
| [ ] | BetalingenHistorie toont progress bar |
| [ ] | Betalingen kunnen bewerkt worden |
| [ ] | Betalingen kunnen verwijderd worden |
| [ ] | Geen TypeScript errors |

---

## Na DEEL 1 Succes

DEEL 2 bevat:
- HerinneringenPanel component
- HerinneringVersturenDialog component
- FactuurDetail tabs update met nieuwe componenten
- Quick actions integratie
