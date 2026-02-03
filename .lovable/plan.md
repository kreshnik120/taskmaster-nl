
# Fix: 0% BTW Bug - Nullish Coalescing Operator

## Probleem

De 0% BTW optie werkt niet correct. Bij selectie van 0% BTW wordt toch 21% berekend.

**Oorzaak:** JavaScript OR operator (`||`) behandelt `0` als "falsy" waarde:
```javascript
0 || 21  // Geeft 21 terug (FOUT!)
0 ?? 21  // Geeft 0 terug (CORRECT!)
```

## Oplossing

Vervang alle `||` operators door `??` (nullish coalescing) op 4 locaties in `FactuurAanmaken.tsx`.

## Wijzigingen

### Bestand: `src/pages/FactuurAanmaken.tsx`

| Regel | Wijziging |
|-------|-----------|
| 112 | `regel.btw_percentage \|\| 21` → `regel.btw_percentage ?? 21` |
| 295 | `regel.btw_percentage \|\| 21` → `regel.btw_percentage ?? 21` |
| 335 | `regel.btw_percentage \|\| 21` → `regel.btw_percentage ?? 21` |
| 476 | `regel.btw_percentage \|\| 21` → `regel.btw_percentage ?? 21` |

### Details per locatie

**Regel 112 - BTW berekening in `calculateTotals`:**
```typescript
// Van:
const regelBtw = regelSubtotaal * ((regel.btw_percentage || 21) / 100);
// Naar:
const regelBtw = regelSubtotaal * ((regel.btw_percentage ?? 21) / 100);
```

**Regel 295 - Regeltotaal in tabel (Stap 2):**
```typescript
// Van:
regel.aantal * regel.prijs * (1 + (regel.btw_percentage || 21) / 100);
// Naar:
regel.aantal * regel.prijs * (1 + (regel.btw_percentage ?? 21) / 100);
```

**Regel 335 - BTW dropdown value:**
```typescript
// Van:
value={String(regel.btw_percentage || 21)}
// Naar:
value={String(regel.btw_percentage ?? 21)}
```

**Regel 476 - Regeltotaal in overzicht (Stap 3):**
```typescript
// Van:
regel.aantal * regel.prijs * (1 + (regel.btw_percentage || 21) / 100)
// Naar:
regel.aantal * regel.prijs * (1 + (regel.btw_percentage ?? 21) / 100)
```

## Verwacht Resultaat

| Test | Verwacht |
|------|----------|
| Prijs €45 + 0% BTW | Totaal = €45,00 |
| Prijs €45 + 9% BTW | Totaal = €49,05 |
| Prijs €45 + 21% BTW | Totaal = €54,45 |
