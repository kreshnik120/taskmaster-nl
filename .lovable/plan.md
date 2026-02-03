
# M6 FACTURATIE - DEEL 2: PDF Generatie + Export Functionaliteit

## Overzicht

Dit plan implementeert de PDF generatie en export functionaliteit voor de Facturatie module. DEEL 1 is compleet - alle benodigde types en hooks zijn aanwezig.

---

## Status DEEL 1 Verificatie

| Component | Status |
|-----------|--------|
| `src/types/facturatie.ts` | Compleet - bevat `FacturatieInstellingen`, `FactuurExportRow`, `ExportFormat` |
| `src/hooks/facturatie/useFactuurExport.ts` | Compleet - CSV en Excel export functionaliteit |
| `src/hooks/facturatie/useFacturatieInstellingen.ts` | Compleet - settings ophalen en opslaan |
| `xlsx` package | Geïnstalleerd (package.json regel 75) |

---

## Dependencies

**Te installeren:**
- `@react-pdf/renderer` - Voor professionele PDF generatie

**Reeds aanwezig:**
- `xlsx` - Al geïnstalleerd voor Excel export
- `jspdf` + `jspdf-autotable` - Al aanwezig (alternatief voor PDF indien nodig)

---

## Wijzigingen per Bestand

### 1. Nieuwe Bestanden - PDF Componenten

#### 1.1 `src/components/facturatie/pdf/FactuurPDFDocument.tsx`

React-PDF document component met:
- Professionele A4 layout
- Bedrijfsgegevens uit `facturatie_instellingen`
- Factuurregels tabel
- Totalen sectie (subtotaal, BTW, totaal)
- Betalingsgegevens (IBAN, BIC, betalingskenmerk)
- Status badge (kleur per status)
- Nederlandse datumnotatie
- Footer tekst uit instellingen

#### 1.2 `src/components/facturatie/pdf/FactuurPDFDownloadButton.tsx`

Herbruikbare download button component:
- Genereert PDF on-click
- Loading state tijdens generatie
- Toast notification bij succes/fout
- Bestandsnaam: `{factuurnummer}.pdf`
- Props: `factuur`, `variant`, `size`, `className`

#### 1.3 `src/components/facturatie/pdf/index.ts`

Export barrel file voor PDF componenten.

---

### 2. Nieuwe Bestanden - Export Dialog

#### 2.1 `src/components/facturatie/FactuurExportDialog.tsx`

Modal dialog voor bulk export:
- Radio group: Excel (xlsx) of CSV formaat
- Info over welke kolommen worden geëxporteerd
- Teller: aantal te exporteren facturen
- Ondersteunt filters en geselecteerde IDs
- Gebruikt bestaande `useFactuurExport` hook

---

### 3. Bestaande Bestanden Aanpassen

#### 3.1 `src/components/facturatie/index.ts`

Toevoegen aan exports:
```typescript
// PDF
export { FactuurPDFDocument } from './pdf/FactuurPDFDocument';
export { FactuurPDFDownloadButton } from './pdf/FactuurPDFDownloadButton';

// Dialog
export { FactuurExportDialog } from './FactuurExportDialog';
```

#### 3.2 `src/pages/FactuurDetail.tsx`

**Locatie 1 - Regel 455-458 (Acties Card):**

Vervang placeholder "Download PDF" button met:
```tsx
<FactuurPDFDownloadButton
  factuur={factuur}
  variant="outline"
  className="w-full justify-start"
/>
```

**Locatie 2 - Regel 198-201 (Dropdown Menu):**

Vervang placeholder menu item met werkende PDF download actie.

**Import toevoegen:**
```typescript
import { FactuurPDFDownloadButton } from "@/components/facturatie";
```

#### 3.3 `src/pages/Facturatie.tsx`

**Imports toevoegen:**
```typescript
import { Download } from "lucide-react";
import { FactuurExportDialog } from "@/components/facturatie";
```

