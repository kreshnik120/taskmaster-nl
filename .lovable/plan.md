
# Fix: Beslissingen en Deelnemers Worden Niet Opgeslagen

## 1. Probleem Samenvatting

| Aspect | Status |
|--------|--------|
| **Root Cause** | Gemini AI extraheert geen `decisions` of `participants` uit het PDF |
| **Bewijs** | Database toont `decisions: []` terwijl `agenda_items` wel gevuld is (9 items) |
| **Frontend Code** | Correct - geen bugs gevonden |
| **Backend Code** | Correct - geen bugs gevonden |
| **Probleem** | AI Prompt is te strikt / document bevat geen expliciete "besluiten" |

---

## 2. Bewijsvoering

### Database Query Resultaat
```json
{
  "agenda_items": [9 items correct opgeslagen],
  "decisions": [],  // LEEG
  "content": "..." // Correct gevuld
}
// meeting_attendees: 0 rijen
```

### Code Flow Verificatie
```text
ExtractedDataPreview → extractedData.decisions = []
                       extractedData.participants = []
        ↓
applyExtractedData() → setExtractedContent({ decisions: [], participants: [] })
        ↓
onSubmit() → createMeetingMinute({ decisions: [], participants: [] })
        ↓
useCreateMeetingMinute → formattedDecisions = [] (want input.decisions was [])
                         attendeesToInsert niet uitgevoerd (want participants.length = 0)
```

---

## 3. Oplossing

### Stap 1: Verbeter AI Prompt voor Betere Extractie

**Bestand**: `supabase/functions/ai-extract-meeting-minute/index.ts`

**Locatie**: Regel 229-264 (Gemini multimodal prompt)

**Wijzigingen**:
1. Verduidelijk dat "actiepunten", "afspraken", "to-do's" ook als decisions gelden
2. Verduidelijk dat "aanwezigen", "namen in tekst" ook als participants gelden
3. Voeg expliciete instructie toe om ALLE genoemde personen te extraheren

```typescript
text: `Je bent een expert in het analyseren van vergaderdocumenten voor Nederlandse zorginstellingen.

Analyseer dit PDF document en extraheer de volgende informatie. Retourneer ALLEEN een valide JSON object:

{
  "title": "Titel van de vergadering of document",
  "meeting_date": "YYYY-MM-DD format of null",
  "meeting_time": "HH:MM format of null",
  "location": "Locatie of null",
  "meeting_type": "team|board|project|klant|overig of null",
  "participants": [{"name": "Voornaam + Achternaam", "role": "Functie/Rol of null", "present": true}],
  "agenda_items": [{"item": "Agendapunt of besproken onderwerp", "discussed": true}],
  "decisions": [{"decision": "Besluit, afspraak of actiepunt", "owner": "Verantwoordelijke persoon of null", "deadline": "YYYY-MM-DD of null"}],
  "action_items": [{"action": "Specifieke actie", "assignee": "Toegewezen aan of null", "deadline": "YYYY-MM-DD of null"}],
  "notes": "Belangrijke notities als één string of null",
  "summary": "Korte samenvatting in 2-3 zinnen of null",
  "confidence_scores": {...}
}

BELANGRIJKE INSTRUCTIES:
1. PARTICIPANTS: Extraheer ALLE personen die in het document worden genoemd:
   - Kijk naar "Aanwezigen:", "Deelnemers:", namen in handtekeningen
   - Namen die acties krijgen toegewezen zijn ook participants
   - Gebruik volledige namen waar mogelijk

2. DECISIONS: Dit zijn NIET alleen formele besluiten. Neem ook op:
   - Actiepunten en to-do items
   - Afspraken die zijn gemaakt
   - Vervolgacties met verantwoordelijke
   - Alles waar een naam + actie bij staat

3. Als je twijfelt, neem het WEL op (better safe than sorry)

4. Confidence scores: geef eerlijke scores (0-100)`
```

### Stap 2: Fallback voor action_items → decisions

**Bestand**: `src/components/notulen/CreateMeetingMinuteDialog.tsx`

**Locatie**: Regel 188-193 (`applyExtractedData` functie)

**Wijziging**: Als `decisions` leeg is maar `action_items` niet, gebruik action_items als fallback:

```typescript
const applyExtractedData = () => {
  if (!extractedData) return;
  
  // Form velden toepassen (bestaande code blijft)
  if (extractedData.title) form.setValue('title', extractedData.title);
  // ... etc
  
  // Fallback: als geen decisions, map action_items naar decisions format
  const decisionsToUse = extractedData.decisions.length > 0 
    ? extractedData.decisions 
    : (extractedData.action_items || []).map(a => ({
        decision: a.action,
        owner: a.assignee || null,
        deadline: a.deadline || null
      }));
  
  // Bewaar extracted content voor later gebruik bij submit
  setExtractedContent({
    agenda_items: extractedData.agenda_items,
    decisions: decisionsToUse,
    content: [extractedData.notes, extractedData.summary].filter(Boolean).join('\n\n') || undefined,
    participants: extractedData.participants,
  });
  
  // Update toast message
  clearExtractedData();
  toast.success("Gegevens toegepast", {
    description: extractedData.agenda_items?.length 
      ? `${extractedData.agenda_items.length} agenda items en ${decisionsToUse.length} beslissingen/acties`
      : undefined
  });
};
```

---

## 4. Implementatie Volgorde

| Stap | Bestand | Wijziging | Impact |
|------|---------|-----------|--------|
| 1 | `supabase/functions/ai-extract-meeting-minute/index.ts` | Verbeterde prompt met duidelijkere instructies | Gemini extraheert meer data |
| 2 | `src/components/notulen/CreateMeetingMinuteDialog.tsx` | Fallback action_items → decisions | Geen data verlies |
| 3 | Deploy edge function | Activeer nieuwe prompt | - |

---

## 5. Verwacht Resultaat Na Fix

```text
PDF Upload
    ↓
Gemini Multimodal (verbeterde prompt)
    ↓
ExtractedDataPreview:
  ✓ Participants: 4 (Leonie, Erik, Elham, Bloezem)
  ✓ Decisions: 8 (inclusief action_items als fallback)
  ✓ Agenda: 9 items
    ↓
Database:
  ├── meeting_minutes.decisions: [8 items]
  └── meeting_attendees: 4 rijen
```

---

## 6. Technische Details

### Gewijzigde Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `supabase/functions/ai-extract-meeting-minute/index.ts` | Verbeterde prompt (~30 regels) |
| `src/components/notulen/CreateMeetingMinuteDialog.tsx` | action_items fallback (~10 regels) |

### Geen Wijzigingen Nodig In

| Bestand | Reden |
|---------|-------|
| `useCreateMeetingMinute.ts` | Insert logica is al correct |
| `ExtractedDataPreview.tsx` | Preview logica is al correct |
| `useAIExtractMeeting.ts` | Hook is al correct |

---

## 7. Test Verificatie

Na implementatie, test met dezelfde PDF:

1. Upload PDF via "Importeer van bestand"
2. Controleer ExtractedDataPreview:
   - Toont het nu participants?
   - Toont het nu decisions?
3. Klik "Toepassen" en "Aanmaken"
4. Controleer database:
   ```sql
   SELECT decisions, (SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = mm.id) as attendee_count
   FROM meeting_minutes mm
   ORDER BY created_at DESC LIMIT 1;
   ```
