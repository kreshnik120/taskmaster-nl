
# Beschrijving Wijzigingen: Persistente Highlights & Inline Timeline

## Overzicht

Drie bestanden worden aangepast om de beschrijvingswijzigingen als een doorlopende, altijd zichtbare flow te tonen.

---

## Wijzigingen

### 1. DescriptionWithDiff.tsx - Highlight blijft staan (7 dagen)

**Wat verandert:**
- De 10-seconden setTimeout wordt verwijderd
- De 24-uurs check wordt vervangen door een 7-dagen check
- `showHighlight` state en het bijbehorende useEffect verdwijnen volledig
- De highlight blijft zichtbaar zolang de wijziging minder dan 7 dagen oud is
- De `highlightDuration` prop wordt verwijderd (niet meer nodig)

**Vereenvoudigde logica:**
- `isRecentChange` checkt nu: `(now - changeTime) < 7 dagen`
- Als `isRecentChange` true is EN er segments zijn: toon highlight
- Anders: toon platte tekst

### 2. DescriptionTimeline.tsx - Altijd zichtbaar met inline diffs

**Wat verandert:**
- `MAX_VISIBLE_GROUPS` wordt `5` (was 3)
- De `isLatestShowingInline` logica wordt aangepast van 24u naar 7 dagen (synchroon met highlight)
- Separator tekst wordt "Wijzigingen" in plaats van "Verloop"

### 3. GroupedEntryItem.tsx - Compactere weergave met samenvatting

**Wat verandert:**
- De "Bekijk" hover card wordt vervangen door een uitklapbare inline diff
- Elke entry toont een korte samenvatting op basis van metadata:
  - `old_description` leeg + `new_description` gevuld: "Beschrijving aangemaakt"
  - `old_description` gevuld + `new_description` leeg: "Beschrijving verwijderd"
  - Beide gevuld: tel woordverschil ("X woorden toegevoegd" / "X woorden gewijzigd")
- Klik op de entry klapt de DiffView inline uit/in (geen dialog meer voor single entries)
- De HoverCard wordt verwijderd voor een schonere ervaring

### 4. utils.ts - Samenvatting functie toevoegen

**Nieuwe functie:** `computeChangeSummary(metadata)`
- Berekent een korte tekst op basis van old/new description
- Telt woorden met `text.split(/\s+/).length`
- Retourneert strings zoals "Beschrijving aangemaakt", "3 woorden toegevoegd", "Beschrijving gewijzigd"

---

## Technische Details

| Bestand | Wijziging |
|---------|-----------|
| `DescriptionWithDiff.tsx` | Verwijder setTimeout, showHighlight state, highlightDuration prop. Wijzig 24u naar 7 dagen. |
| `description-timeline/DescriptionTimeline.tsx` | MAX_VISIBLE_GROUPS=5, sync 7-dagen check, label "Wijzigingen" |
| `description-timeline/GroupedEntryItem.tsx` | Vervang HoverCard+dialog door uitklapbare inline DiffView met samenvatting |
| `description-timeline/utils.ts` | Nieuwe `computeChangeSummary()` functie |

## Geen database wijzigingen nodig

Alle data is al beschikbaar in `task_action_history.metadata`.
