
# Uitgebreid Mobile Responsive Herstelplan

## Samenvatting van het Onderzoek

Ik heb alle pagina's systematisch getest op een mobiel viewport (390x844 - iPhone standaard). Hieronder de resultaten per pagina met **bewijs uit screenshots en code-analyse**.

---

## Geïdentificeerde Problemen per Pagina

### Categorie A: KRITIEK - Tabellen zonder Mobiele Kaartweergave

Deze pagina's tonen **volledige tabellen op mobiel** die horizontaal scrollen en onbruikbaar zijn:

| Pagina | Component | Kolommen | Status |
|--------|-----------|----------|--------|
| Dashboard > Lijst | `EmbeddedListView.tsx` | 11 kolommen | **KRITIEK** - Leonie's probleem |
| Notulen | `Notulen.tsx` | 6 kolommen | **KRITIEK** - Titel/Type/Datum afgesneden |
| Facturatie | `Facturatie.tsx` | 8 kolommen | **KRITIEK** - Bedragen niet leesbaar |
| Bijlagen | `Bijlagen.tsx` | 6 kolommen | **KRITIEK** - Bestandsnamen afgesneden |
| Verwijderde Taken | `VerwijderdeTaken.tsx` | 5 kolommen | **HOOG** - Actieknoppen buiten scherm |
| Tijdregistratie | `Tijdregistratie.tsx` | 5 kolommen | **HOOG** - Timer tabel overflow |

### Categorie B: GOED - Al Responsive

| Pagina | Reden |
|--------|-------|
| Sollicitaties | Kanban met horizontale scroll + kaarten |
| Plaatsingen | Gebruikt Card-based layout (geen tabel) |
| Dashboard > Mijn Werk | Kaartweergave + ambient mesh fix |
| Dashboard > Kalender | Responsive dag/weekweergave |
| Dashboard > Opvolging | Kaart-based focus taken |

---

## Technische Oplossing: Mobile Card Pattern

### Patroon dat We Implementeren

Zoals `TaskListView.tsx` al correct doet:

```text
// Code pattern (vereenvoudigd)
const isMobile = useIsMobile();

return isMobile 
  ? <MobileCardView data={tasks} />  // Touch-friendly kaarten
  : <DesktopTableView data={tasks} /> // Desktop tabel
```

### Stap 1: Nieuwe Herbruikbare Component - `MobileTableCards.tsx`

Maak een generieke kaart-component die elke tabel kan vervangen:

**Bestand:** `src/components/ui/mobile-table-cards.tsx`

```text
+-----------------------------------------------+
| [Icon] Primaire Tekst           [Badge]       |
| Secundaire tekst                              |
| [Meta 1] · [Meta 2] · [Meta 3]                |
| [Actie 1] [Actie 2]                          |
+-----------------------------------------------+
```

Eigenschappen:
- Glassmorphism styling consistent met design system
- Touch targets van minimaal 44x44px
- Swipe-acties (optioneel)
- Toegankelijkheid met `role="list"` en `role="listitem"`

---

### Stap 2: Fix per Pagina

#### 2.1 EmbeddedListView.tsx (Dashboard > Lijst) - PRIORITEIT 1

**Wijzigingen:**
1. Import `useIsMobile` hook
2. Maak `EmbeddedListCards.tsx` component
3. Conditionele rendering: kaarten op mobiel, tabel op desktop

**Mobiele kaart toont:**
- Titel (prominent)
- Eigenaar (avatar + naam)
- Prioriteit (badge)
- Deadline (met urgentie-kleur)
- Actieknoppen (Accepteren, Voltooien, Verwijderen)

---

#### 2.2 Notulen.tsx - PRIORITEIT 2

**Huidige structuur (6 kolommen):**
- Titel | Type | Datum | Deelnemers | Status | Acties

**Mobiele kaart toont:**
- Titel (hoofdtekst)
- Type badge + Status badge (inline)
- Datum + Deelnemers (meta-regel)
- Tap om te openen

**Wijzigingen:**
1. Import `useIsMobile`
2. Maak `NotulenCards.tsx` 
3. Conditionele rendering

---

#### 2.3 Facturatie.tsx - PRIORITEIT 2

**Huidige structuur (8 kolommen):**
- Factuurnummer | Opdrachtgever | Datum | Vervaldatum | Status | Totaal | Openstaand | Acties

