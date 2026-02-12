
# Fix: 24-uurs detectie useEffect toevoegen

## Probleem
De `show24hConfirm` state en het AlertDialog-component zijn correct geimplementeerd, maar de **useEffect die detecteert wanneer start- en eindtijd gelijk zijn** ontbreekt volledig. Hierdoor wordt de 24-uurs bevestigingsdialoog nooit getoond.

## Oplossing
Een useEffect toevoegen in `NieuweDienstModal.tsx` die `startTijd` en `eindTijd` monitort:

```typescript
useEffect(() => {
  if (startTijd && eindTijd && startTijd === eindTijd) {
    setShow24hConfirm(true);
  } else {
    setShow24hConfirm(false);
  }
}, [startTijd, eindTijd]);
```

## Locatie
Bestand: `src/components/planning/NieuweDienstModal.tsx`, direct na het bestaande "Auto-detect dienst type" useEffect blok (rond regel 240).

## Impact
- 1 bestand, 1 toevoeging (7 regels)
- Geen andere wijzigingen nodig; state + AlertDialog zijn al correct
