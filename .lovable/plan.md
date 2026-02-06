
# Plan: Beschrijving Verloop (Description Timeline)

## Samenvatting

Dit plan breidt de "Beschrijving" sectie uit met een volledige verloop-functionaliteit, zodat gebruikers kunnen zien **wie** beschrijvingen heeft toegevoegd/gewijzigd, **wanneer** dit gebeurde, en **wat** er precies is veranderd - net zoals bij het bestaande "Actieverloop".

---

## Wat krijg je?

```text
┌──────────────────────────────────────────────────────┐
│  📄 Beschrijving                               [▼]   │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐  │
│  │ Huidige beschrijving tekst hier...            │  │
│  │ Met alle details over de taak.                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ─────────────── Verloop (3) ───────────────         │
│                                                      │
│  ● 5 feb om 16:12 • Erik                             │
│    📝 Beschrijving gewijzigd                         │
│    [Bekijk wijziging]                                │
│                                                      │
│  ● 4 feb om 10:30 • Marianne                         │
│    ➕ Beschrijving toegevoegd                        │
│    [Bekijk origineel]                                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Technisch Overzicht

### Huidige Situatie (Analyse)

| Onderdeel | Status | Details |
|-----------|--------|---------|
| Database trigger `log_task_description_change` | Actief | Logt alleen `old_length` en `new_length`, NIET de daadwerkelijke tekst |
| `task_action_history.metadata` kolom | Aanwezig (JSONB) | Kan uitgebreid worden voor volledige tekst |
| `ActionHistoryItem` interface | Beperkt | Bevat geen metadata veld |
| ActionTimeline filtering | Werkt | Filtert `description_change` entries al uit met icoon |
| TaskDetailModal Beschrijving sectie | Alleen huidige tekst | Geen verloop weergave |

---

## Implementatie Stappen

### Fase 1: Database Trigger Uitbreiden

De bestaande trigger slaat alleen de lengtes op. We breiden de metadata uit:

**Huidige metadata:**
```json
{
  "old_length": 0,
  "new_length": 156,
  "changed_by_name": "Erik"
}
```

**Nieuwe metadata:**
```json
{
  "old_length": 0,
  "new_length": 156,
  "old_description": null,
  "new_description": "De nieuwe beschrijving tekst...",
  "changed_by_name": "Erik",
  "change_type": "added"
}
```

De `change_type` kan zijn:
- `added` - Beschrijving voor het eerst toegevoegd
- `modified` - Bestaande beschrijving gewijzigd
- `removed` - Beschrijving verwijderd

### Fase 2: DescriptionTimeline Component

Nieuw component: `src/components/DescriptionTimeline.tsx`

**Functionaliteit:**
- Haalt `description_change` entries op uit `task_action_history` inclusief metadata
- Toont een compacte tijdlijn met:
  - Wie de wijziging maakte
  - Wanneer (relatieve tijd)
  - Type wijziging (badge: Toegevoegd/Gewijzigd/Verwijderd)
- "Bekijk wijziging" knop opent een popover/dialog met:
  - Oude tekst (doorgestreept of grijs)
  - Nieuwe tekst (highlighted)
- Consistent met ActionTimeline styling (zelfde iconen, kleuren, animaties)

**Component structuur:**
```text
DescriptionTimeline
├── props: taskId, showInline (boolean)
├── state: entries, expandedId, loading
├── query: task_action_history WHERE action_type = 'description_change'
│          SELECT metadata voor oude/nieuwe tekst
└── render:
    ├── Subheader "Verloop (X)"
    ├── Timeline items
    │   ├── Icoon (📝 FileText)
    │   ├── Datum + auteur
    │   ├── Type badge
    │   └── "Bekijk wijziging" popover
    └── Empty state (geen wijzigingen)
```

### Fase 3: ActionHistoryItem Interface Uitbreiden

In `ActionTimeline.tsx`:

```typescript
export interface ActionHistoryItem {
  id: string;
  action_text: string;
  action_type: 'followup' | 'note' | 'status_change' | 'description_change' | ...;
  created_at: string;
  created_by_name?: string;
  completed_at?: string | null;
  completed_by_name?: string;
  is_current: boolean;
  metadata?: {
    old_description?: string | null;
    new_description?: string | null;
    change_type?: 'added' | 'modified' | 'removed';
    [key: string]: unknown;
  };
}
```

### Fase 4: TaskDetailModal Integratie

In de "Beschrijving" Collapsible sectie (regels 1041-1064):

**Aanpassingen:**
1. Import DescriptionTimeline component
2. Query beschrijving wijzigingen apart (of via uitgebreide loadActionHistory)
3. Voeg badge toe met aantal wijzigingen naast "Beschrijving" titel
4. Toon DescriptionTimeline onder de huidige beschrijving tekst
5. Voeg horizontale separator toe tussen beschrijving en verloop

### Fase 5: Query Aanpassingen

In `loadActionHistory()` van TaskDetailModal:
- Voeg `metadata` toe aan de SELECT
- Map metadata naar het nieuwe interface veld

---

## Gewijzigde Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `supabase/migrations/[new].sql` | Nieuwe migratie: update `log_task_description_change` functie om volledige tekst op te slaan |
| `src/components/DescriptionTimeline.tsx` | **NIEUW**: Component voor beschrijving verloop weergave |
| `src/components/ActionTimeline.tsx` | Interface uitbreiding met metadata veld |
| `src/components/TaskDetailModal.tsx` | Integratie DescriptionTimeline in Beschrijving sectie, uitbreiding loadActionHistory query |

---

## Voordelen

- Volledige transparantie over wie beschrijvingen heeft aangepast
- Geen verlies van informatie bij overschrijven
- Consistent met bestaande Actieverloop UX
- Audit trail voor compliance en samenwerking
- Gebruikers kunnen terug zien wat er stond

---

## Aandachtspunten

1. **Privacy**: Oude beschrijvingen bevatten mogelijk gevoelige info die nu permanent wordt opgeslagen
2. **Opslag**: Lange beschrijvingen kosten meer ruimte in de database
3. **Truncatie**: Bij zeer lange teksten tonen we een preview met "Meer tonen" optie
4. **Migratie**: Bestaande `description_change` entries hebben geen tekst - deze tonen we als "Beschrijving gewijzigd (geen details beschikbaar)"

---

## Tijdsinschatting

| Onderdeel | Tijd |
|-----------|------|
| Database migratie | 15 min |
| DescriptionTimeline component | 45 min |
| Interface uitbreiding | 10 min |
| TaskDetailModal integratie | 25 min |
| Testen en polish | 20 min |
| **Totaal** | ~2 uur |
