

# M6 Facturatie Module - Implementatieplan

## Overzicht

Dit plan implementeert een complete facturatiemodule met database tabellen, triggers, RLS policies, TypeScript types en React hooks.

---

## Fase 1: Database Schema

### 1.1 Nieuwe Tabellen

| Tabel | Doel |
|-------|------|
| `factuur` | Hoofdtabel voor facturen met status workflow |
| `factuur_regel` | Factuurregels met automatische totaalberekening |
| `betaling` | Betalingsregistraties |
| `factuur_herinnering` | Herinneringslogs |
| `factuur_nummer_sequence` | Thread-safe factuurnummering per tenant/jaar |

### 1.2 Belangrijke Foreign Keys

- `factuur.tenant_id` → `organizations.id`
- `factuur.opdrachtgever_id` → `client_organizations.id`
- `factuur.flexwerker_id` → `professionals.id`

### 1.3 Features

- **Automatische factuurnummering**: Format `{ORG}-{JAAR}-{NUMMER}` (bijv. ABC-2026-000001)
- **Generated columns**: Subtotaal, BTW en totaal automatisch berekend op regelsniveau
- **Advisory locks**: Race condition preventie bij gelijktijdige inserts
- **Soft deletes**: `deleted_at` kolom voor archivering

---

## Fase 2: Database Triggers

### 2.1 Trigger: Auto-generatie Factuurnummer

Genereert uniek factuurnummer bij INSERT:
- Haalt organisatie code op (eerste 3 letters)
- Gebruikt advisory lock voor thread safety
- Format: `{ORG}-{JAAR}-{VOLGNUMMER}`

### 2.2 Trigger: Auto-update Factuur Bedragen

Herberekent factuur totalen bij wijzigingen in `factuur_regel`:
- SUM van alle regels → `factuur.subtotaal`, `btw_bedrag`, `totaal`
- Berekent `openstaand_bedrag` op basis van betalingen

### 2.3 Trigger: Auto-update Status bij Betaling

Bij nieuwe betaling:
- Update `betaald_bedrag` en `openstaand_bedrag`
- Zet status automatisch naar `BETAALD` als openstaand ≤ 0

---

## Fase 3: Row Level Security (RLS)

### 3.1 Beveiligingsmodel

Alle tabellen gebruiken organisatie-gebaseerde toegangscontrole via `user_organizations`:

```text
┌────────────────────────────────────────────────────────────────┐
│  RLS FLOW                                                      │
│                                                                │
│  User Request                                                  │
│       │                                                        │
│       ▼                                                        │
│  auth.uid() → user_organizations.user_id                       │
│       │                                                        │
│       ▼                                                        │
│  user_organizations.org_id = factuur.tenant_id?                │
│       │                                                        │
│       ├─── JA → Toegang verleend                               │
│       │                                                        │
│       └─── NEE → Toegang geweigerd                             │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Speciale Restricties

| Tabel | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|
| `factuur` | Alleen status=CONCEPT | Altijd (org members) | Alleen CONCEPT |
| `factuur_regel` | Alleen bij CONCEPT factuur | Alleen bij CONCEPT factuur | Alleen bij CONCEPT factuur |
| `betaling` | Niet bij CONCEPT/AFGEBOEKT | Altijd (org members) | Altijd (org members) |

---

## Fase 4: TypeScript Types

### 4.1 Nieuw Bestand: `src/types/facturatie.ts`

Bevat:
- Enums: `FactuurStatus`, `FactuurType`, `BetalingMethode`, `HerinneringNiveau`, `BtwPercentage`
- Interfaces: `Factuur`, `FactuurRegel`, `Betaling`, `FactuurHerinnering`
- Form input types: `CreateFactuurInput`, `UpdateFactuurInput`, `CreateBetalingInput`
- Filter types: `FactuurFilters`
- Response types: `FactuurWithDetails`, `FactuurListItem`, `FactuurStats`
- UI constants: Labels, kleuren voor statussen

### 4.2 Correctie op Specificatie

De professionals tabel heeft WEL een `email` kolom, dus de `FactuurWithDetails.flexwerker` type wordt uitgebreid:

```typescript
flexwerker: {
  id: string;
  full_name: string;
  email: string | null;  // Toegevoegd - bestaat in database
} | null;
```

---

## Fase 5: React Hooks

### 5.1 Nieuwe Map: `src/hooks/facturatie/`

| Bestand | Doel |
|---------|------|
| `constants.ts` | Query keys, stale times, debounce constants |
| `useFacturen.ts` | Query hook voor lijst met filtering, paginatie, realtime |
| `useFactuur.ts` | Query hook voor single factuur met details |
| `useCreateFactuur.ts` | Mutation hook voor aanmaken |
| `useUpdateFactuur.ts` | Mutation hook voor bijwerken + status wijzigen |
| `useDeleteFactuur.ts` | Mutation hook voor soft delete |
| `useCreateBetaling.ts` | Mutation hook voor betalingen |
| `useFactuurStats.ts` | Query hook voor dashboard statistieken |
| `index.ts` | Barrel export |

### 5.2 Architectuur Patronen (Conform Bestaande Code)

- TanStack Query met 5 minuten staleTime
- Realtime subscriptions met 200ms debounce
- Toast notificaties voor succes/fout
- Automatische cache invalidatie
- User organization check voor tenant_id

---

## Fase 6: Realtime Subscriptions

Enable realtime voor `factuur` tabel:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.factuur;
```

---

## Technische Details

### Database Migratie Volgorde

1. Tabellen aanmaken
2. Indexen aanmaken
3. Triggers aanmaken
4. RLS enablen
5. RLS policies aanmaken
6. Realtime enablen

### Bestanden Overzicht

| Bestand | Actie |
|---------|-------|
| Database migration | CREATE: 5 tabellen, 3 triggers, indexen, RLS |
| `src/types/facturatie.ts` | CREATE: TypeScript types |
| `src/hooks/facturatie/constants.ts` | CREATE |
| `src/hooks/facturatie/useFacturen.ts` | CREATE |
| `src/hooks/facturatie/useFactuur.ts` | CREATE |
| `src/hooks/facturatie/useCreateFactuur.ts` | CREATE |
| `src/hooks/facturatie/useUpdateFactuur.ts` | CREATE |
| `src/hooks/facturatie/useDeleteFactuur.ts` | CREATE |
| `src/hooks/facturatie/useCreateBetaling.ts` | CREATE |
| `src/hooks/facturatie/useFactuurStats.ts` | CREATE |
| `src/hooks/facturatie/index.ts` | CREATE |

**Totaal: 1 database migratie + 11 nieuwe TypeScript bestanden**

---

## Verificatie Checklist

Na implementatie:
- [ ] Alle 5 tabellen bestaan in database
- [ ] RLS is actief op alle tabellen (`FORCE ROW LEVEL SECURITY`)
- [ ] Factuurnummer wordt automatisch gegenereerd bij insert
- [ ] Bedragen worden automatisch herberekend bij regel wijzigingen
- [ ] Status wordt automatisch BETAALD bij volledige betaling
- [ ] TypeScript compileert zonder fouten
- [ ] `useFacturen()` haalt facturen op
- [ ] `useCreateFactuur()` maakt factuur aan met regels
- [ ] `useCreateBetaling()` registreert betaling
- [ ] Realtime updates werken

---

## Toekomstige Uitbreidingen (Niet in Scope)

- Facturatie pagina (`/facturatie`) en UI componenten
- PDF generatie
- E-mail verzending
- Automatische herinneringen

