
# Bugfix: Beschrijving Weergave - Volledige Tekst + Geen Dubbele Entries

## Probleem Analyse

### Probleem 1: Verkeerde Diff Weergave
De `DescriptionWithDiff` component toont de beschrijving in TWEE delen:
1. Bovenaan: alleen de ongewijzigde tekst
2. Onderaan: alleen de toegevoegde tekst als apart blok

Dit komt door de logica in regels 150-162 die de "added" segmenten overslaat in de hoofdtekst.

**Gewenst gedrag:** De volledige huidige beschrijving inline tonen, met een subtiele highlight op de recent toegevoegde tekst.

### Probleem 2: Dubbele Database Entries
De database toont nog steeds dubbele entries met exact dezelfde timestamp:

| Timestamp | old_description | new_description |
|-----------|----------------|-----------------|
| 04:18:29 | ...Test test | ...Test hallo |
| 04:18:29 | ...Test test | ...Test hallo |
| 04:18:12 | ...Test | ...Test test |
| 04:18:12 | ...Test | ...Test test |

De eerder verwijderde trigger was mogelijk niet de enige. Er is waarschijnlijk nog een andere bron van duplicates.

---

## Oplossing

### Fix 1: DescriptionWithDiff - Inline Weergave

**Bestand:** `src/components/DescriptionWithDiff.tsx`

Wijzig de render logica zodat ALLE segmenten inline worden getoond, met toegevoegde tekst gemarkeerd met een subtiele highlight:

```text
VOOR:
┌──────────────────────────────────────────────┐
│ 11-02 wil ik starten met...kleine kantoor   │
│                                              │
│          ▼ (connector)                       │
│ ┌────────────────────────────────────────┐  │
│ │ Test hallo hee                         │  │
│ └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘

NA:
┌──────────────────────────────────────────────┐
│ 11-02 wil ik starten met...kleine kantoor   │
│                                              │
│ [Test hallo hee] ← highlight achtergrond     │
│                                              │
│ (kleine badge: Gewijzigd door Kreshnik)      │
└──────────────────────────────────────────────┘
```

**Code wijziging:**
Vervang de aparte blokken-logica met inline highlighting:

```typescript
// Voor modified type: toon alles inline met highlights
return (
  <div className={cn("text-sm leading-relaxed", className)}>
    <p className="whitespace-pre-wrap">
      {segments.map((segment, index) => {
        if (segment.type === 'added') {
          return (
            <span 
              key={index} 
              className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-0.5 rounded-sm"
            >
              {segment.text}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </p>
    {/* Compacte footer met wijzigingsinfo */}
    <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
      <Edit3 className="h-3 w-3" />
      <span>Gewijzigd door {latestChange?.created_by_name}</span>
      <span>•</span>
      <span>{formatRelativeTime(latestChange?.created_at || '')}</span>
    </div>
  </div>
);
```

### Fix 2: Database Duplicate Check

Controleer of er een andere trigger of functie is die duplicates veroorzaakt.

**Database check:** Zoek naar alle triggers op de tasks tabel

```sql
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'tasks';
```

**Indien nog duplicates gevonden:** Voeg een UNIQUE constraint toe of deduplicatie logica in de trigger.

---

## Technische Wijzigingen

| Bestand | Wijziging | Regels |
|---------|-----------|--------|
| `DescriptionWithDiff.tsx` | Vervang aparte blokken met inline highlights | 150-200 |
| Database | Check/fix duplicate triggers | n/a |

---

## Verwacht Resultaat

| Scenario | Gedrag |
|----------|--------|
| Beschrijving bekijken | Volledige tekst inline, met highlight op recente toevoegingen |
| Highlight stijl | Subtiele groene achtergrond op nieuwe woorden |
| Na 10 seconden | Highlight vervaagt, alleen tekst blijft |
| Database | 1 entry per wijziging, geen duplicates |
