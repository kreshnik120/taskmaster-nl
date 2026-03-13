

# BENDY-REQ-7C: Fix geannuleerde diensten niet zichtbaar

## Oorzaak

De functie `splitByStatus()` in `useDienstenPlanning.ts` splitst diensten in twee groepen:
- **open**: `["open", "deels_bezet", "concept"]`
- **ingepland**: `["volledig_bezet", "voltooid"]`

Status `geannuleerd` valt in **geen van beide** groepen. De kalenderviews (week + maand) renderen alleen `open` en `ingepland`, dus geannuleerde diensten verdwijnen volledig.

## Wijzigingen

### 1. `splitByStatus` uitbreiden (`useDienstenPlanning.ts`, regels 104-112)

Voeg een derde categorie `geannuleerd` toe:

```typescript
export function splitByStatus(diensten: DienstData[]) {
  return {
    open: diensten.filter((d) =>
      ["open", "deels_bezet", "concept"].includes(d.status)
    ),
    ingepland: diensten.filter((d) =>
      ["volledig_bezet", "voltooid"].includes(d.status)
    ),
    geannuleerd: diensten.filter((d) => d.status === "geannuleerd"),
  };
}
```

### 2. `PlanningWeekKalender.tsx` — geannuleerde diensten tonen

- Destructure `geannuleerd` uit `splitByStatus`
- Voeg een derde sectie toe (na ingepland) die alleen toont als het statusfilter op `geannuleerd` staat
- Diensten tonen met visuele indicator (doorgestreept of grijze stijl)

### 3. `PlanningMaandKalender.tsx` — geannuleerde diensten tonen

- Voeg `geannuleerd` toe aan `visibleDiensten` wanneer het statusfilter actief is
- Gebruik dezelfde visuele stijl als weekview

### 4. Props doorvoeren

Check welke parent component `showOpen` / `showIngepland` doorgeeft en voeg `showGeannuleerd` toe, gebaseerd op `filters.status === 'geannuleerd'`.

### Verificatie
- Filter op "Geannuleerd" → 109 diensten zichtbaar
- Zonder filter → geannuleerde diensten verborgen (correct gedrag)

