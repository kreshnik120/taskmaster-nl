
# Plan: Inline Diff Highlighting voor Beschrijving

## Het Probleem

In de huidige weergave staat "Test" onderaan de beschrijving als gewone tekst - er is **geen visuele indicatie** dat dit recent is toegevoegd:

```text
┌────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven      │
│ kandidaten binnen Citozorg & Abc zorg.     │
│ Werven uitzendkracht of constructie.       │
│                                            │
│ Zo kan ik de kaartenbak opschonen...       │
│                                            │
│ Test    ← Geen indicatie dat dit nieuw is! │
└────────────────────────────────────────────┘
```

## De Oplossing: Smart Description Rendering

De beschrijving zelf renderen met de **meest recente wijzigingen inline gehighlighted**:

```text
┌────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven      │
│ kandidaten binnen Citozorg & Abc zorg.     │
│ Werven uitzendkracht of constructie.       │
│                                            │
│ Zo kan ik de kaartenbak opschonen...       │
│                                            │
│ [Test]  ← Groen gemarkeerd als toevoeging! │
└────────────────────────────────────────────┘
```

---

## Wat verandert er?

### Huidige Flow
1. Beschrijving wordt als plain tekst getoond
2. Gebruiker moet op "Bekijk wijziging" klikken
3. Dialog opent met diff view
4. Pas daar ziet de gebruiker wat er is veranderd

### Nieuwe Flow
1. Beschrijving toont direct de **laatste wijziging gehighlighted**
2. Toevoegingen: groene achtergrond
3. Verwijderingen: rode doorgestreepte tekst (optioneel zichtbaar)
4. Na X seconden of bij hover: subtiele fade-out van highlighting
5. "Bekijk wijziging" blijft beschikbaar voor volledige historie

---

## Technische Aanpak

### 1. DescriptionTimeline uitbreiden met data export

```typescript
interface DescriptionTimelineProps {
  taskId: string;
  onCountChange?: (count: number) => void;
  onLatestChange?: (change: DescriptionChangeEntry | null) => void; // NIEUW
}
```

Deze nieuwe prop stuurt de meest recente wijziging naar de parent component.

### 2. TaskDetailModal: Description met Diff renderen

In plaats van:
```typescript
<p className="text-sm whitespace-pre-wrap">{task.description}</p>
```

Wordt het:
```typescript
{latestDescriptionChange ? (
  <DescriptionWithDiff
    currentDescription={task.description}
    latestChange={latestDescriptionChange}
    showFreshIndicator={isRecentChange}
  />
) : (
  <p className="text-sm whitespace-pre-wrap">{task.description}</p>
)}
```

### 3. Nieuwe Component: DescriptionWithDiff

Component die de huidige beschrijving rendert met recente wijzigingen gehighlighted:

- Gebruikt de bestaande `DiffView` logic intern
- Toont alleen de meest recente toevoeging/verwijdering
- Heeft een subtiele "recent" indicator (glow/pulse) die na 10 seconden verdwijnt
- Optionele toggle om "verwijderde tekst" te tonen/verbergen

---

## Visual Design

### Toevoegingen (meest voorkomend)

```text
┌─────────────────────────────────────────────────┐
│ 11-02 wil ik starten met ingeschreven           │
│ kandidaten binnen Citozorg & Abc zorg.          │
│ Werven uitzendkracht of constructie.            │
│                                                 │
│ Zo kan ik de kaartenbak opschonen en de         │
│ tijd nemen om apart te zitten in kleine kantoor │
│                                                 │
│ ┌──────────────────────────────────────────┐    │
│ │ Test                                     │    │ ← Emerald border + subtle glow
│ └──────────────────────────────────────────┘    │
│                           [Recent toegevoegd ●] │ ← Subtiele indicator
└─────────────────────────────────────────────────┘
```

### Styling Specificaties

| Element | Styling |
|---------|---------|
| Toegevoegde tekst | `bg-emerald-50 border-l-2 border-emerald-400 pl-2` |
| "Recent" indicator | `text-emerald-600 text-xs` met fade-out na 10s |
| Verwijderde tekst (optioneel) | `bg-red-50/50 line-through text-muted-foreground` |

---

## Implementatie Details

### Bestanden die aangepast worden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/DescriptionTimeline.tsx` | Nieuwe `onLatestChange` prop |
| `src/components/TaskDetailModal.tsx` | State voor latestChange + conditionale rendering |
| `src/components/DescriptionWithDiff.tsx` | **NIEUW** - Component voor inline diff display |

### DescriptionWithDiff Props

```typescript
interface DescriptionWithDiffProps {
  currentDescription: string;
  latestChange: DescriptionChangeEntry | null;
  showRecent?: boolean; // Toon "recent toegevoegd" indicator
  highlightDuration?: number; // Milliseconden voor fade-out (default: 10000)
}
```

### Logic Flow

1. Component ontvangt `currentDescription` en `latestChange`
2. Als `latestChange.metadata.change_type === 'added'`:
   - Zoek de toegevoegde tekst in currentDescription
   - Highlight dat gedeelte met emerald styling
3. Als `change_type === 'modified'`:
   - Gebruik `computeWordDiff` om segmenten te vinden
   - Highlight alleen de `added` segmenten in de huidige tekst
4. "Recent" indicator verdwijnt na configureerbare tijd

### Edge Cases

- **Geen history**: Render als normale tekst
- **Wijziging is complete rewrite**: Toon normale tekst (geen highlight)
- **Verwijdering**: Optioneel tonen als doorgestreepte tekst onder de huidige beschrijving

---

## Optionele Verfijning: Fade-out Animatie

De "recent toegevoegd" highlighting kan na X seconden subtiel vervagen:

```css
.diff-highlight-fresh {
  animation: highlight-fade 10s ease-out forwards;
}

@keyframes highlight-fade {
  0% { background-color: rgb(209 250 229); } /* emerald-100 */
  100% { background-color: transparent; }
}
```

---

## Samenvatting

| Onderdeel | Beschrijving |
|-----------|-------------|
| Kern verbetering | Recente wijzigingen direct zichtbaar in beschrijving |
| Nieuwe component | `DescriptionWithDiff.tsx` |
| Styling | Emerald border/background voor toevoegingen |
| UX feature | "Recent" indicator met automatische fade-out |
| Bestaande functie | "Bekijk wijziging" blijft voor volledige historie |

Dit zorgt ervoor dat gebruikers **direct kunnen zien wat er recent is veranderd** zonder extra klikken!