**Mobiele kaart toont:**
- Factuurnummer + Status badge
- Opdrachtgever naam
- Totaal bedrag (prominent)
- Datum + Vervaldatum (meta)
- Openstaand bedrag indien > 0

**Wijzigingen:**
1. Import `useIsMobile`
2. Maak `FacturatieCards.tsx`
3. Conditionele rendering

---

#### 2.4 Bijlagen.tsx - PRIORITEIT 3

**Huidige structuur (6 kolommen):**
- Bestand | Taak | Type | Grootte | Geüpload | Acties

**Mobiele kaart toont:**
- Bestandsnaam + type icon
- Gekoppelde taak
- Grootte + upload datum (meta)
- Preview/Download knoppen

---

#### 2.5 VerwijderdeTaken.tsx - PRIORITEIT 3

**Huidige structuur (5 kolommen):**
- Taak | Organisatie | Prioriteit | Verwijderd op | Acties

**Mobiele kaart toont:**
- Taaknaam
- Organisatie + Prioriteit badge
- Verwijderdatum
- Herstel/Definitief verwijderen knoppen

---

#### 2.6 Tijdregistratie.tsx - PRIORITEIT 3

**Huidige structuur (5 kolommen):**
- Taak | Datum | Tijd | Duur | Acties

**Mobiele kaart toont:**
- Taaknaam
- Datum + Tijdsbereik
- Duur (prominent)
- Notitie (indien aanwezig)
- Verwijder knop

---

## Preventieve Maatregelen

### Maatregel 1: Design System Regel

**Nieuwe conventie in `src/lib/constants/designTokens.ts`:**

```text
// Mobile breakpoint constants
export const MOBILE_BREAKPOINT = 768;

// Minimum touch target size (WCAG 2.1 AA)
export const MIN_TOUCH_TARGET = 44;

// Table column limits for responsive design
export const MAX_MOBILE_TABLE_COLUMNS = 3;
```

### Maatregel 2: Tabel Wrapper Component

**Nieuw bestand:** `src/components/ui/responsive-table.tsx`

Een wrapper die automatisch detecteert of er meer dan 3 kolommen zijn en een waarschuwing logt tijdens development, of automatisch naar kaartweergave switcht.

### Maatregel 3: Code Review Checklist

Bij elke nieuwe tabel:
1. Gebruik `useIsMobile()` hook
2. Maak mobiele kaart-alternatief
3. Test op 390px viewport
4. Controleer touch targets (min 44px)

---

## Implementatie Volgorde

| Fase | Pagina's | Geschatte Tijd |
|------|----------|----------------|
| 1 | EmbeddedListView (Leonie's probleem) | Direct |
| 2 | Notulen + Facturatie | Daarna |
| 3 | Bijlagen + VerwijderdeTaken + Tijdregistratie | Vervolgens |
| 4 | Preventieve componenten + Design tokens | Afsluitend |

---

## Verwachte Resultaten

| Metriek | Vóór | Na |
|---------|------|-----|
| Pagina's met mobiele tabel-overflow | 6 | 0 |
| Horizontale scroll vereist | Ja | Nee |
| Touch-friendly interface | Gedeeltelijk | Volledig |
| Leonie's probleem | Niet opgelost | Opgelost |

---

## Technische Details

### useIsMobile Hook (bestaand)

Locatie: `src/hooks/use-mobile.tsx`
Breakpoint: 768px

Huidige gebruikers:
- `TaskListView.tsx` (correct)
- `WhatsApp.tsx` (correct)
- `sidebar.tsx` (correct)

Pagina's die dit MOETEN gebruiken:
- `EmbeddedListView.tsx` (ontbreekt)
- `Notulen.tsx` (ontbreekt)
- `Facturatie.tsx` (ontbreekt)
- `Bijlagen.tsx` (ontbreekt)
- `VerwijderdeTaken.tsx` (ontbreekt)
- `Tijdregistratie.tsx` (ontbreekt)

### Consistentie met Bestaand Patroon

`TaskListCards.tsx` is het referentiepatroon:
- Role="list" voor accessibility
- Glass styling met `glass-hover-lift`
- Responsive metadata layout
- Touch-friendly actieknoppen
