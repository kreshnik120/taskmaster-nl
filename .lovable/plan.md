
# Fase 7A.1: PDF/Word Extractie Error Handling Fix

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | Verbeterde error handling voor PDF/Word extractie |
| **Risico niveau** | LOW (alleen error handling verbeteringen) |
| **Wijzigingen** | 3 bestanden |
| **Geschatte omvang** | ~100 regels wijzigingen |

---

## 2. Geïdentificeerde Problemen

### Edge Function Problemen (regels 56-110)
1. **TextExtractionResult interface mist `error` property** - wanneer extractie faalt, wordt geen specifieke foutmelding doorgegeven
2. **Dynamic imports zonder library caching** - bij elke request worden libraries opnieuw geladen (inefficiënt)
3. **Generieke error messages** - "Kon bestand niet lezen" geeft geen context
4. **Empty text niet gedetecteerd** - gescande PDFs zonder OCR geven lege tekst maar geen warning

### Hook Problemen (regels 143-161)
1. **Error response parsing** - als edge function faalt met HTTP error, wordt alleen generieke toast getoond
2. **Geen console logging** - debugging is lastig

### Dialog Problemen (regels 248-273)
1. **Geen fallback hint** - gebruiker weet niet wat te doen bij failure

---

## 3. Implementatie

### 3A. Edge Function: Verbeterde Error Handling

**Bestand**: `supabase/functions/ai-extract-meeting-minute/index.ts`

**Wijziging 1**: Update `TextExtractionResult` interface (regel 50-53):
```typescript
interface TextExtractionResult {
  text: string;
  method: 'pdf-parse' | 'mammoth' | 'direct' | 'unsupported' | 'failed';
  error?: string;  // NIEUW: Specifieke foutmelding
}
```

**Wijziging 2**: Library loading met caching en error handling (vóór regel 56):
```typescript
// Library caching voor performance
let pdfParseLib: any = null;
let mammothLib: any = null;

async function loadPdfLibrary() {
  if (!pdfParseLib) {
    try {
      pdfParseLib = (await import("https://esm.sh/pdf-parse@1.1.1")).default;
    } catch (error) {
      console.error('Failed to load pdf-parse library:', error);
      throw new Error('PDF library kon niet geladen worden');
    }
  }
  return pdfParseLib;
}

async function loadMammothLibrary() {
  if (!mammothLib) {
    try {
      mammothLib = (await import("https://esm.sh/mammoth@1.6.0")).default;
    } catch (error) {
      console.error('Failed to load mammoth library:', error);
      throw new Error('Word library kon niet geladen worden');
    }
  }
  return mammothLib;
}
```

**Wijziging 3**: Update `extractTextFromFile` met specifieke errors (vervang regels 56-110):
```typescript
async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<TextExtractionResult> {
  console.log(`📁 extractTextFromFile called with mimeType: ${mimeType}, content length: ${base64Content.length}`);
  
  try {
    // Decode base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log(`📁 Decoded ${bytes.length} bytes from base64`);

    // PDF Extractie
    if (mimeType === 'application/pdf') {
      try {
        const pdfParse = await loadPdfLibrary();
        const pdfData = await pdfParse(bytes);
        
        if (!pdfData.text || pdfData.text.trim().length === 0) {
          console.warn('📄 PDF parsed but contains no text (possibly scanned)');
          return { 
            text: '', 
            method: 'pdf-parse',
            error: 'PDF bevat geen leesbare tekst. Dit kan een gescand document zijn. Kopieer de tekst naar een .txt bestand en probeer opnieuw.'
          };
        }
        
        console.log(`📄 PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} chars`);
        return { text: pdfData.text, method: 'pdf-parse' };
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        const errorMessage = pdfError instanceof Error ? pdfError.message : 'Onbekende PDF fout';
        return { 
          text: '', 
          method: 'failed',
          error: `Kon PDF niet lezen: ${errorMessage}. Probeer een ander bestand of kopieer de tekst naar .txt.`
        };
      }
    }

    // Word Extractie (.docx, .doc)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const mammoth = await loadMammothLibrary();
        const result = await mammoth.extractRawText({ buffer: bytes });
        
        if (!result.value || result.value.trim().length === 0) {
          console.warn('📝 Word parsed but contains no text');
          return { 
            text: '', 
            method: 'mammoth',
            error: 'Word document bevat geen leesbare tekst. Kopieer de inhoud naar een .txt bestand.'
          };
        }
        
        console.log(`📝 Word parsed: ${result.value.length} chars`);
        return { text: result.value, method: 'mammoth' };
      } catch (wordError) {
        console.error('Word parse error:', wordError);
        const errorMessage = wordError instanceof Error ? wordError.message : 'Onbekende Word fout';
        return { 
          text: '', 
          method: 'failed',
          error: `Kon Word document niet lezen: ${errorMessage}. Probeer .docx in plaats van .doc, of kopieer naar .txt.`
        };
      }
    }

    // Plain text / Markdown
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      try {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(bytes);
        console.log(`📝 Text decoded: ${text.length} chars`);
        return { text, method: 'direct' };
      } catch (decodeError) {
        return { 
          text: '', 
          method: 'failed',
          error: 'Kon tekstbestand niet decoderen. Controleer de encoding (UTF-8 vereist).'
        };
      }
    }

    return { 
      text: '', 
      method: 'unsupported',
      error: `Bestandstype "${mimeType}" wordt niet ondersteund. Gebruik PDF, Word (.docx), of tekst (.txt, .md).`
    };
  } catch (error) {
    console.error('Text extraction error:', error);
    return { 
      text: '', 
      method: 'failed',
      error: error instanceof Error ? error.message : 'Onverwachte fout bij bestandsverwerking'
    };
  }
}
```

