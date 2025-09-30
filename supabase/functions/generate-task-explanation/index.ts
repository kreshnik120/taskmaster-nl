import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { task, scoreBreakdown } = await req.json();

    if (!task || !scoreBreakdown) {
      return new Response(
        JSON.stringify({ error: "Task en scoreBreakdown zijn vereist" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context about the task
    const taskContext = {
      title: task.title,
      priority: task.priority,
      dueDate: task.due_at,
      nextAction: task.next_action,
      organization: task.organizations?.name,
      assignee: task.profiles?.name,
      estimatedValue: task.task_scoring_metadata?.estimated_value_eur,
      businessImpact: task.task_scoring_metadata?.business_impact_score,
      complexity: task.task_scoring_metadata?.complexity_score,
    };

    // Determine if this is ABCzorg or CitoZorg context
    const isABCzorg = task.title?.toLowerCase().includes('abczorg') || 
                      task.description?.toLowerCase().includes('abczorg');
    const company = isABCzorg ? 'ABCzorg' : 'CitoZorg';

    // Check for transition-related keywords
    const transitionKeywords = ['abcito', 'uitzendkracht', 'uitzend', 'transitie', 'zzp', 'overgang', '1/1/2026', '2026'];
    const isTransitionRelated = transitionKeywords.some(keyword => 
      task.title?.toLowerCase().includes(keyword) || 
      task.description?.toLowerCase().includes(keyword)
    );

    // Calculate days to transition deadline
    const transitionDeadline = new Date('2026-01-01');
    const now = new Date();
    const daysToTransition = Math.ceil((transitionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const weeksToTransition = Math.ceil(daysToTransition / 7);

    const prompt = `Je bent een senior consultant bij ${company}, specialist in zorgbemiddeling. Je begrijpt de urgentie van de ZZP naar uitzendkracht transitie en de impact op de omzet.

KRITIEKE CONTEXT ${company}:
- Per 1/1/2026: ZZP-verbod in de zorg → VERPLICHTE overstap naar uitzendkrachten
- Huidige omzet: €28.000/week (4000 uur * €7/uur)
- Risico: 70% omzetdaling = €19.600/week VERLIES zonder actie
- ABCito-constructie = essentiële oplossing voor omzetbehoud en klanttevredenheid
- Nog ${daysToTransition} dagen (${weeksToTransition} weken) tot 1/1/2026 deadline

KLANTEN CitoZorg: Prisma (1000 uur/week), SIZA (1200 uur/week), SWZ (900 uur/week), Lunet (700 uur/week)
KLANTEN ABCzorg: 's Heerenloo, Leger des Heils, Amarant, Pro Persona, Pluryn, Dimence, IrisZorg, + 50 andere zorgorganisaties

Taak Details:
- Titel: ${taskContext.title}
- Prioriteit: ${taskContext.priority}
${taskContext.dueDate ? `- Deadline: ${new Date(taskContext.dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
${taskContext.nextAction ? `- Volgende actie: ${taskContext.nextAction}` : ''}
${taskContext.organization ? `- Klant: ${taskContext.organization}` : ''}
${taskContext.assignee ? `- Toegewezen aan: ${taskContext.assignee}` : ''}
${taskContext.estimatedValue ? `- Geschatte waarde: €${taskContext.estimatedValue}` : ''}

Score Breakdown:
${Object.entries(scoreBreakdown).map(([key, value]) => {
  const labels: Record<string, string> = {
    klant_impact: 'Klant Impact',
    omzet_bescherming: 'Omzet Bescherming',
    overgang_voorbereiding: 'Transitie Voorbereiding',
    compliance: 'Compliance',
    operationeel: 'Operationeel',
    money: 'Waarde/Impact',
    urgency: 'Urgentie',
    quality: 'Kwaliteit',
    business: 'Business Impact',
    growth: 'Groei'
  };
  return `- ${labels[key] || key}: ${Math.round((value as number) * 100)}%`;
}).join('\n')}

Geef een KORTE, DIRECTE uitleg (maximaal 2-3 zinnen) waarom deze taak nu prioriteit heeft:

1. Als het transitie-gerelateerd is (ABCito, uitzendkracht, ZZP): 
   - Benadruk de 1/1/2026 deadline urgentie
   - Link aan omzetbeschermingsrisico (€19.600/week)
   - Gebruik emoji's: ⚠️ 🗓️ 💰

2. Als het klant-specifiek is (Prisma, SIZA, SWZ, etc.):
   - Noem de klant bij naam
   - Kwantificeer de impact (uren/week, omzet)
   - Gebruik emoji's: 🏥 ⚡ 💼

3. Als het omzetbeschermend is:
   - Vermeld het concrete bedrag
   - Link aan klantbehoud
   - Gebruik emoji's: 💰 📈 🎯

Schrijfstijl: Direct, resultaatgericht, urgentie-gedreven, geen abstracte taal.

FOUT: "Deze taak is belangrijk omdat..."
GOED: "⚠️ Prisma heeft 25 uitzendkrachten nodig voor week 52. Zonder snelle actie loopt CitoZorg €3.500 omzet mis. ABCito-constructie moet vóór 1/1/2026 operationeel zijn."`;

    console.log("Calling Lovable AI with task:", task.title);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Je bent een ervaren Nederlandse business analyst die complexe prioriteiten helder kan uitleggen in begrijpelijke taal.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Te veel verzoeken. Probeer later opnieuw." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Onvoldoende credits. Voeg credits toe aan je workspace." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI Gateway fout: ${response.status}`);
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content;

    if (!explanation) {
      throw new Error('Geen uitleg ontvangen van AI');
    }

    console.log("Generated explanation for task:", task.title);

    return new Response(
      JSON.stringify({ explanation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-task-explanation:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Onbekende fout bij uitleg genereren'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
