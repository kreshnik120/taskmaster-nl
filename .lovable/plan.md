

# Diagnose & Fix: Runtime Error bij Taak Aanmaken

## Situatie

Leonie krijgt een "Runtime Error" bij het aanmaken van een nieuwe taak. De exacte locatie (TaskDialog of Notulen Assistent) is onbekend, en er zijn geen specifieke error logs beschikbaar.

## Mogelijke Oorzaken

### 1. Chunk Loading Error (Meest Waarschijnlijk)
De applicatie heeft een update ontvangen en de browser probeert verouderde code te laden.
- **Indicatie**: Error bevat "Failed to fetch dynamically imported module"
- **Oplossing**: Pagina herladen lost dit meestal op

### 2. Database Constraint Violation
De `tasks` tabel vereist bepaalde velden die mogelijk `null` zijn:
- `org_id` is `NOT NULL` - als de organisatie niet correct wordt opgehaald
- `priority` is `NOT NULL` - moet een geldige waarde hebben
- `title` is `NOT NULL` - moet ingevuld zijn

### 3. Null Reference Error
In de `useCreateTasksFromItems.ts` (Notulen → Taken):
- Regel 259: `item.action.substring(0, 100)` - kan falen als `item.action` `undefined` is
- Als de AI extractie een item retourneert zonder `action` veld

---

## Voorgestelde Fixes

### Fix 1: Defensieve Null Checks in useCreateTasksFromItems

**Bestand**: `src/hooks/notulen/useCreateTasksFromItems.ts`

**Wijziging**: Voeg defensieve checks toe voor de task title:

```typescript
// Regel 258-259 wijzigen van:
title: item.action.substring(0, 100),

// Naar:
title: (item.action || 'Taak uit notule').substring(0, 100),
```

### Fix 2: Verbeter TaskDialog Error Handling

**Bestand**: `src/components/TaskDialog.tsx`

**Wijziging**: Voeg betere error logging toe:

```typescript
// In catch block (regel 283-284):
} catch (error: any) {
  console.error('[TaskDialog] Create task error:', error);
  toast.error("Fout bij aanmaken taak", { 
    description: error?.message || 'Onbekende fout - probeer de pagina te herladen'
  });
}
```

### Fix 3: Voeg Retry Mechanisme toe na Chunk Error

De ErrorBoundary toont al een "Pagina Herladen" knop. Geen wijziging nodig.

---

## Technische Details

### Bestanden die aangepast worden:

| Bestand | Wijziging |
|---------|-----------|
| `src/hooks/notulen/useCreateTasksFromItems.ts` | Defensieve null check voor `item.action` |
| `src/components/TaskDialog.tsx` | Verbeterde error logging |

### Test Scenario's:

1. **Nieuwe taak via Dashboard/Kanban/Lijst**
   - Open TaskDialog
   - Vul alleen titel in
   - Sla op
   - Verwacht: Taak wordt aangemaakt, geen error

2. **Nieuwe taak via Notulen Assistent**
   - Upload PDF met action items
   - Selecteer items en klik "Maak taken"
   - Verwacht: Taken worden aangemaakt, geen error

---

## Aanbeveling voor Leonie

**Directe oplossing**: Verzoek Leonie om:
1. De pagina te herladen (Ctrl+F5 of Cmd+Shift+R)
2. Opnieuw in te loggen
3. De actie nogmaals te proberen

Als het probleem blijft bestaan, vraag dan om een screenshot van de error details (klik op "Component Stack" in het error scherm).

---

## Samenvatting

De Runtime Error is hoogstwaarschijnlijk een tijdelijk chunk loading probleem door een recente update. De voorgestelde code fixes voegen defensieve programmering toe om toekomstige null reference errors te voorkomen.

