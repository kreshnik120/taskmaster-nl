import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/core.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface TaskInput {
  id: string;
  title: string;
  description?: string;
  priority: string;
  due_at: string | null;
  start_at: string | null;
  estimate_min: number | null;
  next_action: string | null;
  org_id: string;
  client_id?: string | null;
  revenue_impact_eur?: number | null;
  transition_related?: boolean | null;
  assignee_name?: string | null;
  client_name?: string | null;
}

interface AIScoreResult {
  task_id: string;
  priority_score: number;
  label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY";
  breakdown: {
    klant_impact: number;
    omzet_bescherming: number;
    overgang_voorbereiding: number;
    compliance: number;
    operationeel: number;
  };
  explanation: string;
  reasoning: string;
}

// ============ ROBUST JSON PARSING UTILITIES ============

/**
 * Strips common AI response prefixes and markdown formatting
 */
function sanitizeAIContent(content: string): string {
  let cleaned = content;
  
  // 1. Remove common AI prefixes
  const prefixPatterns = [
    /^(Hier is|Here's|Here is|Sure!|Certainly!|Of course!)[^\n{]*\n*/gi,
    /^(Het resultaat|The result)[^\n{]*\n*/gi,
    /^(Analyseren|Analyzing|Processing)[^\n{]*\n*/gi,
    /^(Based on|Op basis van)[^\n{]*\n*/gi,
  ];
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // 2. Remove markdown code blocks (multiple variants)
  cleaned = cleaned
    .replace(/```json\s*/gi, '')
    .replace(/```typescript\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`/g, '');
  
  // 3. Remove control characters except newlines and spaces
  cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');
  
  return cleaned.trim();
}

/**
 * Attempts multiple regex patterns to extract JSON
 */
function extractJsonObject(content: string): string | null {
  // Pattern 1: Full object with tasks array
  const fullObjectMatch = content.match(/\{\s*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (fullObjectMatch) return fullObjectMatch[0];
  
  // Pattern 2: Any JSON object (greedy but balanced)
  const simpleObjectMatch = content.match(/\{[\s\S]*\}/);
  if (simpleObjectMatch) return simpleObjectMatch[0];
  
  // Pattern 3: JSON array directly - wrap it
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) return `{"tasks": ${arrayMatch[0]}}`;
  
  return null;
}

/**
 * Repairs common JSON issues and parses
 */
function repairAndParse(jsonStr: string): any {
  let repaired = jsonStr;
  
  // 1. Fix trailing commas in arrays and objects
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  
  // 2. Remove BOM and zero-width characters
  repaired = repaired.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');
  
  // 3. Normalize whitespace in strings (but preserve structure)
  repaired = repaired.replace(/\r\n/g, '\n');
  
  return JSON.parse(repaired);
}

/**
 * Generates fallback score based on task heuristics
 */
function generateFallbackScore(task: TaskInput): AIScoreResult {
  let baseScore = 50; // NORMAL default
  
  // Deadline-based boost
  if (task.due_at) {
    const daysUntilDue = Math.ceil(
      (new Date(task.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilDue <= 0) baseScore += 30; // Overdue
    else if (daysUntilDue <= 3) baseScore += 20;
    else if (daysUntilDue <= 7) baseScore += 10;
  }
  
  // Priority-based adjustment
  if (task.priority === 'high') baseScore += 15;
  else if (task.priority === 'low') baseScore -= 10;
  
  // Transition-related boost
  if (task.transition_related) baseScore += 20;
  
  // Revenue impact boost
  if (task.revenue_impact_eur && task.revenue_impact_eur > 5000) baseScore += 15;
  
  // Cap score
  baseScore = Math.min(100, Math.max(0, baseScore));
  
  const label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY" = 
    baseScore >= 75 ? 'CRITICAL' 
    : baseScore >= 31 ? 'NORMAL' 
    : 'LOW_PRIORITY';
  
  return {
    task_id: task.id,
    priority_score: baseScore,
    label,
    breakdown: {
      klant_impact: 50,
      omzet_bescherming: task.revenue_impact_eur ? 70 : 50,
      overgang_voorbereiding: task.transition_related ? 80 : 40,
      compliance: 50,
      operationeel: 50,
    },
    explanation: '⚠️ Score berekend met fallback methode (AI parsing mislukt)',
    reasoning: 'Heuristische score op basis van deadline, prioriteit en omzet impact',
  };
}

/**
 * Main parsing function with multi-layer extraction and fallback
 */
function parseAIResponse(
  content: string, 
  batch: TaskInput[]
): { tasks: AIScoreResult[]; usedFallback: boolean } {
  
  console.log('[AI-SCORER] 🔍 Parsing AI response...');
  console.log('[AI-SCORER] Raw content length:', content.length);
  
  // Layer 2: Sanitize
  const sanitized = sanitizeAIContent(content);
  console.log('[AI-SCORER] Sanitized preview:', sanitized.slice(0, 200));
  
  // Layer 3: Extract JSON
  const jsonStr = extractJsonObject(sanitized);
  
  if (!jsonStr) {
    console.warn('[AI-SCORER] ⚠️ No JSON found in response, using fallback scores');
    console.error('[AI-SCORER] Raw content:', content.slice(0, 500));
    return {
      tasks: batch.map(generateFallbackScore),
      usedFallback: true,
    };
  }
  
  // Layer 4: Repair and parse
  try {
    const parsed = repairAndParse(jsonStr);
    
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      console.log(`[AI-SCORER] ✅ Parsed ${parsed.tasks.length} tasks from AI`);
      return { tasks: parsed.tasks, usedFallback: false };
    }
    
    if (Array.isArray(parsed)) {
      console.log(`[AI-SCORER] ✅ Parsed ${parsed.length} tasks from array`);
      return { tasks: parsed, usedFallback: false };
    }
    
    console.warn('[AI-SCORER] ⚠️ Unexpected JSON structure, using fallback');
    console.error('[AI-SCORER] Parsed structure:', JSON.stringify(parsed).slice(0, 300));
    return { tasks: batch.map(generateFallbackScore), usedFallback: true };
    
  } catch (parseError) {
    console.error('[AI-SCORER] ❌ JSON parse error:', parseError);
    console.error('[AI-SCORER] Failed JSON (first 500):', jsonStr.slice(0, 500));
    
    // Return fallback scores instead of throwing
    return {
      tasks: batch.map(generateFallbackScore),
      usedFallback: true,
    };
  }
}

// ============ END ROBUST JSON PARSING UTILITIES ============

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { tasks } = await req.json() as { tasks: TaskInput[] };

    if (!tasks || tasks.length === 0) {
      return errorResponse('Geen taken opgegeven', 400);
    }

    console.log(`[AI-SCORER] ⚡ START: Analyseren van ${tasks.length} taken`);
    const startTime = Date.now();

    // Build context for AI
    const now = new Date();
    const transitionDeadline = new Date('2026-01-01');
    const daysToTransition = Math.ceil((transitionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const systemPrompt = `Je bent een expert AI-assistent voor CitoZorg/ABCzorg takenbeheer. Je begrijpt de zorgsector, zorgbemiddeling, en de urgentie van de ZZP naar uitzendkracht transitie.

KRITIEKE CONTEXT:
- Datum vandaag: ${now.toLocaleDateString('nl-NL')}
- Transitie deadline: 1/1/2026 (nog ${daysToTransition} dagen)
- ZZP-verbod in de zorg → VERPLICHTE overstap naar uitzendkrachten
- Huidige omzet CitoZorg: €28.000/week (4000 uur * €7/uur)
- Risico: 70% omzetdaling = €19.600/week VERLIES zonder actie
- ABCito-constructie = essentiële oplossing

KLANTEN CitoZorg: Prisma (1000 uur/week), SIZA (1200 uur/week), SWZ (900 uur/week), Lunet (700 uur/week)
KLANTEN ABCzorg: 's Heerenloo, Leger des Heils, Amarant, Pro Persona, Pluryn, Dimence, IrisZorg

Je taak is om taken te beoordelen op:
1. **Klant Impact** (0-100): Impact op klantrelatie en -tevredenheid
2. **Omzet Bescherming** (0-100): Direct omzetbehoud of -groei
3. **Overgang Voorbereiding** (0-100): Voorbereiding op 1/1/2026 transitie
4. **Compliance** (0-100): Naleving wettelijke eisen en kwaliteitsstandaarden
5. **Operationeel** (0-100): Dagelijkse bedrijfsvoering efficiëntie

Geef voor elke taak:
- Overall score (0-100)
- Label (CRITICAL, NORMAL, LOW_PRIORITY)
- Breakdown scores per categorie
- Korte uitleg (2-3 zinnen) met emoji's`;

    const results: AIScoreResult[] = [];

    // Process tasks in batches of 5 to avoid token limits
    const batchSize = 5;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      
      const taskDescriptions = batch.map((task, idx) => {
        const daysToDue = task.due_at 
          ? Math.ceil((new Date(task.due_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        return `
TAAK ${idx + 1}:
ID: ${task.id}
Titel: ${task.title}
${task.description ? `Beschrijving: ${task.description}` : ''}
Prioriteit: ${task.priority}
${task.due_at ? `Deadline: ${new Date(task.due_at).toLocaleDateString('nl-NL')} (${daysToDue} dagen)` : 'Geen deadline'}
${task.next_action ? `Volgende actie: ${task.next_action}` : ''}
${task.client_name ? `Klant: ${task.client_name}` : ''}
${task.assignee_name ? `Toegewezen aan: ${task.assignee_name}` : ''}
${task.revenue_impact_eur ? `Omzet impact: €${task.revenue_impact_eur}` : ''}
${task.estimate_min ? `Geschatte tijd: ${task.estimate_min} minuten` : ''}
Transitie-gerelateerd: ${task.transition_related ? 'Ja' : 'Nee'}
`;
      }).join('\n---\n');

      const prompt = `${taskDescriptions}

Analyseer deze ${batch.length} taken en geef voor elke taak een beoordeling in dit EXACTE JSON formaat:

{
  "tasks": [
    {
      "task_id": "UUID van taak",
      "priority_score": 85,
      "label": "CRITICAL",
      "breakdown": {
        "klant_impact": 90,
        "omzet_bescherming": 85,
        "overgang_voorbereiding": 95,
        "compliance": 70,
        "operationeel": 60
      },
      "explanation": "⚠️ Kritieke taak voor CitoZorg omzetbehoud. ABCito-constructie moet operationeel zijn vóór 1/1/2026. Zonder actie risico van €19.600/week verlies. 🗓️💰",
      "reasoning": "Hoge score door: transitie-urgentie (95), directe omzet impact (85), en klant-kritiek (90)"
    }
  ]
}

Richtlijnen:
- Priority score: 0-30=LOW_PRIORITY, 31-74=NORMAL, 75+=CRITICAL
- Transitie-gerelateerde taken krijgen minimaal 75+ score
- Taken met deadlines < 7 dagen krijgen +15 punten
- Taken met hoge omzet impact (>€5000) krijgen +20 punten
- Kritieke klanten (Prisma, SIZA) krijgen +15 punten
- Gebruik emoji's in uitleg: ⚠️🗓️💰🏥⚡💼📈🎯
- Wees specifiek en concreet, geen vage taal

Geef ALLEEN het JSON object terug, geen andere tekst.`;

      console.log(`[AI-SCORER] Batch ${Math.floor(i / batchSize) + 1}: Analyseren ${batch.length} taken`);

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AI-SCORER] ❌ AI Gateway error: ${response.status}`, errorText);
        
        if (response.status === 429) {
          throw new Error("429: Te veel verzoeken. Wacht 1 minuut en probeer opnieuw.");
        }
        
        if (response.status === 402) {
          throw new Error("402: Onvoldoende credits. Voeg credits toe aan je workspace.");
        }

        throw new Error(`AI Gateway fout: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        // No content - use fallback scores for this batch
        console.warn('[AI-SCORER] ⚠️ Geen content van AI, fallback scores gebruiken');
        const fallbackScores = batch.map(generateFallbackScore);
        results.push(...fallbackScores);
      } else {
        // Use robust parsing with fallback
        const { tasks: batchResults, usedFallback } = parseAIResponse(content, batch);
        
        if (usedFallback) {
          console.warn(`[AI-SCORER] ⚠️ Batch ${Math.floor(i / batchSize) + 1}: Fallback scores gebruikt`);
        }
        
        results.push(...batchResults);
        console.log(`[AI-SCORER] Batch verwerkt: ${batchResults.length} taken ${usedFallback ? '(fallback)' : '(AI)'}`);
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Sort by priority score and assign ranks
    results.sort((a, b) => b.priority_score - a.priority_score);
    results.forEach((r, i) => {
      (r as any).rank = i + 1;
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[AI-SCORER] ✅ KLAAR: ${results.length} taken geanalyseerd in ${duration}s`);

    const fallbackUsed = results.some(r => r.explanation?.includes('fallback'));
    
    return jsonResponse({
      generated_at: new Date().toISOString(),
      results,
      model: 'google/gemini-2.5-flash',
      method: 'AI-driven scoring',
      fallback_used: fallbackUsed,
    });

  } catch (error) {
    console.error('[AI-SCORER] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Onbekende fout bij AI-scoring',
      500
    );
  }
});
