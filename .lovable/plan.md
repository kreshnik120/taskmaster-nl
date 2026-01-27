
# Fase 7B: Complete Extracted Data Persistentie

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | Volledige opslag van AI-geëxtraheerde data bij notulen creatie |
| **Risico niveau** | MEDIUM (uitbreiding bestaande flow) |
| **Wijzigingen** | 3 bestanden |
| **Geschatte omvang** | ~100 regels |
| **Impact** | Geëxtraheerde agenda, beslissingen en deelnemers worden echt opgeslagen |

---

## 2. Probleemanalyse

### Huidige Situatie
```text
┌─────────────────────────────────────────────────────────────────────┐
│ PDF → Gemini → ExtractedDataPreview                                  │
│                      ↓                                               │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ applyExtractedData() - REGEL 166-180                        │   │
│   │                                                              │   │
│   │ ✅ title → form.setValue('title')                           │   │
│   │ ✅ meeting_type → form.setValue('meeting_type')             │   │
│   │ ✅ meeting_date → form.setValue('start_at')                 │   │
│   │ ✅ meeting_time → form.setValue('start_time')               │   │
│   │ ✅ location → form.setValue('location')                     │   │
│   │                                                              │   │
│   │ ❌ participants → WEGGEGOOID                                │   │
│   │ ❌ agenda_items → WEGGEGOOID                                │   │
│   │ ❌ decisions → WEGGEGOOID                                   │   │
│   │ ❌ action_items → WEGGEGOOID                                │   │
│   │ ❌ notes/summary → WEGGEGOOID                               │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                      ↓                                               │
│   createMeetingMinute() → agenda_items: [], decisions: []           │
└─────────────────────────────────────────────────────────────────────┘
```

### Gewenste Situatie
```text
┌─────────────────────────────────────────────────────────────────────┐
│ PDF → Gemini → ExtractedDataPreview                                  │
│                      ↓                                               │
│   applyExtractedData() - OPSLAAN in extractedContent state          │
│                      ↓                                               │
│   createMeetingMinute({                                              │
│     title, meeting_type, start_at, location,                        │
│     agenda_items: extractedContent.agenda_items,                    │
│     decisions: extractedContent.decisions,                          │
│     content: extractedContent.notes + summary,                      │
│     participants: extractedContent.participants                     │
│   })                                                                 │
│                      ↓                                               │
│   meeting_minutes tabel: VOLLEDIG GEVULD                            │
│   meeting_attendees tabel: DEELNEMERS TOEGEVOEGD                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technische Wijzigingen

### 3A. Hook: `useCreateMeetingMinute.ts` - Uitbreiden Input Interface

**Bestand**: `src/hooks/useCreateMeetingMinute.ts`

**Wijziging 1**: Uitbreid `CreateMeetingMinuteInput` interface (regel 6-13):
```typescript
export interface CreateMeetingMinuteInput {
  title: string;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig';
  start_at: Date;
  location?: string;
  meeting_link?: string;
  linkedTaskId?: string;
  // NIEUW: Extracted data fields
  agenda_items?: Array<{ item: string; discussed: boolean }>;
  decisions?: Array<{ decision: string; owner?: string | null; deadline?: string | null }>;
  content?: string;
  participants?: Array<{ name: string; role?: string | null; present?: boolean }>;
}
```

**Wijziging 2**: Update insert statement (regel 54-65):
```typescript
// Transform agenda_items naar database format
const formattedAgendaItems = (input.agenda_items || []).map((item, index) => ({
  id: crypto.randomUUID(),
  order: index + 1,
  title: item.item,
  duration_min: 15, // Default
  discussed: item.discussed || false,
}));

// Transform decisions naar database format
const formattedDecisions = (input.decisions || []).map(d => ({
  id: crypto.randomUUID(),
  text: d.decision,
  decided_by: d.owner || null,
  decided_at: d.deadline || new Date().toISOString(),
  linked_task_id: null,
}));

const { data: minute, error: minuteError } = await supabase
  .from("meeting_minutes")
  .insert({
    task_id: taskId,
    org_id: userOrg.org_id,
    meeting_type: input.meeting_type,
    location: input.location || null,
    meeting_link: input.meeting_link || null,
    status: 'draft',
    agenda_items: formattedAgendaItems,
    decisions: formattedDecisions,
    content: input.content || null,
  })
  .select('id')
  .single();
