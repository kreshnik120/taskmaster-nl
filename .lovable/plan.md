

# M6 Facturatie - Betalingen + Herinneringen UI (DEEL 2 van 2)

## Overzicht

Dit plan implementeert de herinneringen componenten en integreert alle nieuwe componenten in de FactuurDetail pagina. DEEL 1 is compleet (hooks + betalingen componenten).

---

## Fase 1: HerinneringenPanel Component

**Nieuw bestand:** `src/components/facturatie/HerinneringenPanel.tsx`

### Structuur

```text
┌─────────────────────────────────────────────────────────────┐
│ 🔔 Betalingsherinneringen           ⚠️ 14 dagen over verval │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [NIVEAU 1] Eerste herinnering        [✓ Verstuurd]     │ │
│ │ Toon: Vriendelijk • Na 14 dagen                        │ │
│ │ ─────────────────────────────────────                  │ │
│ │ 📅 1 januari 2025 om 14:30                             │ │
│ │ 📧 factuur@bedrijf.nl                                  │ │
│ │ Openstaand op dat moment: €1.210,00                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [NIVEAU 2] Tweede herinnering       [Versturen →]      │ │
│ │ Toon: Formeel • Na 28 dagen                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [NIVEAU 3] Laatste herinnering      [⏳ Wachten]        │ │
│ │ Toon: Escalatie • Na 42 dagen                          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Logica

| Conditie | Gedrag |
|----------|--------|
| `sentNiveaus.has(niveau)` | Toon "Verstuurd" badge + details |
| `canSendReminder(niveau)` | Toon "Versturen" button |
| Niveau 2 zonder niveau 1 | Toon "Wachten" |
| Niveau 3 zonder niveau 2 | Toon "Wachten" |
| Status BETAALD/AFGEBOEKT | Herinneringen uitgeschakeld |
| Geen e-mailadres | Warning message |

### Props

```typescript
interface HerinneringenPanelProps {
  factuurId: string;
  factuurNummer: string;
  factuurStatus: FactuurStatus;
  openstaandBedrag: number;
  opdrachtgeverEmail: string | null;
  vervaldatum: string;
}
```

---

## Fase 2: HerinneringVersturenDialog Component

**Nieuw bestand:** `src/components/facturatie/HerinneringVersturenDialog.tsx`

### Features

| Feature | Beschrijving |
|---------|--------------|
| E-mail preview | Toont onderwerp + intro per niveau |
| Niveau indicatie | Badge met "Vriendelijk", "Formeel", of "Escalatie" |
| Niveau 3 warning | Extra waarschuwing voor laatste herinnering |
| E-mail validatie | Regex check voor geldig e-mailadres |
| CC optie | Alleen bij niveau 3 (bijv. voor manager) |
| Status info | Alert dat status automatisch wordt bijgewerkt |

### E-mail Templates

```typescript
const EMAIL_TEMPLATES: Record<HerinneringNiveau, {...}> = {
  1: {
    subject: "Herinnering: Factuur {nummer} nog niet ontvangen",
    intro: "Graag willen wij u vriendelijk herinneren...",
    tone: "Vriendelijk",
  },
  2: {
    subject: "Tweede herinnering: Factuur {nummer} - betaling nog niet ontvangen",
    intro: "Ondanks onze eerdere herinnering...",
    tone: "Formeel",
  },
  3: {
    subject: "LAATSTE HERINNERING: Factuur {nummer} - directe actie vereist",
    intro: "Ondanks meerdere herinneringen...",
    tone: "Escalatie",
  },
};
```

---

## Fase 3: FactuurDetail Pagina Updates

**Bestand:** `src/pages/FactuurDetail.tsx`

### Wijzigingen

| Locatie | Wijziging |
|---------|-----------|
| Imports | + `BetalingenHistorie`, `HerinneringenPanel` |
| TabsContent "betalingen" | Vervangen door `<BetalingenHistorie>` component |
| TabsContent "herinneringen" | Vervangen door `<HerinneringenPanel>` component |
| BetalingRegistrerenDialog | + `factuurNummer`, `totaalBedrag`, `reedsBetaald` props |
| Acties Card | + "Herinnering versturen" button (conditioneel) |

### Nieuwe BetalingenHistorie Props

```jsx
<BetalingenHistorie
  factuurId={factuur.id}
  openstaandBedrag={factuur.openstaand_bedrag}
  totaalBedrag={factuur.totaal}
  onRegisterPayment={() => setShowBetalingDialog(true)}
  canRegisterPayment={canRegisterPayment}
