
# Fase 7A.2: Gemini Native PDF Multimodal - Implementatieplan

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | Vervang falende pdf-parse door Gemini's native PDF reading |
| **Risico niveau** | LOW (Gemini multimodal is bewezen technologie) |
| **Wijzigingen** | 1 bestand (edge function alleen) |
| **Geschatte omvang** | ~80 regels wijzigingen |
| **Impact** | Elimineert externe library dependency |

---

## 2. Probleemanalyse

### Huidige Situatie (regels 56-126)
```
PDF Upload → loadPdfLibrary() → esm.sh/pdf-parse → FAALT in Deno
```

**Root Cause**: `pdf-parse` is een Node.js library met native dependencies die niet werken in Deno runtime.

### Oplossing
```
PDF Upload → Gemini Multimodal (inline_data) → Native PDF parsing → Extracted data
```

**Voordeel**: Gemini heeft native multimodal ondersteuning voor PDFs - geen externe libraries nodig.

---

## 3. Technische Wijzigingen

### Bestand: `supabase/functions/ai-extract-meeting-minute/index.ts`

### Stap 1: Verwijderen (regels 56-70)

**Verwijder volledig:**
```typescript
// VERWIJDEREN: pdfParseLib variabele (regel 57)
let pdfParseLib: any = null;

// VERWIJDEREN: loadPdfLibrary functie (regels 60-70)
async function loadPdfLibrary() { ... }
```

### Stap 2: Update extractTextFromFile (regels 100-126)

**Vervang PDF sectie met skip-indicatie:**
```typescript
// PDF Extractie - SKIP, handled via Gemini multimodal
if (mimeType === 'application/pdf') {
  console.log('📄 PDF detected - will use Gemini multimodal (skipping text extraction)');
  return { 
    text: '__PDF_MULTIMODAL__', 
    method: 'pdf-parse'  // Marker voor multimodal handling
  };
}
```

### Stap 3: Nieuwe functie voor PDF Multimodal (toevoegen na regel 238)