**Wijziging 4**: Update main handler om extraction.error door te geven (vervang regels 180-190):
```typescript
if (extraction.error) {
  console.error(`❌ Extraction failed: ${extraction.error}`);
  return new Response(JSON.stringify({ 
    data: getEmptyResult(),
    error: extraction.error,
    extraction_method: extraction.method
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

if (!extraction.text || extraction.text.trim().length === 0) {
  return new Response(JSON.stringify({ 
    data: getEmptyResult(),
    error: 'Geen leesbare tekst gevonden in bestand',
    extraction_method: extraction.method
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

---

### 3B. Hook: Verbeterde Error Handling

**Bestand**: `src/hooks/notulen/useAIExtractMeeting.ts`

**Wijziging 1**: Verbeterde error handling in extractFromFile (vervang regels 143-161):
```typescript
const { data, error: invokeError } = await supabase.functions.invoke('ai-extract-meeting-minute', {
  body: { fileContent: base64Content, mimeType }
});

if (invokeError) {
  console.error('Edge function invoke error:', invokeError);
  throw new Error(invokeError.message || 'Fout bij verbinding met AI service');
}

// Check voor specifieke extraction errors
if (data?.error) {
  console.error('Extraction error from edge function:', data.error);
  setError(data.error);
  toast.error("Document verwerking mislukt", {
    description: data.error,
    duration: 6000, // Langere duration voor error details
  });
  return null;
}

if (!data?.data) {
  console.error('No data returned from edge function');
  setError('Geen data ontvangen van AI service');
  toast.error("Kon document niet analyseren");
  return null;
}

console.log(`✅ Extraction successful via ${data.extraction_method || 'unknown'}`);
setExtractedData(data.data);
return data.data;
```

**Wijziging 2**: Verbeterde catch block (vervang regels 157-161):
```typescript
} catch (err) {
  console.error('AI extraction error:', err);
  const message = err instanceof Error ? err.message : 'Extractie mislukt';
  setError(message);
  toast.error("Document verwerking mislukt", {
    description: message.length > 100 
      ? "Probeer een ander bestand of kopieer de tekst naar .txt" 
      : message,
    duration: 5000,
  });
  return null;
} finally {
```

---

### 3C. Dialog: Fallback Hint Toevoegen

**Bestand**: `src/components/notulen/CreateMeetingMinuteDialog.tsx`

**Wijziging**: Voeg fallback hint toe onder AI import sectie (na regel 272):
```tsx
{/* AI Import section */}
<div className="flex flex-col gap-1 py-2 border-b">
  <div className="flex items-center gap-2">
    <input
      ref={aiFileInputRef}
      type="file"
      accept=".txt,.md,.pdf,.doc,.docx"
      onChange={handleAIImportFile}
      className="hidden"
    />
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleAIImportClick}
      disabled={isCreating || isExtracting || isUploading}
    >
      {isExtracting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4 mr-2" />
      )}
      {isExtracting ? "Analyseren..." : "Importeer van bestand"}
    </Button>
    <span className="text-xs text-muted-foreground">
      (PDF, Word, .txt, .md)
    </span>
  </div>
  <p className="text-xs text-muted-foreground/70 italic">
    Tip: Bij problemen met PDF, kopieer de tekst naar een .txt bestand
  </p>
</div>
```

---

## 4. Implementatie Volgorde

| Stap | Bestand | Wijziging | Prioriteit |
|------|---------|-----------|------------|
| 1 | `supabase/functions/ai-extract-meeting-minute/index.ts` | Library caching + error interface | HIGH |
| 2 | `supabase/functions/ai-extract-meeting-minute/index.ts` | extractTextFromFile met specifieke errors | HIGH |
| 3 | `supabase/functions/ai-extract-meeting-minute/index.ts` | Main handler error propagation | HIGH |
| 4 | `src/hooks/notulen/useAIExtractMeeting.ts` | Verbeterde error handling + logging | MEDIUM |
| 5 | `src/components/notulen/CreateMeetingMinuteDialog.tsx` | Fallback hint UI | LOW |

---

## 5. Acceptatie Criteria

| Criterium | Verificatie |
|-----------|-------------|
| PDF upload toont specifieke foutmelding | Test met corrupt PDF |
| Gescande PDF geeft duidelijke melding | Test met image-only PDF |
| Word upload toont specifieke foutmelding | Test met corrupt .docx |
| Console logs tonen extraction details | Check browser console |
| Nederlandse foutmeldingen | Alle errors in NL |
| Fallback hint zichtbaar | UI check |
| TypeScript compileert | Build succesvol |

---

## 6. Bestandsoverzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `supabase/functions/ai-extract-meeting-minute/index.ts` | +TextExtractionResult.error, +library caching, +specifieke errors (~80 regels) |
| `src/hooks/notulen/useAIExtractMeeting.ts` | +console logging, +toast descriptions (~20 regels) |
| `src/components/notulen/CreateMeetingMinuteDialog.tsx` | +fallback hint (~5 regels) |

---

## 7. Risico's en Mitigaties

| Risico | Mitigatie |
|--------|-----------|
| esm.sh imports kunnen falen | Library caching + specifieke error handling |
| Grote PDFs kunnen timeout veroorzaken | Existing 50KB limit + error message |
| .doc (legacy) werkt niet goed | Error message suggereert .docx |
