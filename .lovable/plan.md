
# Plan: Verloop Sectie Slimmer Tonen

## Huidige Situatie

Nu wordt de recente wijziging **twee keer** getoond:
1. **Inline in de beschrijving** - met de mooie groene box + connector + "Gewijzigd door Kreshnik"
2. **In de Verloop sectie eronder** - dezelfde informatie nogmaals

```text
┌────────────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven              │
│ kandidaten binnen Citozorg & Abc zorg.             │
│                                                    │
│          ┆                                         │
│          ▼                                         │
│ ┌──────────────────────────────────────────────┐   │
│ │ ✚ Gewijzigd door Kreshnik • 2 uur geleden    │   │  ← Prima, dit is wat we willen
│ ├──────────────────────────────────────────────┤   │
│ │ Test                                         │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ ─────────── Verloop (2) ───────────                │  ← Dubbel/overbodig?
│ ○ 6 feb • Kreshnik • [Gewijzigd]                   │
│ ○ 5 feb • Kreshnik • [Toegevoegd]                  │
└────────────────────────────────────────────────────┘
```

---

## Oplossing: Slim Verbergen van Verloop

### Gedrag

| Situatie | Actie |
|----------|-------|
| 0 wijzigingen | Geen Verloop tonen (bestaand gedrag) |
| 1 wijziging + recent (<24 uur) + inline getoond | **Verloop verbergen** - info is al inline zichtbaar |
| 1 wijziging + niet recent (>24 uur) | Verloop tonen - voor historie |
| 2+ wijzigingen | Verloop altijd tonen - voor volledige historie |

### Nieuwe Weergave (1 recente wijziging)

```text
┌────────────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven              │
│ kandidaten binnen Citozorg & Abc zorg.             │
│                                                    │
│          ┆                                         │
│          ▼                                         │
│ ┌──────────────────────────────────────────────┐   │
│ │ ✚ Gewijzigd door Kreshnik • 2 uur geleden    │   │
│ ├──────────────────────────────────────────────┤   │
│ │ Test                                         │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│        [Geen Verloop - al inline getoond]          │
└────────────────────────────────────────────────────┘
```

### Nieuwe Weergave (2+ wijzigingen)

```text
┌────────────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven              │
│ ...                                                │
│                                                    │
│          ┆                                         │
│          ▼                                         │
│ ┌──────────────────────────────────────────────┐   │
│ │ ✚ Gewijzigd door Kreshnik • 2 uur geleden    │   │
│ ├──────────────────────────────────────────────┤   │
│ │ Test                                         │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ ─────────── Meer verloop (1) ───────────           │  ← Alleen oudere entries
│ ○ 5 feb • Jan • [Toegevoegd]                       │
└────────────────────────────────────────────────────┘
```

---

## Technische Implementatie

### Bestand: `src/components/DescriptionTimeline.tsx`

**Optie 1: Eerste entry niet tonen als recent**

```typescript
// Bepaal of de meest recente wijziging al inline wordt getoond
const isLatestShowingInline = useMemo(() => {
  if (entries.length === 0) return false;
  const latestEntry = entries[0];
  const changeTime = new Date(latestEntry.created_at).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return (now - changeTime) < twentyFourHours;
}, [entries]);

// Filter entries: als de eerste inline wordt getoond, begin bij index 1
const visibleEntries = isLatestShowingInline ? entries.slice(1) : entries;

// Als er geen visible entries zijn, toon niets
if (visibleEntries.length === 0) {
  return null;
}
```

**Optie 2: Label aanpassen als eerste entry inline is**

```typescript
// In plaats van "Verloop (2)" toon "Meer verloop (1)"
<span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
  <FileText className="h-3 w-3" />
  {isLatestShowingInline ? 'Meer verloop' : 'Verloop'} ({visibleEntries.length})
</span>
```

---

## Samenvatting Wijzigingen

| Bestand | Wijziging |
|---------|-----------|
| `src/components/DescriptionTimeline.tsx` | Logica toevoegen om de eerste entry te verbergen als die al inline wordt getoond |

### Gedragsflow

1. `DescriptionWithDiff` toont de laatste wijziging inline (als <24 uur)
2. `DescriptionTimeline` detecteert dit via dezelfde 24-uur check
3. Als de eerste entry inline wordt getoond → filter die uit de timeline
4. Als er dan 0 entries overblijven → toon geen Verloop sectie
5. Als er 1+ entries overblijven → toon "Meer verloop (X)"

Dit elimineert de duplicatie en houdt de UI schoon!
