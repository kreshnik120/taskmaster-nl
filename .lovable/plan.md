
# M6 Facturatie - Deel 2: Volledige Pagina's

## Overzicht

Dit plan implementeert de volledige pagina's voor de Facturatie module, inclusief een nieuwe hook voor opdrachtgever selectie.

---

## Fase 1: Nieuwe Hook - useClientOrganizations

**Nieuw bestand:** `src/hooks/useClientOrganizations.ts`

De `useClientOrganizations` hook bestaat nog niet in de codebase. Deze moet eerst gemaakt worden voordat de wizard kan werken.

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ClientOrganization {
  id: string;
  name: string;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  centrale_facturatie_email: string | null;
}

export function useClientOrganizations() {
  return useQuery({
    queryKey: ["client-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_organizations")
        .select("id, name, kvk_nummer, btw_nummer, centrale_facturatie_email")
        .order("name");

      if (error) throw error;
      return data as ClientOrganization[];
    },
    staleTime: 5 * 60 * 1000, // 5 minuten cache
  });
}
```

---

## Fase 2: FactuurDetail Pagina

**Bestand:** `src/pages/FactuurDetail.tsx` (volledig vervangen)

### Structuur

```text
┌──────────────────────────────────────────────────────────┐
│ ← Terug   FAC-2025-0001   [VERZONDEN]                    │
│           Verkoopfactuur • Aangemaakt op 3 februari 2025 │
│                                                          │
│               [Betaling registreren] [Verzenden] [⋮]     │
├────────────────────────────────────┬─────────────────────┤
│                                    │                     │
│ [Details] [Regels] [Betalingen]    │ Financieel          │
│ [Herinneringen]                    │ ├─ Subtotaal €1.000 │
│                                    │ ├─ BTW €210         │
│ ┌────────────────────────────────┐ │ ├─ Totaal €1.210    │
│ │ Tab content hier               │ │ ├─ Betaald €0       │
│ │                                │ │ └─ Openstaand €1.210│
│ │                                │ │                     │
│ │                                │ │ Datums              │
│ └────────────────────────────────┘ │ ├─ Factuurdatum     │
│                                    │ └─ Vervaldatum      │
│                                    │                     │
│                                    │ Acties              │
│                                    │ [Download PDF]      │
│                                    │ [E-mail verzenden]  │
└────────────────────────────────────┴─────────────────────┘
```

### Componenten Gebruikt

| Component | Import |
|-----------|--------|
| StatusBadge | Lokale functie met kleuren per status |
| Tabs | `@/components/ui/tabs` |
| AlertDialog | `@/components/ui/alert-dialog` |
| DropdownMenu | `@/components/ui/dropdown-menu` |
| BetalingRegistrerenDialog | `@/components/facturatie/BetalingRegistrerenDialog` |
| StatusWijzigenDialog | `@/components/facturatie/StatusWijzigenDialog` |

### Conditionele Acties

| Actie | Voorwaarde |
|-------|------------|
| canEdit | status === "CONCEPT" |
| canDelete | status === "CONCEPT" |
| canSend | status === "DEFINITIEF" |
| canRegisterPayment | status NOT IN ("CONCEPT", "AFGEBOEKT", "BETAALD") |

---

## Fase 3: FactuurAanmaken Wizard

**Bestand:** `src/pages/FactuurAanmaken.tsx` (volledig vervangen)

### 3-Step Wizard Flow

```text
Step 1: Basisgegevens        Step 2: Factuurregels       Step 3: Bevestigen
┌─────────────────────┐      ┌─────────────────────┐     ┌─────────────────────┐
│  ●───○───○          │      │  ✓───●───○          │     │  ✓───✓───●          │
│                     │      │                     │     │                     │
│ Type factuur        │      │ Omschrijving       │     │ SAMENVATTING        │
│ [Verkoopfactuur ▼]  │      │ Aantal  Prijs  BTW │     │                     │
│                     │      │ [Regel 1]          │     │ Opdrachtgever:      │
│ Opdrachtgever *     │      │ [Regel 2]          │     │ Ziekenhuis Noord    │
│ [Selecteer... ▼]    │      │ [+ Regel toevoegen]│     │                     │
│                     │      │                     │     │ Regels: 2           │
│ Factuurdatum        │      │ Subtotaal €1.000   │     │ Subtotaal €1.000    │
│ [2025-02-03]        │      │ BTW €210           │     │ BTW €210            │
│                     │      │ Totaal €1.210      │     │ Totaal €1.210       │
│ Vervaldatum         │      │                     │     │                     │
│ [2025-03-05]        │      │                     │     │ Notities (optioneel)│
│                     │      │                     │     │ [________________]  │
│ Referentie          │      │                     │     │                     │
│ [optioneel]         │      │                     │     │ [Factuur aanmaken]  │
└─────────────────────┘      └─────────────────────┘     └─────────────────────┘
     [Volgende →]                [← Terug] [Volgende →]      [← Terug]
