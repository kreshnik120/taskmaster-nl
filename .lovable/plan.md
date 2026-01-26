
# Fase 7A: Document Intelligence Foundation - Implementatieplan

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | PDF/Word extractie in edge function, uitgebreide MIME types in hook, accept attribute update |
| **Risico niveau** | MEDIUM (npm dependencies in Deno edge function) |
| **Bestaande patronen** | `ai-extract-meeting-minute` edge function, `useAIExtractMeeting` hook |
| **Wijzigingen** | 3 bestaande bestanden |
| **Geschatte omvang** | ~150-200 regels |

---

## 2. Huidige Situatie Analyse

### Edge Function (`ai-extract-meeting-minute/index.ts`)
- **Ontvangt**: `documentText` als string (regel 107)
- **Ondersteunt**: Alleen tekst die al geëxtraheerd is
- **Ontbreekt**: PDF/Word binary parsing

### Hook (`useAIExtractMeeting.ts`)
- **Ondersteunt**: Alleen `text/plain`, `text/markdown` (regels 100-101)
- **Leest**: Bestanden als tekst via `readAsText` (regel 112)
- **Ontbreekt**: Base64 encoding voor binaire bestanden

### CreateMeetingMinuteDialog
- **Accept attribute**: `.txt,.md` (moet uitgebreid naar PDF/Word)

### MeetingMinuteDetail
- **Content veld**: Bestaat al in "Notities" sectie (regels 355-370)
- **Database**: `content TEXT` veld bestaat al in `meeting_minutes` tabel
- **Conclusie**: Content sectie werkt al correct, geen wijziging nodig!

---

## 3. Technische Aanpak

### 3A. Edge Function Update: PDF/Word Extractie

**Bestand**: `supabase/functions/ai-extract-meeting-minute/index.ts`

**Nieuwe imports** (Deno npm: specifier):
```typescript
// Top van bestand - Deno npm imports
import pdf from "npm:pdf-parse@1.1.1";
import mammoth from "npm:mammoth@1.6.0";
```

**Nieuwe helper functie** (~50 regels):
```typescript
interface TextExtractionResult {
  text: string;
  method: 'pdf-parse' | 'mammoth' | 'direct' | 'unsupported' | 'failed';
}

async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<TextExtractionResult> {
  try {
    // Decode base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PDF Extractie
    if (mimeType === 'application/pdf') {
      try {
        // pdf-parse verwacht een Buffer
        const pdfData = await pdf(bytes);
        console.log(`📄 PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} chars`);
        return { text: pdfData.text, method: 'pdf-parse' };
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        return { text: '', method: 'failed' };
      }
    }

    // Word Extractie (.docx)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: bytes });
        console.log(`📝 Word parsed: ${result.value.length} chars`);
        return { text: result.value, method: 'mammoth' };
      } catch (wordError) {
        console.error('Word parse error:', wordError);
        return { text: '', method: 'failed' };
      }
    }

    // Plain text / Markdown - decode als UTF-8
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      const decoder = new TextDecoder('utf-8');
      return { text: decoder.decode(bytes), method: 'direct' };
    }

    return { text: '', method: 'unsupported' };
  } catch (error) {
    console.error('Text extraction error:', error);
    return { text: '', method: 'failed' };
  }
}
```

**Update request handler** (wijziging in serve functie):
```typescript
// Was:
const { documentText } = await req.json();

// Wordt:
const body = await req.json();
const { documentText, fileContent, mimeType } = body;

let textToAnalyze = documentText;
let extractionMethod = 'direct';

// Als fileContent aanwezig is, extraheer tekst uit bestand
if (fileContent && mimeType) {
  console.log(`📁 Processing file with MIME type: ${mimeType}`);
  const extraction = await extractTextFromFile(fileContent, mimeType);
  
  if (!extraction.text || extraction.method === 'failed' || extraction.method === 'unsupported') {
    return new Response(JSON.stringify({ 
      data: getEmptyResult(),
      error: extraction.method === 'unsupported' 
        ? 'Bestandstype niet ondersteund' 
        : 'Kon bestand niet lezen'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  textToAnalyze = extraction.text;
  extractionMethod = extraction.method;
}

if (!textToAnalyze || typeof textToAnalyze !== 'string') {
  return new Response(JSON.stringify({ error: 'Document tekst is verplicht' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Rest van de functie gebruikt textToAnalyze i.p.v. documentText
```

**Response uitbreiding**:
```typescript
// In de succesvolle response:
return new Response(JSON.stringify({ 
  data: extractedData,
  extraction_method: extractionMethod
}), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});
```

---

### 3B. Hook Update: MIME Types & Base64 Encoding

**Bestand**: `src/hooks/notulen/useAIExtractMeeting.ts`

**Uitgebreide MIME types** (vervang regels 100-101):
```typescript
const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
] as const;

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.doc', '.docx'];
```

**Nieuwe fileToBase64 functie** (toevoegen na readFileAsText):
```typescript
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 part from data URL (format: "data:mime;base64,CONTENT")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Kon bestand niet lezen'));
    reader.readAsDataURL(file);
  });
}
```

