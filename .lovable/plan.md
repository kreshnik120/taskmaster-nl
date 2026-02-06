
# Plan: Slimme Diff View voor Beschrijving Wijzigingen

## Het Probleem

In de huidige implementatie worden bij een "modified" beschrijving beide volledige versies getoond:

```text
┌─────────────────────────────────────┐
│ Oude versie:                        │
│ ┌─────────────────────────────────┐ │
│ │ 11-02 wil ik starten met...     │ │
│ │ Werven uitzendkracht...         │ │
│ │ Zo kan ik de kaartenbak...      │ │
│ └─────────────────────────────────┘ │
│              ↓                      │
│ Nieuwe versie:                      │
│ ┌─────────────────────────────────┐ │
│ │ 11-02 wil ik starten met...     │ │  ← Dezelfde tekst!
│ │ Werven uitzendkracht...         │ │  ← Weer dezelfde tekst!
│ │ Zo kan ik de kaartenbak...      │ │  ← Nogmaals!
│ │ Test                            │ │  ← Alleen dit is nieuw
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Probleem:** Visueel redundant - je ziet dezelfde content twee keer terwijl alleen "Test" is toegevoegd.

---

## De Oplossing: Inline Diff View

In plaats van twee aparte blokken, tonen we **één gecombineerde view** die verschillen benadrukt:

```text
┌─────────────────────────────────────┐
│ Wijzigingen:                        │
│ ┌─────────────────────────────────┐ │
│ │ 11-02 wil ik starten met...     │ │
│ │ Werven uitzendkracht...         │ │
│ │ Zo kan ik de kaartenbak...      │ │
│ │                                 │ │
│ │ [+Test]  ← Groen gemarkeerd     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Voordelen:**
- Direct zichtbaar wat er is veranderd
- Geen dubbele content
- Compacter en overzichtelijker
- Professionele GitHub-achtige diff weergave

---

## Technische Aanpak

### Optie 1: Eigen Simpele Diff Logica (Aanbevolen)

Implementeer een lichtgewicht diff helper zonder externe dependencies:

```typescript
function getTextDiff(oldText: string, newText: string) {
  // Vergelijk teksten en retourneer:
  // - unchanged: tekst die hetzelfde is
  // - added: nieuwe tekst (groen)
  // - removed: verwijderde tekst (rood, doorgestreept)
}
```

**Voordelen:**
- Geen extra package dependencies
- Volledige controle over styling
- Snelle implementatie

### Optie 2: react-string-diff Package

Gebruik bestaande library voor complexere diffs:

```typescript
import StringDiff from 'react-string-diff';

<StringDiff 
  oldValue={oldDescription} 
  newValue={newDescription}
  method={DiffMethod.Words}
/>
```

**Voordelen:**
- Beproefde logica
- Woord-niveau diff mogelijk

---

## UI Design

### Nieuwe Diff Component

```text
┌─────────────────────────────────────────────────┐
│  📝 Beschrijving wijziging                      │
├─────────────────────────────────────────────────┤
│  6 feb om 02:08 • Kreshnik • [Gewijzigd]        │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ 11-02 wil ik starten met ingeschreven     │  │
│  │ kandidaten binnen Citozorg & Abc zorg.    │  │
│  │ Werven uitzendkracht of constructie.      │  │
│  │                                           │  │
│  │ Zo kan ik de kaartenbak opschonen en de   │  │
│  │ tijd nemen om apart te zitten in kleine   │  │
│  │ kantoor                                   │  │
│  │                                           │  │
│  │ [+Test]                                   │  │  ← Groen highlight
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [Terugzetten naar vorige versie]               │
└─────────────────────────────────────────────────┘
```

### Styling Regels

| Type | Styling |
|------|---------|
| Ongewijzigd | Normale tekst |
| Toegevoegd | `bg-emerald-100 text-emerald-800` met `+` prefix |
| Verwijderd | `bg-red-100 text-red-600 line-through` met `-` prefix |

---

## Implementatie Stappen

### Stap 1: Diff Helper Functie
Nieuwe utility: `src/lib/textDiff.ts`
- Functie om twee strings te vergelijken
- Retourneert array van diff segments
- Ondersteunt woord-niveau vergelijking

### Stap 2: DiffView Component
Nieuwe component: `src/components/DiffView.tsx`
- Accepteert oldText en newText props
- Rendert inline diff met kleuren
- Herbruikbaar voor andere toepassingen

### Stap 3: DescriptionTimeline Aanpassen
Update: `src/components/DescriptionTimeline.tsx`
- Vervang de twee aparte blokken door DiffView
- Behoud "Terugzetten" functionaliteit
- Fallback naar oude weergave als diff te complex is

---

## Wijzigingen Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/lib/textDiff.ts` | **NIEUW** - Diff utility functies |
| `src/components/DiffView.tsx` | **NIEUW** - Visuele diff component |
| `src/components/DescriptionTimeline.tsx` | Integreer DiffView in detail dialog |

---

## Alternatieve Aanpak: Side-by-Side met Scroll Sync

Als je de twee-blokken weergave wilt behouden maar verbeteren:

```text
┌──────────────────┬──────────────────┐
│ Oude versie      │ Nieuwe versie    │
├──────────────────┼──────────────────┤
│ tekst regel 1    │ tekst regel 1    │
│ tekst regel 2    │ tekst regel 2    │
│                  │ [+Test]          │  ← Highlight
└──────────────────┴──────────────────┘
```

Dit is complexer maar geeft meer context bij grote wijzigingen.

---

## Aanbeveling

**Ik raad Optie 1 aan**: Eigen simpele diff logica met inline view.

**Waarom?**
- Geen extra dependencies
- Perfekt voor korte teksten zoals beschrijvingen
- Sneller te implementeren
- Volledig aangepast aan jullie design system

---

## Geschatte Tijd

| Onderdeel | Tijd |
|-----------|------|
| textDiff utility | 20 min |
| DiffView component | 25 min |
| DescriptionTimeline update | 15 min |
| Testen en polish | 15 min |
| **Totaal** | ~1.25 uur |