```

**Wijziging 3**: Voeg deelnemers toe na minute creatie (na regel 67):
```typescript
// Insert participants as meeting_attendees
if (input.participants && input.participants.length > 0) {
  const attendeesToInsert = input.participants.map(p => ({
    minute_id: minute.id,
    external_name: p.name,
    role: p.role || null,
    attended: p.present ?? true,
    user_id: null, // External participants
  }));
  
  await supabase
    .from('meeting_attendees')
    .insert(attendeesToInsert);
}
```

---

### 3B. Dialog: `CreateMeetingMinuteDialog.tsx` - Extracted Data Bewaren

**Bestand**: `src/components/notulen/CreateMeetingMinuteDialog.tsx`

**Wijziging 1**: Voeg state toe voor extracted content (na regel 100):
```typescript
const [extractedContent, setExtractedContent] = useState<{
  agenda_items?: Array<{ item: string; discussed: boolean }>;
  decisions?: Array<{ decision: string; owner?: string | null; deadline?: string | null }>;
  content?: string;
  participants?: Array<{ name: string; role?: string | null; present?: boolean }>;
} | null>(null);
```

**Wijziging 2**: Update `applyExtractedData` (regel 166-180):
```typescript
const applyExtractedData = () => {
  if (!extractedData) return;
  
  // Form velden toepassen (bestaande code)
  if (extractedData.title) form.setValue('title', extractedData.title);
  if (extractedData.meeting_type) form.setValue('meeting_type', extractedData.meeting_type);
  if (extractedData.meeting_date) {
    form.setValue('start_at', new Date(extractedData.meeting_date));
  }
  if (extractedData.meeting_time) {
    form.setValue('start_time', extractedData.meeting_time);
  }
  if (extractedData.location) form.setValue('location', extractedData.location);
  
  // NIEUW: Bewaar extracted content voor later gebruik
  setExtractedContent({
    agenda_items: extractedData.agenda_items,
    decisions: extractedData.decisions,
    content: [extractedData.notes, extractedData.summary].filter(Boolean).join('\n\n'),
    participants: extractedData.participants,
  });
  
  clearExtractedData();
  toast.success("Gegevens toegepast", {
    description: extractedData.agenda_items?.length 
      ? `${extractedData.agenda_items.length} agenda items en ${extractedData.decisions?.length || 0} beslissingen`
      : undefined
  });
};
```

**Wijziging 3**: Update `onSubmit` om extracted content mee te sturen (regel 183-225):
```typescript
const onSubmit = async (values: CreateMeetingMinuteFormData) => {
  try {
    const [hours, minutes] = values.start_time.split(":").map(Number);
    const startDateTime = new Date(values.start_at);
    startDateTime.setHours(hours, minutes, 0, 0);

    const minuteId = await createMeetingMinute({
      title: values.title,
      meeting_type: values.meeting_type,
      start_at: startDateTime,
      location: values.location || undefined,
      meeting_link: values.meeting_link || undefined,
      linkedTaskId: linkedTaskId,
      // NIEUW: Pass extracted content
      agenda_items: extractedContent?.agenda_items,
      decisions: extractedContent?.decisions,
      content: extractedContent?.content,
      participants: extractedContent?.participants,
    });

    // ... rest blijft hetzelfde
  }
};
```

**Wijziging 4**: Reset extractedContent bij dialog close (in handleOpenChange en useEffect):
```typescript
// In handleOpenChange (regel 227-234):
const handleOpenChange = (newOpen: boolean) => {
  if (!newOpen) {
    form.reset();
    setPendingFiles([]);
    clearExtractedData();
    setExtractedContent(null);  // NIEUW
  }
  onOpenChange(newOpen);
};

// In useEffect (regel 116-129):
React.useEffect(() => {
  if (open) {
    form.reset({ ... });
    setPendingFiles([]);
    clearExtractedData();
    setExtractedContent(null);  // NIEUW
  }
}, [open, ...]);
```

---

### 3C. ExtractedDataPreview: Toon Meer Details

**Bestand**: `src/components/notulen/ExtractedDataPreview.tsx`

**Wijziging**: Toon agenda items en beslissingen met preview (regel 112-131):
```typescript
{/* Agenda - toon items */}
{data.agenda_items.length > 0 && (
  <div className="space-y-1">
    <div className="flex items-center gap-2 text-sm font-medium">
      <ListChecks className="h-3.5 w-3.5" />
      Agenda ({data.agenda_items.length} items)
      <ConfidenceBadge score={data.confidence_scores?.agenda_items || 0} />
    </div>
    <ul className="text-xs text-muted-foreground space-y-0.5 pl-5 list-disc">
      {data.agenda_items.slice(0, 3).map((item, i) => (
        <li key={i} className="truncate">{item.item}</li>
      ))}
      {data.agenda_items.length > 3 && (
        <li className="italic">+{data.agenda_items.length - 3} meer...</li>
      )}
    </ul>
  </div>
)}