**Update extractFromFile functie** (vervang regels 98-118):
```typescript
const extractFromFile = useCallback(async (file: File): Promise<ExtractedMeetingData | null> => {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const isTextFile = file.type === 'text/plain' || file.type === 'text/markdown' || 
                     ext === '.txt' || ext === '.md';
  const isPdfOrWord = file.type === 'application/pdf' || 
                      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                      file.type === 'application/msword' ||
                      ext === '.pdf' || ext === '.doc' || ext === '.docx';
  
  if (!isTextFile && !isPdfOrWord) {
    toast.error("Alleen PDF, Word (.docx, .doc) en tekst (.txt, .md) worden ondersteund");
    return null;
  }

  setIsExtracting(true);
  setError(null);

  try {
    // Voor tekst bestanden: lees als tekst en stuur documentText
    if (isTextFile) {
      const text = await readFileAsText(file);
      return await extractFromText(text);
    }
    
    // Voor PDF/Word: encode als base64 en stuur fileContent + mimeType
    const base64Content = await fileToBase64(file);
    const mimeType = file.type || (ext === '.pdf' ? 'application/pdf' : 
                     ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                     'application/msword');
    
    const { data, error: invokeError } = await supabase.functions.invoke('ai-extract-meeting-minute', {
      body: { fileContent: base64Content, mimeType }
    });

    if (invokeError) throw invokeError;

    if (data?.error) {
      setError(data.error);
      toast.error(data.error);
      return null;
    }

    setExtractedData(data?.data || null);
    return data?.data || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extractie mislukt';
    setError(message);
    toast.error("Kon document niet analyseren");
    return null;
  } finally {
    setIsExtracting(false);
  }
}, [extractFromText]);
```

---

### 3C. CreateMeetingMinuteDialog: Accept Uitbreiden

**Bestand**: `src/components/notulen/CreateMeetingMinuteDialog.tsx`

**Wijziging 1** - AI import file input (regel 211):
```typescript
// Was:
accept=".txt,.md"

// Wordt:
accept=".txt,.md,.pdf,.doc,.docx"
```

**Wijziging 2** - Hint tekst (regel 220):
```typescript
// Was:
<span className="text-xs text-muted-foreground">
  (.txt, .md)
</span>

// Wordt:
<span className="text-xs text-muted-foreground">
  (PDF, Word, .txt, .md)
</span>
```

---

## 4. Content Sectie Analyse

Na onderzoek is gebleken dat de **Content sectie al correct geïmplementeerd is** in `MeetingMinuteDetail.tsx`:

| Feature | Status | Locatie |
|---------|--------|---------|
| Content weergave | ✅ Werkt | Regels 355-370 ("Notities" sectie) |
| Content bewerken | ✅ Werkt | Textarea in edit mode |
| Empty state | ✅ Werkt | "Geen notities toegevoegd" |
| Database veld | ✅ Bestaat | `content TEXT` in meeting_minutes |

**Conclusie**: Geen wijzigingen nodig aan MeetingMinuteDetail.tsx voor content weergave.

De "Toon volledige inhoud" toggle en "Kopieer naar klembord" features uit de originele requirements zijn **nice-to-have** en kunnen in een latere iteratie worden toegevoegd.

---

## 5. Implementatie Volgorde

| Stap | Bestand | Wijziging | Prioriteit |
|------|---------|-----------|------------|
| 1 | `supabase/functions/ai-extract-meeting-minute/index.ts` | +extractTextFromFile, +npm imports, +handler update | HIGH |
| 2 | `src/hooks/notulen/useAIExtractMeeting.ts` | +MIME types, +fileToBase64, extractFromFile update | HIGH |
| 3 | `src/components/notulen/CreateMeetingMinuteDialog.tsx` | accept attribute + hint tekst | HIGH |

**Totaal: ~150 regels gewijzigde code**

---

## 6. Technische Risico's en Mitigaties

| Risico | Mitigatie |
|--------|-----------|
| npm: imports in Deno | Gebruik expliciete versies (`npm:pdf-parse@1.1.1`) |
| PDF parsing failures | Graceful fallback met duidelijke foutmelding |
| Grote bestanden | Edge function heeft timeout; base64 vergroot ~33% |
| Word .doc (legacy) | mammoth ondersteunt .doc beperkt; primaire focus op .docx |
| Memory in edge function | pdf-parse is memory-intensief; max 50MB input |

---

## 7. Acceptatie Criteria Checklist

| Criterium | Test |
|-----------|------|
| PDF import werkt | Upload "Notulen overleg ZZP 26-01-2026.pdf" → tekst geëxtraheerd |
| Word .docx import werkt | Upload Word document → tekst geëxtraheerd |
| AI analyse werkt op PDF tekst | Extracted text → agenda_items, decisions gevuld |
| Foutmelding bij corrupte PDF | "Kon bestand niet lezen" |
| Nederlandse UI | Alle labels in Nederlands |
| TypeScript compileert | Geen type errors |

---

## 8. Wat NIET wordt gebouwd

| Item | Reden |
|------|-------|
| OCR voor gescande PDFs | Vereist Vision API (Fase 7B) |
| "Toon volledige inhoud" toggle | Nice-to-have, huidige implementatie werkt |
| "Kopieer naar klembord" button | Nice-to-have |
| Batch import | Out of scope |
| Content Section refactor | Bestaande "Notities" sectie werkt al |

---

## 9. Bestandsoverzicht

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/ai-extract-meeting-minute/index.ts` | +npm imports, +extractTextFromFile (~50 regels), handler update (~30 regels) |
| `src/hooks/notulen/useAIExtractMeeting.ts` | +MIME types, +fileToBase64, extractFromFile refactor (~60 regels) |
| `src/components/notulen/CreateMeetingMinuteDialog.tsx` | accept uitbreiden, hint tekst (~2 regels) |
