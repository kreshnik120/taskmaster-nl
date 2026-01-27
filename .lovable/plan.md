

# Fase 7C: Notulen Assistent - Implementatieplan

## Samenvatting

Dit plan implementeert de Notulen Assistent met intelligente item classificatie en bulk taak creatie. We bouwen in 8 stappen, beginnend met database migraties.

---

## Stap 1: Database Migratie

**Twee kolommen toevoegen:**

1. **`meeting_minutes.action_items`** (JSONB)
   - Bewaart AI-geëxtraheerde action items met classificatie
   - Vergelijkbaar met bestaande `decisions` en `agenda_items` kolommen

2. **`tasks.source_meeting_minute_id`** (UUID)
   - Linkt taken terug naar de bron meeting minute
   - Foreign key naar `meeting_minutes(id)`

```sql
-- 1. Action items JSONB kolom voor meeting minutes
ALTER TABLE meeting_minutes 
ADD COLUMN action_items JSONB DEFAULT '[]'::jsonb;

-- 2. Source link van tasks naar meeting minutes
ALTER TABLE tasks 
ADD COLUMN source_meeting_minute_id UUID REFERENCES meeting_minutes(id);

-- 3. Index voor efficiënte queries
CREATE INDEX idx_tasks_source_meeting_minute_id 
ON tasks(source_meeting_minute_id) 
WHERE source_meeting_minute_id IS NOT NULL;
```

---

## Stap 2: Interface Uitbreiding

**Bestand:** `src/hooks/notulen/useAIExtractMeeting.ts`

Breid de `action_items` array uit (backwards compatible - alle nieuwe velden optional):

```typescript
action_items: Array<{
  action: string;                                    // BEHOUDEN
  assignee: string | null;                           // BEHOUDEN
  deadline: string | null;                           // BEHOUDEN
  classification?: 'TAAK' | 'IDEE' | 'INFORMATIE';   // NIEUW
  urgency?: 'critical' | 'high' | 'medium' | 'low';  // NIEUW
  source_quote?: string;                             // NIEUW
  confidence?: number;                               // NIEUW (0.0-1.0)
}>;
```

---

## Stap 3: AI Prompt Updates

**Bestand:** `supabase/functions/ai-extract-meeting-minute/index.ts`

Update op 4 locaties:

1. **Interface definitie** (regel 29-34)
2. **Multimodal prompt** (regel 229-280)
3. **System prompt** (regel 358-405)
4. **Normalisatie functies** (regel 319-343, 550-574, 673-697)

**Classificatie instructies toevoegen:**

```text
ACTION_ITEMS CLASSIFICATIE:

Classificeer elk action_item als:

1. "TAAK" - Concrete actie met actiewerkwoord + (eigenaar OF deadline)
   Voorbeelden: "Jan maakt rapport", "Review voor vrijdag"
   
2. "IDEE" - Suggestie zonder concrete toewijzing
   Indicatoren: "zou kunnen", "misschien", "overwegen"
   
3. "INFORMATIE" - Feitelijke mededeling, geen actie vereist
   Voorbeelden: "Budget goedgekeurd", "Project loopt op schema"

URGENTIE:
- critical: < 24 uur of blocker
- high: < 3 dagen
- medium: < 1 week
- low: geen deadline

VERPLICHT: source_quote = exacte tekst uit document (hallucinatie preventie)
```

**Output structuur update:**

```json
"action_items": [{
  "action": "Beschrijving",
  "assignee": "Naam of null",
  "deadline": "YYYY-MM-DD of null",
  "classification": "TAAK",
  "urgency": "high",
  "source_quote": "Exacte quote uit document",
  "confidence": 0.85
}]
```

---

## Stap 4: Persistentie Updates

### 4a. useCreateMeetingMinute.ts

**Wijzigingen:**

1. Voeg `action_items` toe aan `CreateMeetingMinuteInput` interface
2. Bewaar action_items als JSONB bij insert

```typescript
interface CreateMeetingMinuteInput {
  // ... bestaande velden ...
  action_items?: Array<{
    action: string;
    assignee?: string | null;
    deadline?: string | null;
    classification?: 'TAAK' | 'IDEE' | 'INFORMATIE';
    urgency?: 'critical' | 'high' | 'medium' | 'low';
    source_quote?: string;
    confidence?: number;
  }>;
}

// In insert:
action_items: input.action_items || [],
```

### 4b. CreateMeetingMinuteDialog.tsx

**Wijzigingen:**

1. Voeg `action_items` toe aan `extractedContent` state
2. Pass action_items door bij submit

```typescript
// In applyExtractedData():
setExtractedContent({
  ...existing,
  action_items: extractedData.action_items,
});

// In onSubmit():
action_items: extractedContent?.action_items,
```

---

## Stap 5: Nieuwe Hook - useCreateTasksFromItems

**Nieuw bestand:** `src/hooks/notulen/useCreateTasksFromItems.ts`

```typescript
interface UseCreateTasksFromItemsReturn {
  createTasks: (items: ActionItem[], meetingMinuteId: string) => Promise<string[]>;
  isCreating: boolean;
  progress: { current: number; total: number };
}
```

**Functionaliteit:**
- Haalt org_id op
- Mapt urgency naar priority enum (critical→CRITICAL, etc.)
- Bulk insert met `source_meeting_minute_id`
- Progress tracking
- Toast notifications

**Priority mapping:**

| AI Urgency | Database Priority |
|------------|-------------------|
| `critical` | `CRITICAL` |
| `high` | `HIGH` |
| `medium` | `MEDIUM` |
| `low` | `LOW` |