{/* Decisions - toon items */}
{data.decisions.length > 0 && (
  <div className="space-y-1">
    <div className="flex items-center gap-2 text-sm font-medium">
      <FileText className="h-3.5 w-3.5" />
      Beslissingen ({data.decisions.length})
      <ConfidenceBadge score={data.confidence_scores?.decisions || 0} />
    </div>
    <ul className="text-xs text-muted-foreground space-y-0.5 pl-5 list-disc">
      {data.decisions.slice(0, 2).map((d, i) => (
        <li key={i} className="truncate">{d.decision}</li>
      ))}
      {data.decisions.length > 2 && (
        <li className="italic">+{data.decisions.length - 2} meer...</li>
      )}
    </ul>
  </div>
)}
```

---

## 4. Implementatie Volgorde

| Stap | Bestand | Wijziging |
|------|---------|-----------|
| 1 | `useCreateMeetingMinute.ts` | Extend interface + insert agenda/decisions/content |
| 2 | `useCreateMeetingMinute.ts` | Insert participants in meeting_attendees |
| 3 | `CreateMeetingMinuteDialog.tsx` | Add extractedContent state |
| 4 | `CreateMeetingMinuteDialog.tsx` | Update applyExtractedData + onSubmit |
| 5 | `ExtractedDataPreview.tsx` | Toon agenda/beslissingen preview |

---

## 5. Data Transformatie

### Extracted → Database Format

| AI Extract Format | Database Format |
|-------------------|-----------------|
| `{ item: "...", discussed: true }` | `{ id: uuid, order: 1, title: "...", duration_min: 15, discussed: true }` |
| `{ decision: "...", owner: "..." }` | `{ id: uuid, text: "...", decided_by: "...", decided_at: "...", linked_task_id: null }` |
| `{ name: "...", role: "...", present: true }` | `meeting_attendees` row met `external_name`, `role`, `attended` |

---

## 6. Acceptatie Criteria

| Criterium | Verificatie |
|-----------|-------------|
| PDF import vult agenda_items | Check `meeting_minutes.agenda_items` in DB |
| PDF import vult decisions | Check `meeting_minutes.decisions` in DB |
| PDF import vult content | Check `meeting_minutes.content` in DB |
| PDF import voegt deelnemers toe | Check `meeting_attendees` tabel |
| Notulen detail toont agenda | Open MeetingMinuteDetail |
| Notulen detail toont beslissingen | Open MeetingMinuteDetail |
| ExtractedDataPreview toont items | Visuele check in dialog |

---

## 7. Bestandsoverzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `src/hooks/useCreateMeetingMinute.ts` | +interface fields, +transform, +attendees insert (~40 regels) |
| `src/components/notulen/CreateMeetingMinuteDialog.tsx` | +extractedContent state, +applyExtractedData update (~30 regels) |
| `src/components/notulen/ExtractedDataPreview.tsx` | +agenda/decisions list preview (~30 regels) |

---

## 8. Flow Na Implementatie

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    Complete Data Persistentie                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   PDF Upload                                                          │
│       ↓                                                               │
│   Gemini Multimodal Analyse                                          │
│       ↓                                                               │
│   ExtractedDataPreview                                                │
│   ┌───────────────────────────────────────────────────────────────┐  │
│   │ ✓ Titel: "Teamoverleg Q1 2026"                                │  │
│   │ ✓ Datum: 2026-01-26                                            │  │
│   │ ✓ Type: team                                                   │  │
│   │ ✓ Deelnemers (4): Jan, Piet, Marie, Lisa                      │  │
│   │ ✓ Agenda (5 items):                                            │  │
│   │   • Opening en mededelingen                                    │  │
│   │   • Voortgang project X                                        │  │
│   │   • +3 meer...                                                 │  │
│   │ ✓ Beslissingen (2):                                            │  │
│   │   • Budget wordt goedgekeurd                                   │  │
│   │   • +1 meer...                                                 │  │
│   │                                                                 │  │
│   │ [Negeren] [Toepassen]                                          │  │
│   └───────────────────────────────────────────────────────────────┘  │
│       ↓                                                               │
│   "Toepassen" klikt → extractedContent state gevuld                  │
│       ↓                                                               │
│   Form submit → createMeetingMinute({                                │
│     agenda_items: [...],                                             │
│     decisions: [...],                                                │
│     content: "...",                                                  │
│     participants: [...]                                              │
│   })                                                                 │
│       ↓                                                               │
│   Database:                                                          │
│   ├── tasks: title, start_at                                        │
│   ├── meeting_minutes: VOLLEDIG agenda_items, decisions, content    │
│   └── meeting_attendees: 4 rows met deelnemers                      │
│       ↓                                                               │
│   Notulen pagina: Alle data zichtbaar!                               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Toekomstige Uitbreidingen (Fase 7C)

| Feature | Beschrijving |
|---------|--------------|
| Action Items → Taken | `action_items` automatisch omzetten naar `tasks` met eigenaar |
| Deelnemers Matchen | `participants.name` matchen met bestaande `profiles` |
| Beslissingen Tracken | Dashboard voor beslissingen across alle notulen |