```

### Form State

| Field | Type | Default | Validatie |
|-------|------|---------|-----------|
| type | FactuurType | "VERKOOP" | Verplicht |
| opdrachtgeverId | string | "" | Verplicht |
| factuurdatum | string | today | Verplicht |
| vervaldatum | string | today + 30 dagen | Verplicht |
| referentie | string | "" | Optioneel |
| notities | string | "" | Optioneel |
| regels | array | [{ omschrijving: "", aantal: 1, prijs: 0, btw_percentage: 21 }] | Min 1 |

### Regel Validatie

| Stap | canGoNext Conditie |
|------|-------------------|
| 1 | opdrachtgeverId && factuurdatum && vervaldatum |
| 2 | regels.every(r => r.omschrijving && r.aantal > 0 && r.prijs >= 0) |
| 3 | Altijd true |

---

## Fase 4: Bestanden Overzicht

| Bestand | Actie | Regels |
|---------|-------|--------|
| `src/hooks/useClientOrganizations.ts` | CREATE | ~25 |
| `src/pages/FactuurDetail.tsx` | REPLACE | ~350 |
| `src/pages/FactuurAanmaken.tsx` | REPLACE | ~280 |

---

## Fase 5: Dependencies Check

Alle benodigde UI componenten zijn beschikbaar:
- ✅ Table, TableBody, TableCell, etc. (`@/components/ui/table`)
- ✅ Tabs, TabsList, TabsTrigger, TabsContent (`@/components/ui/tabs`)
- ✅ Select, SelectTrigger, SelectContent, SelectItem (`@/components/ui/select`)
- ✅ Dialog, DialogContent, etc. (`@/components/ui/dialog`)
- ✅ AlertDialog components (`@/components/ui/alert-dialog`)
- ✅ DropdownMenu components (`@/components/ui/dropdown-menu`)
- ✅ date-fns voor datum formatting

### Hooks Check

- ✅ `useFactuur` - bevat opdrachtgever relatie data
- ✅ `useUpdateFactuur` - bevat `updateStatus` functie
- ✅ `useDeleteFactuur` - bevat status check voor CONCEPT
- ✅ `useCreateFactuur` - retourneert factuur met id
- ⚠️ `useClientOrganizations` - MOET AANGEMAAKT WORDEN

---

## Verificatie Checklist

Na implementatie:

| Check | Item |
|-------|------|
| [ ] | `/facturatie/:id` laadt factuur data |
| [ ] | StatusBadge toont correcte kleuren |
| [ ] | 4 Tabs werken (Details, Regels, Betalingen, Herinneringen) |
| [ ] | Betaling registreren dialog opent |
| [ ] | Status wijzigen dialog opent |
| [ ] | `/facturatie/nieuw` laadt wizard |
| [ ] | Stap 1: Opdrachtgever selectie werkt |
| [ ] | Stap 2: Regels toevoegen/verwijderen werkt |
| [ ] | Stap 3: Totalen kloppen |
| [ ] | Factuur aanmaken werkt + redirect naar detail |
| [ ] | Geen TypeScript errors |
