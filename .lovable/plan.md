

# UX Verbetering: Auto-fill en PDF als Bijlage

## Overzicht

Deze wijzigingen verbeteren de "Importeer van bestand" flow door:
1. Formuliervelden automatisch in te vullen na AI extractie
2. De geüploade PDF automatisch toe te voegen als bijlage
3. De knoppen aan te passen voor een logischer workflow

---

## Wijziging 1: CreateMeetingMinuteDialog.tsx

### 1A. Nieuwe state voor originele extractie data

Voeg een state toe om de originele extractie data te bewaren voor "Opnieuw toepassen":

```typescript
// Naast bestaande state (rond regel 101)
const [originalExtractedData, setOriginalExtractedData] = useState<ExtractedMeetingData | null>(null);
const [sourceFile, setSourceFile] = useState<File | null>(null);
```

### 1B. Wijzig handleAIImportFile voor auto-fill en bijlage

```typescript
const handleAIImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const result = await extractFromFile(file);
  
  if (result) {
    // Bewaar originele file voor bijlage
    setSourceFile(file);
    
    // Bewaar originele extractie voor "Opnieuw toepassen"
    setOriginalExtractedData(result);
    
    // Auto-fill formuliervelden
    applyDataToForm(result);
    
    // Voeg PDF automatisch toe aan pendingFiles (voorkom duplicaten)
    setPendingFiles(prev => {
      const alreadyExists = prev.some(f => f.name === file.name && f.size === file.size);
      if (alreadyExists) return prev;
      return [...prev, file].slice(0, 5);
    });
    
    toast.success("Document geanalyseerd", {
      description: "Formulier ingevuld en bestand toegevoegd als bijlage"
    });
  }
  
  e.target.value = '';
};
```

### 1C. Extraheer form-fill logica naar herbruikbare functie

```typescript
const applyDataToForm = (data: ExtractedMeetingData) => {
  // Form velden toepassen
  if (data.title) form.setValue('title', data.title);
  if (data.meeting_type) form.setValue('meeting_type', data.meeting_type);
  if (data.meeting_date) {
    form.setValue('start_at', new Date(data.meeting_date));
  }
  if (data.meeting_time) {
    form.setValue('start_time', data.meeting_time);
  }
  if (data.location) form.setValue('location', data.location);
  
  // Fallback: als geen decisions, map action_items naar decisions format
  const decisionsToUse = data.decisions && data.decisions.length > 0 
    ? data.decisions 
    : (data.action_items || []).map(a => ({
        decision: a.action,
        owner: a.assignee || null,
        deadline: a.deadline || null
      }));
  
  // Bewaar extracted content voor later gebruik bij submit
  setExtractedContent({
    agenda_items: data.agenda_items,
    decisions: decisionsToUse,
    content: [data.notes, data.summary].filter(Boolean).join('\n\n') || undefined,
    participants: data.participants,
    action_items: data.action_items,
  });
};
```

### 1D. Wijzig applyExtractedData naar reApplyExtractedData

```typescript
const reApplyExtractedData = () => {
  if (!originalExtractedData) return;
  applyDataToForm(originalExtractedData);
  toast.success("Gegevens opnieuw toegepast");
};
```

### 1E. Voeg ignoreExtractedData functie toe

```typescript
const ignoreExtractedData = () => {
  // Reset form naar lege waarden
  form.reset({
    title: defaultTitle || "",
    meeting_type: undefined,
    start_at: new Date(),
    start_time: "14:00",
    location: "",
    meeting_link: "",
  });
  
  // Verwijder source file uit pendingFiles
  if (sourceFile) {
    setPendingFiles(prev => prev.filter(f => 
      !(f.name === sourceFile.name && f.size === sourceFile.size)
    ));
  }
  
  // Clear extracted content
  setExtractedContent(null);
  setOriginalExtractedData(null);
  setSourceFile(null);
  clearExtractedData();
  
  toast.info("Extractie genegeerd, formulier gereset");
};
```

