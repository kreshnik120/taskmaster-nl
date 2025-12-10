import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
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
        throw new Error('Geen response van AI ontvangen');
      }

      // Parse JSON from AI response
      let parsedResults;
      try {
        // Try to extract JSON if wrapped in markdown code blocks
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        parsedResults = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('[AI-SCORER] JSON parse error:', parseError);
        console.error('[AI-SCORER] Raw content:', content);
        throw new Error('Kon AI response niet parsen als JSON');
      }

      if (parsedResults.tasks) {
        results.push(...parsedResults.tasks);
        console.log(`[AI-SCORER] Batch verwerkt: ${parsedResults.tasks.length} taken geanalyseerd`);
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

    return jsonResponse({
      generated_at: new Date().toISOString(),
      results,
      model: 'google/gemini-2.5-flash',
      method: 'AI-driven scoring'
    });

  } catch (error) {
    console.error('[AI-SCORER] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Onbekende fout bij AI-scoring',
      500
    );
  }
});