/>
```

### Nieuwe HerinneringenPanel Props

```jsx
<HerinneringenPanel
  factuurId={factuur.id}
  factuurNummer={factuur.factuur_nummer}
  factuurStatus={factuur.status}
  openstaandBedrag={factuur.openstaand_bedrag}
  opdrachtgeverEmail={factuur.opdrachtgever?.centrale_facturatie_email || null}
  vervaldatum={factuur.vervaldatum}
/>
```

### Bijgewerkte BetalingRegistrerenDialog

```jsx
<BetalingRegistrerenDialog
  open={showBetalingDialog}
  onOpenChange={setShowBetalingDialog}
  factuurId={factuur.id}
  factuurNummer={factuur.factuur_nummer}
  openstaandBedrag={factuur.openstaand_bedrag}
  totaalBedrag={factuur.totaal}
  reedsBetaald={factuur.betaald_bedrag}
/>
```

---

## Fase 4: Quick Actions Update

**Bestand:** `src/pages/FactuurDetail.tsx` (Acties Card)

Toevoegen na "E-mail verzenden" button:

```jsx
{canRegisterPayment && factuur.openstaand_bedrag > 0 && (
  <Button
    variant="outline"
    className="w-full justify-start"
    onClick={() => {
      const tabsTrigger = document.querySelector('[value="herinneringen"]') as HTMLElement;
      if (tabsTrigger) tabsTrigger.click();
    }}
  >
    <Bell className="h-4 w-4 mr-2" />
    Herinnering versturen
  </Button>
)}
```

---

## Fase 5: Componenten Index Update

**Bestand:** `src/components/facturatie/index.ts`

```typescript
// Dialogs
export { BetalingRegistrerenDialog } from './BetalingRegistrerenDialog';
export { BetalingBewerkDialog } from './BetalingBewerkDialog';
export { StatusWijzigenDialog } from './StatusWijzigenDialog';
export { HerinneringVersturenDialog } from './HerinneringVersturenDialog';

// Panels
export { BetalingenHistorie } from './BetalingenHistorie';
export { HerinneringenPanel } from './HerinneringenPanel';
```

---

## Bestanden Overzicht

| Bestand | Actie | Regels |
|---------|-------|--------|
| `src/components/facturatie/HerinneringenPanel.tsx` | CREATE | ~180 |
| `src/components/facturatie/HerinneringVersturenDialog.tsx` | CREATE | ~160 |
| `src/pages/FactuurDetail.tsx` | EDIT | ~30 regels wijzigen |
| `src/components/facturatie/index.ts` | EDIT | +2 exports |

---

## Dependencies Check

Alle benodigde componenten zijn beschikbaar:
- Alert, AlertTitle, AlertDescription (`@/components/ui/alert`)
- Badge (`@/components/ui/badge`)
- Card components
- Dialog components
- Separator
- date-fns voor datum formatting
- `useHerinneringen`, `useSendHerinnering` hooks (DEEL 1)

---

## Verificatie Checklist DEEL 2

| Check | Item |
|-------|------|
| [ ] | HerinneringenPanel toont 3 niveaus |
| [ ] | Verstuurd status wordt correct getoond |
| [ ] | Versturen button alleen actief voor volgende niveau |
| [ ] | HerinneringVersturenDialog toont preview |
| [ ] | E-mail validatie werkt |
| [ ] | Niveau 3 toont extra warning |
| [ ] | Herinnering wordt correct opgeslagen |
| [ ] | Factuur status wordt automatisch bijgewerkt |
| [ ] | Geen herinneringen mogelijk voor BETAALD facturen |
| [ ] | Warning bij ontbrekend e-mailadres |
| [ ] | FactuurDetail tabs gebruiken nieuwe componenten |
| [ ] | Quick action "Herinnering versturen" werkt |
| [ ] | Geen TypeScript errors |

---

## Na DEEL 2 Succes

M6 FACTURATIE MODULE IS COMPLEET!

Voltooide functionaliteit:
- Facturen aanmaken, bewerken, verwijderen
- Factuurregels met BTW berekening
- Betalingen registreren, bewerken, verwijderen
- Betalingen voortgang tracking
- 3-niveau herinneringen systeem
- Automatische status updates
- E-mail preview per herinnering niveau