---

## Stap 6: NotulenAssistent Component

**Nieuw bestand:** `src/components/notulen/NotulenAssistent.tsx`

**UI Layout:**

```text
┌────────────────────────────────────────────────────────┐
│ Notulen Assistent                                 [X]  │
│ Selecteer items om als taak aan te maken               │
├────────────────────────────────────────────────────────┤
│ [Alle] [TAAK] [IDEE] [INFO]    [Selecteer alle TAKEN]  │
├────────────────────────────────────────────────────────┤
│ [✓] Jan maakt rapport af voor vrijdag                  │
│     [TAAK] Jan | vrijdag | ████████░░ 85%              │
│     ▼ "Jan zei: ik maak het rapport af..."             │
├────────────────────────────────────────────────────────┤
│ [ ] We zouden kunnen overwegen...                      │
│     [IDEE] - | - | ████░░░░░░ 45%                      │
├────────────────────────────────────────────────────────┤
│ 1 van 3 geselecteerd      [Annuleren] [Maak 1 taak →]  │
└────────────────────────────────────────────────────────┘
```

**Features:**

| Feature | Beschrijving |
|---------|--------------|
| Pre-selection | `classification === 'TAAK' && confidence >= 0.8` → aangevinkt |
| Filter toggles | Alle / TAAK / IDEE / INFO |
| Classificatie badges | TAAK=blauw, IDEE=paars, INFO=grijs |
| Confidence indicator | Groen (≥80) / Oranje (50-79) / Rood (<50) |
| Source quote | Uitklapbaar per item (italic, grijs) |
| Bulk acties | "Selecteer alle TAKEN", "Deselecteer alles" |
| Counter | "X van Y geselecteerd" |
| Submit | "Maak X taken aan" met loading state |

---

## Stap 7: MeetingMinuteDetail Integratie

**Bestand:** `src/components/notulen/MeetingMinuteDetail.tsx`

**Wijzigingen:**

1. State toevoegen: `const [showAssistent, setShowAssistent] = useState(false)`
2. Parse action_items uit minute JSONB
3. Knop toevoegen in SheetFooter (view mode)
4. NotulenAssistent Sheet component

```tsx
// In footer (view mode), na "Exporteer PDF":
{actionItems.length > 0 && (
  <Button 
    variant="outline"
    onClick={() => setShowAssistent(true)}
  >
    <Wand2 className="h-4 w-4 mr-2" />
    Notulen Assistent ({actionItems.length})
  </Button>
)}
```

---

## Stap 8: useMeetingMinutes Update

**Bestand:** `src/hooks/useMeetingMinutes.ts`

Voeg `action_items` toe aan de MeetingMinute interface en query.

---

## Implementatie Volgorde

| # | Bestand | Type | Beschrijving |
|---|---------|------|--------------|
| 1 | Database | MIGRATIE | +`action_items` op meeting_minutes, +`source_meeting_minute_id` op tasks |
| 2 | `useAIExtractMeeting.ts` | UPDATE | Interface uitbreiding (+4 velden) |
| 3 | `ai-extract-meeting-minute/index.ts` | UPDATE | Interface + prompts + normalisatie |
| 4 | `useCreateMeetingMinute.ts` | UPDATE | Accepteer en bewaar action_items |
| 5 | `CreateMeetingMinuteDialog.tsx` | UPDATE | Pass action_items door |
| 6 | `useMeetingMinutes.ts` | UPDATE | Voeg action_items toe aan interface |
| 7 | `useCreateTasksFromItems.ts` | NIEUW | Bulk taak creatie hook |
| 8 | `NotulenAssistent.tsx` | NIEUW | Sheet component met checkboxes |
| 9 | `MeetingMinuteDetail.tsx` | UPDATE | Knop + sheet integratie |

---

## Acceptatie Criteria

| Criterium | Verificatie |
|-----------|-------------|
| Database migratie succesvol | Kolommen bestaan in schema |
| AI retourneert classification | Test met PDF upload |
| AI retourneert source_quote | Check AI response |
| action_items worden bewaard | Check meeting_minutes.action_items |
| Pre-selection werkt | TAAK + confidence ≥ 0.8 = aangevinkt |
| Classificatie badges correct | TAAK=blauw, IDEE=paars, INFO=grijs |
| Confidence kleuren correct | Groen/Oranje/Rood |
| Filter knoppen functioneel | Click test |
| "Selecteer alle TAKEN" werkt | Alle TAAK items geselecteerd |
| Bulk taak creatie werkt | Tasks verschijnen in lijst |
| source_meeting_minute_id gevuld | Check tasks tabel |
| Nederlandse UI teksten | Visuele verificatie |
| Geen console errors | DevTools check |
| TypeScript compileert | Build test |

---

## Beperkingen (Buiten Scope)

- Eigenaar dropdown suggestie
- Deadline picker in Assistent
- Email notificaties
- Decisions en attendees classificatie

---

## Technische Details

### Nieuwe Dependencies
Geen - gebruikt bestaande shadcn/ui componenten.

### Hergebruikte Patterns
- `ConfidenceBadge` uit ExtractedDataPreview
- Sheet pattern uit MeetingMinuteDetail
- Bulk insert pattern uit useManageAgendaItems
- Toast pattern uit andere hooks

### Backwards Compatibility
- Alle nieuwe interface velden zijn optional
- Bestaande meetings zonder action_items tonen lege array
- Geen breaking changes