**State toevoegen:**
```typescript
const [showExportDialog, setShowExportDialog] = useState(false);
```

**Header buttons uitbreiden (regel 241-253):**
```tsx
<div className="flex items-center gap-2">
  <Button
    variant="outline"
    onClick={() => navigate("/facturatie/instellingen")}
  >
    <Settings className="h-4 w-4 sm:mr-2" />
    <span className="hidden sm:inline">Instellingen</span>
  </Button>
  <Button
    variant="outline"
    onClick={() => setShowExportDialog(true)}
  >
    <Download className="h-4 w-4 sm:mr-2" />
    <span className="hidden sm:inline">Exporteren</span>
  </Button>
  <Button onClick={() => navigate("/facturatie/nieuw")}>
    <Plus className="mr-2 h-4 w-4" />
    Nieuwe factuur
  </Button>
</div>
```

**Dialog toevoegen (voor sluitende `</div>` tag):**
```tsx
<FactuurExportDialog
  open={showExportDialog}
  onOpenChange={setShowExportDialog}
  filters={currentFilters}
  totalCount={facturen?.length || 0}
/>
```

---

## Technische Details

### PDF Styling

```text
+------------------------------------------+
|  [Logo]              Bedrijfsnaam        |
|                      Adres               |
|                      KvK / BTW           |
+------------------------------------------+
|                                          |
|  FACTUUR                    [BETAALD]    |
|                                          |
+------------------------------------------+
|  FACTUURADRES      |  FACTUURDETAILS     |
|  Klantnaam         |  Nummer: FAC-2024-1 |
|                    |  Datum: 1 jan 2024  |
|                    |  Vervalt: 31 jan    |
+------------------------------------------+
|  REGELS TABEL                            |
|  Omschrijving | Aantal | Prijs | Totaal  |
|  ─────────────────────────────────────── |
|  Dienst A     |    10  | €50   | €500    |
|  Dienst B     |     5  | €30   | €150    |
+------------------------------------------+
|                    Subtotaal   €650,00   |
|                    BTW 21%     €136,50   |
|                    ─────────────────────  |
|                    TOTAAL      €786,50   |
+------------------------------------------+
|  BETALINGSGEGEVENS                       |
|  IBAN: NL12ABCD0123456789                |
|  Kenmerk: FAC-2024-0001                  |
|  Termijn: 30 dagen                       |
+------------------------------------------+
|  Footer tekst (uit instellingen)         |
+------------------------------------------+
```

### Export Formaten

| Formaat | Separator | Decimaal | Encoding |
|---------|-----------|----------|----------|
| CSV | `;` (puntkomma) | `,` (komma) | UTF-8 BOM |
| Excel | N/A | Numeriek | XLSX |

---

## Bestanden Overzicht

### Nieuwe Bestanden (4)

1. `src/components/facturatie/pdf/FactuurPDFDocument.tsx`
2. `src/components/facturatie/pdf/FactuurPDFDownloadButton.tsx`
3. `src/components/facturatie/pdf/index.ts`
4. `src/components/facturatie/FactuurExportDialog.tsx`

### Aan te passen Bestanden (3)

1. `src/components/facturatie/index.ts` - Exports toevoegen
2. `src/pages/FactuurDetail.tsx` - PDF button integreren
3. `src/pages/Facturatie.tsx` - Export button + dialog toevoegen

---

## Impactanalyse

- Geen database wijzigingen nodig
- Geen breaking changes
- Volledig client-side PDF generatie
- Export hook al getest en werkend

---

## Verificatie Na Implementatie

| Functie | Test |
|---------|------|
| PDF Download | Klik "Download PDF" op factuur detail |
| PDF Inhoud | Controleer bedrijfsgegevens, regels, totalen |
| Status Badge | Controleer kleur per status type |
| Export Dialog | Klik "Exporteren" op overzicht |
| CSV Export | Download en open in Excel |
| Excel Export | Download en controleer kolommen |
| Nederlandse Notatie | Datums en bedragen correct |
