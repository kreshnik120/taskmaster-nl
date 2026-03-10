

# Bendy Requisitions Verkenning — Diagnostisch Paneel

## Wat

Nieuw diagnostisch Card onderaan BendySync.tsx (na het "Ongebruikte velden" paneel, vóór de sluitende `</div></PageContainer>`) dat via de bendy-proxy edge function open en assigned requisitions ophaalt en de veldstructuur, relationships, included data en ruwe JSON toont.

## Wijzigingen

**Bestand:** `src/pages/BendySync.tsx`

### 1. Imports toevoegen
- `CardDescription` uit card component
- `Collapsible, CollapsibleTrigger, CollapsibleContent` uit collapsible component
- `ChevronDown` icoon uit lucide-react

### 2. State toevoegen (bij bestaande state, ~regel 146)
```ts
const [reqAnalysisLoading, setReqAnalysisLoading] = useState(false);
const [reqAnalysisResult, setReqAnalysisResult] = useState<any>(null);
```

### 3. Functie toevoegen (~na fetchUnusedFieldsAnalysis)
`fetchRequisitionSample` — exact zoals opgegeven in de prompt: haalt open + assigned requisitions op via bendy-proxy, analyseert attributes (fill-rate + voorbeelden) en relationships, slaat alles op in `reqAnalysisResult`.

### 4. Card toevoegen (na regel 1171, vóór `</div></PageContainer>`)
6 secties in het Card:
- **A: Overzicht** — twee badges met open/assigned counts
- **B: Open Requisitions Velden** — Table (Veld, Gevuld, %, Voorbeelden) met kleur-badges
- **C: Assigned Requisitions Velden** — zelfde tabel-structuur
- **D: Relationships** — voor open en assigned: naam, present/total, voorbeeldwaarden
- **E: Included data** — type-telling van JSON:API sideloaded records
- **F: Ruwe JSON** — Collapsible met `<pre>` voor eerste 2 records van beide

Alle bestaande code blijft ongewijzigd — alleen toevoegingen.