### 1F. Wijzig dialog reset (useEffect en handleOpenChange)

```typescript
// In useEffect (open change)
if (open) {
  // ... bestaande reset
  setOriginalExtractedData(null);
  setSourceFile(null);
}

// In handleOpenChange
if (!newOpen) {
  // ... bestaande reset
  setOriginalExtractedData(null);
  setSourceFile(null);
}
```

### 1G. Wijzig ExtractedDataPreview rendering

Toon alleen preview als er nog geen data is toegepast (extractedData bestaat maar originalExtractedData nog niet):

```tsx
{/* Show extracted data preview - alleen als nog niet toegepast */}
{extractedData && !originalExtractedData && (
  <ExtractedDataPreview
    data={extractedData}
    onApply={/* wordt nu automatisch gedaan */}
    onCancel={clearExtractedData}
  />
)}

{/* Toon "Opnieuw toepassen" / "Negeren" knoppen als data WEL is toegepast */}
{originalExtractedData && (
  <div className="flex items-center gap-2 py-2 px-3 bg-muted/50 rounded-lg border">
    <Sparkles className="h-4 w-4 text-primary" />
    <span className="text-sm flex-1">AI-data toegepast</span>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={ignoreExtractedData}
    >
      Negeren
    </Button>
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={reApplyExtractedData}
    >
      Opnieuw toepassen
    </Button>
  </div>
)}
```

---

## Wijziging 2: ExtractedDataPreview.tsx (Optioneel)

De ExtractedDataPreview component hoeft niet te worden aangepast omdat:
- De preview wordt nu alleen getoond tijdens het extractie proces (vóór auto-apply)
- Na auto-apply wordt een compactere balk getoond in de dialog zelf

Echter, voor edge cases waar de gebruiker de extractie cancelt vóór auto-apply:

```tsx
// Knop tekst blijft "Toepassen" (wordt niet meer getoond na auto-apply)
```

---

## Samenvatting Wijzigingen

| Bestand | Wijziging |
|---------|-----------|
| `CreateMeetingMinuteDialog.tsx` | Nieuwe states voor originele data en source file |
| `CreateMeetingMinuteDialog.tsx` | `handleAIImportFile` roept auto-fill aan en voegt file toe |
| `CreateMeetingMinuteDialog.tsx` | Nieuwe `applyDataToForm` herbruikbare functie |
| `CreateMeetingMinuteDialog.tsx` | `reApplyExtractedData` voor "Opnieuw toepassen" |
| `CreateMeetingMinuteDialog.tsx` | `ignoreExtractedData` reset naar lege velden |
| `CreateMeetingMinuteDialog.tsx` | Conditonele rendering voor preview vs applied state |
| `CreateMeetingMinuteDialog.tsx` | Reset extra states bij dialog close |

---

## Flow Na Implementatie

```text
1. Gebruiker klikt "Importeer van bestand"
2. Selecteert PDF
3. AI extractie start (loading spinner)
4. Extractie succesvol:
   a. Formuliervelden worden AUTOMATISCH ingevuld
   b. PDF wordt toegevoegd aan bijlagen preview
   c. Toast: "Document geanalyseerd - Formulier ingevuld en bestand toegevoegd als bijlage"
   d. Compacte balk toont: "AI-data toegepast" + [Negeren] [Opnieuw toepassen]
5. Gebruiker kan:
   - Velden handmatig aanpassen en opslaan
   - "Negeren" → alles wordt gereset naar leeg
   - "Opnieuw toepassen" → overschrijft handmatige wijzigingen met AI data
6. Bij opslaan wordt PDF correct geüpload als bijlage
```

---

## Technische Details

- Geen Edge Function wijzigingen nodig
- Geen database wijzigingen nodig
- Bestaande extractie logica in `useAIExtractMeeting.ts` blijft ongewijzigd
- Bestaande upload logica in `useUploadAttachment.ts` blijft ongewijzigd

