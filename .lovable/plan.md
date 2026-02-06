

# Plan: Label + Visuele Connector voor Diff Highlights

## Huidige Situatie

```text
┌────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven      │
│ kandidaten binnen Citozorg & Abc zorg.     │
│ ...                                        │
│                                            │
│ Test    ← Geen context, geen visuele flow  │
└────────────────────────────────────────────┘
```

---

## Nieuwe Weergave met Label + Connector

```text
┌────────────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven              │
│ kandidaten binnen Citozorg & Abc zorg.             │
│ Werven uitzendkracht of constructie.               │
│                                                    │
│ Zo kan ik de kaartenbak opschonen en de            │
│ tijd nemen om apart te zitten in kleine kantoor    │
│                                                    │
│          ┆                                         │
│          ▼                                         │  ← Visuele connector
│ ┌──────────────────────────────────────────────┐   │
│ │ ✏️ Gewijzigd door Kreshnik • 2 uur geleden   │   │  ← Header met naam
│ ├──────────────────────────────────────────────┤   │
│ │ Test                                         │   │  ← Gehighlighte toevoeging
│ └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

---

## Visuele Connector Opties

### Optie A: Gestippelde Lijn met Pijl (Aanbevolen)
```text
          ┆
          ▼
┌─────────────────────────────┐
│ Gewijzigd door Kreshnik     │
```
- Subtiel maar duidelijk
- Past bij het design systeem

### Optie B: Gradient Fade Lijn
```text
      ════════════════════
          ↓ Toegevoegd
┌─────────────────────────────┐
```
- Modernere look
- Iets meer visuele impact

### Optie C: Bracket/Haak Stijl
```text
    ┌─────────────────────────────┐
    │ ➕ Gewijzigd door Kreshnik   │
```
- Minimalistische approach
- Focus op de content

---

## Technische Implementatie

### DescriptionWithDiff.tsx Aanpassingen

**1. Interface uitbreiden met created_by_name:**

```typescript
interface LatestChange {
  metadata?: DescriptionChangeMetadata;
  created_at: string;
  created_by_name?: string;  // NIEUW
}
```

**2. Helper functie voor relatieve tijd:**

```typescript
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'zojuist';
  if (diffMins < 60) return `${diffMins} min geleden`;
  if (diffHours < 24) return `${diffHours} uur geleden`;
  return `${diffDays} dag${diffDays > 1 ? 'en' : ''} geleden`;
}
```

**3. Nieuwe render structuur:**

```tsx
// Voor added/modified changes met highlights
return (
  <div className={cn("text-sm whitespace-pre-wrap leading-relaxed", className)}>
    {/* Ongewijzigde tekst eerst */}
    {segments.map((segment, index) => {
      if (segment.type === 'unchanged') {
        return <span key={index}>{segment.text}</span>;
      }
      return null;
    })}
    
    {/* Visuele connector */}
    <div className="flex flex-col items-start my-3">
      <div className="flex flex-col items-center ml-4">
        <div className="w-px h-3 bg-gradient-to-b from-transparent to-emerald-400" />
        <ChevronDown className="h-3 w-3 text-emerald-500 -mt-1" />
      </div>
    </div>
    
    {/* Highlighted additions box */}
    <div className="border-l-2 border-emerald-400 bg-emerald-50/50 rounded-r-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 bg-emerald-100/50 border-b border-emerald-200/50 flex items-center gap-2">
        <Plus className="h-3 w-3 text-emerald-600" />
        <span className="text-xs font-medium text-emerald-700">
          Gewijzigd door {latestChange?.created_by_name || 'Onbekend'}
        </span>
        <span className="text-xs text-emerald-600/70">•</span>
        <span className="text-xs text-emerald-600/70">
          {formatRelativeTime(latestChange?.created_at)}
        </span>
      </div>
      
      {/* Content */}
      <div className="px-3 py-2">
        {addedSegments.map((segment, index) => (
          <span key={index} className="text-emerald-900">
            {segment.text}
          </span>
        ))}
      </div>
    </div>
  </div>
);
```

---

## Visuele Styling Details

| Element | Styling |
|---------|---------|
| Connector lijn | `w-px h-3 bg-gradient-to-b from-transparent to-emerald-400` |
| Pijl icoon | `ChevronDown` van Lucide, `text-emerald-500` |
| Header achtergrond | `bg-emerald-100/50` met subtiele border |
| Naam tekst | `text-xs font-medium text-emerald-700` |
| Tijd tekst | `text-xs text-emerald-600/70` |
| Content box | `border-l-2 border-emerald-400 bg-emerald-50/50` |

---

## Bestanden die Aangepast Worden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/DescriptionWithDiff.tsx` | Visuele connector + header label toevoegen |
| `src/components/DescriptionTimeline.tsx` | Geen wijziging nodig - `created_by_name` zit al in entries |

---

## Animatie Verfijningen

De connector en box verschijnen met een subtiele animatie:

```tsx
<div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
  {/* Connector + Box */}
</div>
```

En na de `highlightDuration` (10 seconden) fade de kleuren subtiel uit naar neutraal:

```tsx
// Na timeout: 
// bg-emerald-50/50 → bg-muted/30
// border-emerald-400 → border-muted
// text-emerald-700 → text-muted-foreground
```

---

## Resultaat

```text
┌─────────────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven               │
│ kandidaten binnen Citozorg & Abc zorg.              │
│ Werven uitzendkracht of constructie.                │
│                                                     │
│ Zo kan ik de kaartenbak opschonen en de             │
│ tijd nemen om apart te zitten in kleine kantoor     │
│                                                     │
│            ┆                                        │
│            ▼                                        │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✚ Gewijzigd door Kreshnik • 2 uur geleden       │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Test                                            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ─────────── Verloop (2) ───────────                 │
└─────────────────────────────────────────────────────┘
```

Dit geeft een professionele, duidelijke flow die direct laat zien:
- **Wie** de wijziging maakte
- **Wanneer** (relatieve tijd)
- **Wat** er precies is toegevoegd
- **Visuele hiërarchie** door de connector

