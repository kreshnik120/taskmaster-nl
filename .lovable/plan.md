
# FIX: AI Extractie Consistentie (B-303)

## Probleem Analyse

**Root Cause:** Dezelfde PDF geeft inconsistente resultaten (soms 25 items, soms 10 items).

### Bevindingen in Huidige Code

Na analyse van `supabase/functions/ai-extract-meeting-minute/index.ts` (889 regels):

| Aspect | Huidige Status | Probleem |
|--------|----------------|----------|
| `temperature` | ✅ Al 0.1 (regel 374, 623, 765) | Geen probleem - al bijna deterministisch |
| `maxOutputTokens` | ❌ Niet ingesteld | Response kan afbreken bij grote output |
| Timeout | ❌ Geen timeout | Request kan hangen bij grote PDFs |
| Retry logica | ❌ Geen retry | Transient failures leiden tot lege resultaten |
| Array validatie | ❌ Niet compleet | Afgebroken JSON wordt niet gedetecteerd |
| Completeness instructie | ❌ Niet aanwezig | AI kan items overslaan |

### Positief: `_shared/core.ts` heeft retry utilities
De codebase heeft al `retryWithBackoff` en `fetchWithRetry` helpers die hergebruikt kunnen worden.

---

## Implementatie Plan

### Wijziging 1: Voeg `maxOutputTokens` toe aan alle Gemini calls

**Locaties:** 3 plaatsen in het bestand

```typescript
// Regel 229-376 (analyzeWithGeminiMultimodal functie)
body: JSON.stringify({
  model: "google/gemini-2.5-flash",
  messages: [...],
  response_format: { type: "json_object" },
  temperature: 0.1,
  max_tokens: 8192,  // ← TOEVOEGEN: Voorkom truncatie
}),

// Regel 610-625 (Word/Text extraction AI call)
body: JSON.stringify({
  ...
  temperature: 0.1,
  max_tokens: 8192,  // ← TOEVOEGEN
}),

// Regel 752-767 (Direct text AI call)
body: JSON.stringify({
  ...
  temperature: 0.1,
  max_tokens: 8192,  // ← TOEVOEGEN
}),
```

**Waarom 8192?** Gemini 2.5 Flash ondersteunt tot 8192 output tokens. Dit is voldoende voor documenten met 50+ action items.

---

### Wijziging 2: Voeg timeout + retry logica toe

**Nieuwe helper functie** (na regel 197):

```typescript
// AI request with timeout and retry
async function fetchAIWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs = 60000,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      // Retry on transient errors
      if (response.status === 502 || response.status === 503) {
        throw new Error(`Transient error (${response.status})`);
      }
      
      return response;
    } catch (error: any) {
      clearTimeout(timeout);
      lastError = error;
      
      if (error.name === 'AbortError') {
        console.warn(`⚠️ [AI] Attempt ${attempt}/${maxRetries} timed out after ${timeoutMs}ms`);
      } else {
        console.warn(`⚠️ [AI] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      }
      
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError || new Error('AI request failed after retries');
}
```

**Vervang alle `fetch()` calls naar AI gateway met `fetchAIWithRetry()`:**
- Regel 229
- Regel 610
- Regel 752

---

### Wijziging 3: Verbeter de AI prompt met completeness instructie

**Voeg toe aan alle 3 prompts** (multimodal, text extraction, direct):

```text
CRITICAL COMPLETENESS REQUIREMENTS:
- Extract ALL items found in the document without exception
- Do NOT filter, summarize, abbreviate, or skip any items
- Include every single participant, action_item, decision, and agenda_item even if similar
- If the document has 50 items, return all 50 items
- Never truncate or limit your output based on perceived relevance
```

**Locaties:**
- Regel 295 (multimodal prompt, na "BELANGRIJKE INSTRUCTIES:")
- Regel 519 (systemPrompt, na "REGELS:")
- Direct text gebruikt systemPrompt, dus automatisch bijgewerkt

---

### Wijziging 4: Verbeter JSON array validatie

**Nieuwe validatie functie** (na repairAndParse):

```typescript
// Validate JSON completeness - check for truncated arrays
function validateJsonCompleteness(jsonStr: string): { valid: boolean; issue?: string } {
  // Count opening and closing brackets
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  
  if (openBrackets !== closeBrackets) {
    return { valid: false, issue: `Incomplete arrays: ${openBrackets} [ vs ${closeBrackets} ]` };
  }
  if (openBraces !== closeBraces) {
    return { valid: false, issue: `Incomplete objects: ${openBraces} { vs ${closeBraces} }` };
  }
  
  // Check for truncation indicators
  if (jsonStr.includes('...') || jsonStr.includes('etc')) {
    return { valid: false, issue: 'Response contains truncation indicators' };
  }
  
  return { valid: true };
}