```typescript
// Gemini multimodal PDF analysis
async function analyzeWithGeminiMultimodal(
  base64Content: string,
  apiKey: string
): Promise<{ data: ExtractedMeetingData | null; error?: string }> {
  console.log('📄 [Gemini Multimodal] Analyzing PDF directly...');
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${base64Content}`
                }
              },
              {
                type: "text",
                text: `Je bent een expert in het analyseren van vergaderdocumenten voor Nederlandse zorginstellingen.

Analyseer dit PDF document en extraheer de volgende informatie. Retourneer ALLEEN een valide JSON object:

{
  "title": "Titel van de vergadering",
  "meeting_date": "YYYY-MM-DD format of null",
  "meeting_time": "HH:MM format of null",
  "location": "Locatie of null",
  "meeting_type": "team|board|project|klant|overig of null",
  "participants": [{"name": "Naam", "role": "Rol/Functie of null", "present": true/false}],
  "agenda_items": [{"item": "Agendapunt tekst", "discussed": true/false}],
  "decisions": [{"decision": "Besluit tekst", "owner": "Verantwoordelijke of null", "deadline": "YYYY-MM-DD of null"}],
  "action_items": [{"action": "Actie tekst", "assignee": "Toegewezen aan of null", "deadline": "YYYY-MM-DD of null"}],
  "notes": "Belangrijke notities als één string of null",
  "summary": "Korte samenvatting in 2-3 zinnen of null",
  "confidence_scores": {
    "title": 0-100,
    "meeting_date": 0-100,
    "meeting_time": 0-100,
    "location": 0-100,
    "meeting_type": 0-100,
    "participants": 0-100,
    "agenda_items": 0-100,
    "decisions": 0-100,
    "action_items": 0-100,
    "overall": 0-100
  }
}

REGELS:
- Retourneer ALLEEN de JSON, geen markdown of uitleg
- Gebruik Nederlandse teksten
- Bij ontbrekende informatie: null of lege array
- meeting_type moet exact een van deze waarden zijn: team, board, project, klant, overig`
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini multimodal error:", response.status, errorText);
      
      if (response.status === 429) {
        return { data: null, error: 'AI service is tijdelijk overbelast. Probeer het later opnieuw.' };
      }
      if (response.status === 402) {
        return { data: null, error: 'AI credits zijn op. Neem contact op met de beheerder.' };
      }
      
      return { data: null, error: 'Kon PDF niet analyseren. Probeer een ander bestand of kopieer de tekst naar .txt.' };
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
    console.log('✅ [Gemini Multimodal] Response received');

    // Parse with robust fallback (reuse existing functions)
    const sanitized = sanitizeAIContent(content);
    const jsonStr = extractJsonObject(sanitized);
    if (!jsonStr) {
      return { data: null, error: 'Kon PDF analyse resultaat niet verwerken' };
    }
    
    const extractedData = repairAndParse(jsonStr);
    
    // Normalize result
    const normalizedData: ExtractedMeetingData = {
      title: extractedData.title || null,
      meeting_date: extractedData.meeting_date || null,
      meeting_time: extractedData.meeting_time || null,
      location: extractedData.location || null,
      meeting_type: extractedData.meeting_type || null,
      participants: Array.isArray(extractedData.participants) ? extractedData.participants : [],
      agenda_items: Array.isArray(extractedData.agenda_items) ? extractedData.agenda_items : [],
      decisions: Array.isArray(extractedData.decisions) ? extractedData.decisions : [],
      action_items: Array.isArray(extractedData.action_items) ? extractedData.action_items : [],
      notes: extractedData.notes || null,
      summary: extractedData.summary || null,
      confidence_scores: {
        title: extractedData.confidence_scores?.title || 0,
        meeting_date: extractedData.confidence_scores?.meeting_date || 0,
        meeting_time: extractedData.confidence_scores?.meeting_time || 0,
        location: extractedData.confidence_scores?.location || 0,
        meeting_type: extractedData.confidence_scores?.meeting_type || 0,
        participants: extractedData.confidence_scores?.participants || 0,
        agenda_items: extractedData.confidence_scores?.agenda_items || 0,
        decisions: extractedData.confidence_scores?.decisions || 0,
        action_items: extractedData.confidence_scores?.action_items || 0,
        overall: extractedData.confidence_scores?.overall || 0
      }
    };

    console.log(`✅ [Gemini Multimodal] Extracted: title="${normalizedData.title}", confidence=${normalizedData.confidence_scores.overall}%`);
    return { data: normalizedData };
    
  } catch (error) {
    console.error("Gemini multimodal error:", error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'Onverwachte fout bij PDF analyse' 
    };
  }
}
```

### Stap 4: Update Main Handler (regels 254-283)

**Voeg PDF multimodal check toe VOOR de text extraction:**

```typescript
// Als fileContent aanwezig is, check eerst voor PDF multimodal
if (fileContent && mimeType) {
  console.log(`📁 Processing file with MIME type: ${mimeType}`);
  
  // PDF: gebruik Gemini multimodal (SKIP text extraction)
  if (mimeType === 'application/pdf') {
    console.log('📄 Using Gemini multimodal for PDF analysis');
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ 
        data: getEmptyResult(),
        error: 'AI service niet beschikbaar'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const multimodalResult = await analyzeWithGeminiMultimodal(fileContent, LOVABLE_API_KEY);
    
    if (multimodalResult.error || !multimodalResult.data) {
      return new Response(JSON.stringify({ 
        data: getEmptyResult(),
        error: multimodalResult.error || 'PDF analyse mislukt',
        extraction_method: 'gemini-multimodal'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      data: multimodalResult.data,
      extraction_method: 'gemini-multimodal'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Word/Text: bestaande text extraction flow
  const extraction = await extractTextFromFile(fileContent, mimeType);
  // ... rest blijft hetzelfde
}
```

---

## 4. Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     AI Extract Meeting Minute                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────┐                                                    │
│   │ File Upload │                                                    │
│   └──────┬──────┘                                                    │
│          │                                                            │
│          ▼                                                            │
│   ┌──────────────────┐                                               │
│   │ Check MIME Type  │                                               │
│   └────────┬─────────┘                                               │
│            │                                                          │
│   ┌────────┴────────────────────────────┐                            │
│   │                                      │                            │
│   ▼                                      ▼                            │
│ PDF?                              Word/Text?                          │
│   │                                      │                            │
│   ▼                                      ▼                            │
│ ┌──────────────────────┐    ┌─────────────────────────┐              │
│ │ analyzeWithGemini    │    │ extractTextFromFile     │              │
│ │ Multimodal()         │    │ (mammoth/TextDecoder)   │              │
│ │                      │    └───────────┬─────────────┘              │
│ │ - Send PDF as base64 │                │                            │
│ │ - Gemini reads PDF   │                ▼                            │
│ │ - Returns JSON       │    ┌─────────────────────────┐              │
│ └──────────┬───────────┘    │ Text-based Gemini call  │              │
│            │                 │ (existing flow)         │              │
│            │                 └───────────┬─────────────┘              │
│            │                             │                            │
│   ┌────────┴─────────────────────────────┘                           │
│   │                                                                   │
│   ▼                                                                   │
│ ┌─────────────────────────────┐                                      │
│ │ Parse JSON Response         │                                      │
│ │ (sanitize, extract, repair) │                                      │
│ └─────────────┬───────────────┘                                      │
│               │                                                       │
│               ▼                                                       │
│ ┌─────────────────────────────┐                                      │
│ │ Return ExtractedMeetingData │                                      │
│ └─────────────────────────────┘                                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementatie Volgorde

| Stap | Actie | Impact |
|------|-------|--------|
| 1 | Verwijder `pdfParseLib` variabele | Cleanup |
| 2 | Verwijder `loadPdfLibrary()` functie | Cleanup |
| 3 | Update PDF sectie in `extractTextFromFile` | Minimal change |
| 4 | Voeg `analyzeWithGeminiMultimodal()` functie toe | Nieuwe capability |
| 5 | Update main handler met PDF multimodal check | Flow routing |
| 6 | Deploy edge function | Activatie |

---

## 6. Wat Blijft Behouden

| Component | Status | Reden |
|-----------|--------|-------|
| `mammothLib` en `loadMammothLibrary()` | ✅ Behouden | Werkt wel in Deno |
| Word extractie in `extractTextFromFile` | ✅ Behouden | Functioneel |
| Text/Markdown extractie | ✅ Behouden | Functioneel |
| JSON sanitization functies | ✅ Hergebruik | Bewezen robuust |
| `getEmptyResult()` | ✅ Behouden | Error handling |
| Error handling (429, 402) | ✅ Hergebruik | In multimodal functie |

---

## 7. Acceptatie Criteria

| Criterium | Verificatie |
|-----------|-------------|
| PDF upload werkt | Test met "Notulen overleg ZZP 26-01-2026.pdf" |
| Agenda items geëxtraheerd | Check `agenda_items` array gevuld |
| Beslissingen geëxtraheerd | Check `decisions` array gevuld |
| Deelnemers geëxtraheerd | Check `participants` array gevuld |
| Word upload blijft werken | Test .docx bestand |
| .txt upload blijft werken | Test tekstbestand |
| Console toont extraction_method | Verify "gemini-multimodal" in logs |
| Nederlandse foutmeldingen | Test met corrupt PDF |
| TypeScript compileert | Build succesvol |

---

## 8. Risico's en Mitigaties

| Risico | Mitigatie |
|--------|-----------|
| Gemini PDF size limit | Bestaande 50KB text limit blijft gelden |
| Multimodal API format | Lovable AI Gateway ondersteunt file type |
| Rate limiting | Hergebruik bestaande 429 handling |
| Scanned PDFs (image-only) | Gemini kan tekst uit images lezen (OCR ingebouwd) |

---

## 9. Bestandsoverzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `supabase/functions/ai-extract-meeting-minute/index.ts` | -loadPdfLibrary (~15 regels), -pdfParseLib, +analyzeWithGeminiMultimodal (~80 regels), update handler (~25 regels) |

**Netto: ~90 regels toegevoegd, ~30 regels verwijderd**
