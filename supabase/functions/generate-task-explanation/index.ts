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

    const prompt = `Je bent een Nederlandse business analyst die uitlegt waarom een taak belangrijk is. Analyseer de volgende taak en geef een korte, concrete uitleg (2-3 zinnen) waarom deze taak nu prioriteit heeft.

Taak Details:
- Titel: ${taskContext.title}
- Prioriteit: ${taskContext.priority}
${taskContext.dueDate ? `- Deadline: ${new Date(taskContext.dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
${taskContext.nextAction ? `- Volgende actie: ${taskContext.nextAction}` : ''}
${taskContext.organization ? `- Organisatie: ${taskContext.organization}` : ''}
${taskContext.assignee ? `- Toegewezen aan: ${taskContext.assignee}` : ''}

Score Breakdown:
- Waarde/Impact: ${Math.round(scoreBreakdown.money * 100)}%
- Urgentie: ${Math.round(scoreBreakdown.urgency * 100)}%
- Kwaliteit/Gereedheid: ${Math.round(scoreBreakdown.quality * 100)}%
- Business Impact: ${Math.round(scoreBreakdown.business * 100)}%
- Groeipotentie: ${Math.round(scoreBreakdown.growth * 100)}%

Geef een concrete, gerichte uitleg die ingaat op:
1. De belangrijkste reden waarom deze taak nu prioriteit heeft (kijk naar de hoogste score componenten)
2. Specifieke aspecten van deze taak (gebruik de titel, next_action, deadline)
3. Wat dit betekent voor de organisatie

Gebruik een directe, duidelijke schrijfstijl in het Nederlands. Begin NIET met "Deze taak" maar ga direct in op de kernreden. Gebruik relevante emoji's (🎯, ⚡, 💰, 📈) om de uitleg visueel aantrekkelijk te maken.

Voorbeeld formaat:
"🎯 [Concrete reden waarom urgent]. [Specifiek detail over deze taak]. [Impact voor organisatie]."`;

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