// Enhanced repairAndParse with validation
function parseAndValidate(jsonStr: string): ExtractedMeetingData {
  const validation = validateJsonCompleteness(jsonStr);
  if (!validation.valid) {
    console.warn(`⚠️ JSON completeness issue: ${validation.issue}`);
    throw new Error(`Incomplete JSON: ${validation.issue}`);
  }
  
  return repairAndParse(jsonStr);
}
```

**Update alle parsing locations om `parseAndValidate` te gebruiken:**
- Regel 404
- Regel 670
- Regel 812

---

### Wijziging 5: Response validatie met logging

**Nieuwe validatie na succesvolle parse** (in normalizedData secties):

```typescript
// Log extraction statistics for consistency monitoring
const itemCounts = {
  participants: normalizedData.participants.length,
  agenda_items: normalizedData.agenda_items.length,
  decisions: normalizedData.decisions.length,
  action_items: normalizedData.action_items.length,
};

console.log(`📊 [EXTRACTION-STATS] Items extracted: ` + 
  `participants=${itemCounts.participants}, ` +
  `agenda=${itemCounts.agenda_items}, ` +
  `decisions=${itemCounts.decisions}, ` +
  `actions=${itemCounts.action_items}`);

// Warn if suspiciously low item count (potential truncation)
const totalItems = Object.values(itemCounts).reduce((a, b) => a + b, 0);
if (totalItems < 5 && normalizedData.summary) {
  console.warn(`⚠️ [CONSISTENCY-WARNING] Low item count (${totalItems}) despite content presence. Possible truncation.`);
}
```

---

## Samenvatting Wijzigingen

| # | Bestand | Wijziging |
|---|---------|-----------|
| 1 | `ai-extract-meeting-minute/index.ts` | Voeg `max_tokens: 8192` toe aan 3 Gemini calls |
| 2 | `ai-extract-meeting-minute/index.ts` | Nieuwe `fetchAIWithRetry()` functie met 60s timeout, 3 retries |
| 3 | `ai-extract-meeting-minute/index.ts` | Update prompts met completeness instructies |
| 4 | `ai-extract-meeting-minute/index.ts` | Nieuwe `validateJsonCompleteness()` + `parseAndValidate()` functies |
| 5 | `ai-extract-meeting-minute/index.ts` | Response validatie logging voor monitoring |

---

## NIET Wijzigen

- ✅ Frontend componenten
- ✅ Database schema
- ✅ Bestaande extractie logica flow (alleen wrappen met retry)
- ✅ Andere edge functions

---

## Technische Details

### Retry Strategie
```text
Attempt 1: Immediate
Attempt 2: Wait 1s → Retry
Attempt 3: Wait 2s → Retry
Total max wait: 3s + 60s timeout = 63s per attempt, max 189s total
```

### Validation Flow
```text
1. AI Response received
   ↓
2. Sanitize content (remove markdown, prefixes)
   ↓
3. Extract JSON object
   ↓
4. validateJsonCompleteness() ← NEW
   ↓
5. repairAndParse() (trailing commas, BOM removal)
   ↓
6. Normalize to ExtractedMeetingData
   ↓
7. Log extraction stats ← NEW
   ↓
8. Return response
```

---

## Acceptatie Criteria

| # | Criterium | Implementatie |
|---|-----------|---------------|
| 1 | Upload zelfde PDF 10x → zelfde item count (±1) | `max_tokens` + completeness prompt |
| 2 | Geen JSON parse errors in console | `validateJsonCompleteness` + retry |
| 3 | Fallback niet geactiveerd bij normale PDFs | Retry absorbeert transient failures |
| 4 | Response binnen 90 seconden | 60s timeout × 3 retries = max 189s (met delays) |
| 5 | Retry mechanisme werkt | Logging per attempt + exponential backoff |
