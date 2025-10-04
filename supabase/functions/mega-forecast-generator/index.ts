import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (new Date() > CUTOFF_DATE) {
      console.log('⏰ Service stopped - cutoff date reached');
      return new Response(JSON.stringify({ 
        message: 'Free period ended',
        stopped_at: new Date().toISOString() 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Detect mode: authenticated vs autonomous
    const authHeader = req.headers.get('Authorization');
    let orgId: string;
    let userId: string;
    let supabase: any;

    if (authHeader) {
      // AUTHENTICATED MODE
      console.log('🔐 Running in authenticated mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Authentication failed');
      }
      userId = user.id;

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', userId)
        .single();

      if (!userOrg) throw new Error('User not in any organization');
      orgId = userOrg.org_id;
    } else {
      // AUTONOMOUS MODE
      console.log('🤖 Running in autonomous mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (!orgs || orgs.length === 0) {
        throw new Error('No organizations found');
      }

      orgId = orgs[0].id;
      userId = orgId;
    }

    // Token tracking
    const startTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokensUsed = 0;

    console.log(`🤖 Mega Forecast Generator for org: ${orgId}`);

    const { count: taskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);

    const currentTaskCount = taskCount || 0;
    const targetTaskCount = 600;
    const tasksToGenerate = Math.max(0, targetTaskCount - currentTaskCount);

    console.log(`📊 Current tasks: ${currentTaskCount}, Target: ${targetTaskCount}, Generating: ${tasksToGenerate}`);

    if (tasksToGenerate === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Target task count already reached',
        current_count: currentTaskCount,
        target_count: targetTaskCount
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, company')
      .eq('org_id', orgId)
      .limit(50);

    const systemPrompt = `Je bent een expert planner voor ABCzorg en CitoZorg, Nederlandse zorginstellingen.

CONTEXT:
- ABCzorg richt zich op thuiszorg, wijkverpleging, en persoonlijke verzorging
- CitoZorg is gespecialiseerd in acute zorg, spoedhulp, en intensive care
- Beide organisaties werken met VIGs, verzorgenden, verpleegkundigen en specialisten

TAAK CATEGORIEËN:
1. Cliënt intake & administratie
2. Planning & roostering 
3. Kwaliteitscontrole & audits
4. Werving & selectie professionals
5. Contractbeheer & facturatie
6. Opleidingen & trainingen
7. Incident management
8. Materiaal & middelen
9. Communicatie met stakeholders
10. Rapportage & evaluatie

GENEREER ${tasksToGenerate} realistische taken in JSON array formaat:
[
  {
    "title": "Korte, specifieke taakomschrijving",
    "description": "Gedetailleerde uitleg van wat er moet gebeuren",
    "category": "Een van bovenstaande categorieën",
    "priority": "low/medium/high",
    "client_id": "UUID van client of null",
    "estimated_hours": 1-8,
    "complexity": 1-5,
    "urgency": 1-5
  }
]

BELANGRIJK:
- Spreidt taken over alle categorieën
- Mix van urgent/regulier werk
- Realistische tijdsinschattingen
- Sommige taken zijn client-specifiek, andere algemeen
- Varieer in complexiteit (simpel tot expert-niveau)
- Genereer ONGEASSIGNEERDE forecast taken (voor autonome AI planning)`;

    const batchSize = 50;
    const batches = Math.ceil(tasksToGenerate / batchSize);
    let totalGenerated = 0;

    for (let batch = 0; batch < batches; batch++) {
      const tasksInBatch = Math.min(batchSize, tasksToGenerate - totalGenerated);
      
      console.log(`🔄 Generating batch ${batch + 1}/${batches} (${tasksInBatch} tasks)...`);

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt.replace(`${tasksToGenerate}`, `${tasksInBatch}`) },
            { 
              role: 'user', 
              content: `Genereer ${tasksInBatch} ongeassigneerde forecast taken voor autonome planning.\n\nBeschikbare clients: ${JSON.stringify(clients?.slice(0, 10) || [])}\n\nNOTE: Genereer taken ZONDER toewijzing aan specifieke professionals. De AI zal deze later autonoom plannen op basis van data-analyse.`
            }
          ],
          temperature: 0.9,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'Credits exhausted' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        throw new Error(`AI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      
      // Extract token usage
      if (aiResponse.usage) {
        totalInputTokens += aiResponse.usage.prompt_tokens || 0;
        totalOutputTokens += aiResponse.usage.completion_tokens || 0;
        totalTokensUsed += aiResponse.usage.total_tokens || 0;
      }
      
      const content = aiResponse.choices[0].message.content;

      let generatedTasks;
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found');
        generatedTasks = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Failed to parse AI response:', e);
        continue;
      }

      const tasksToInsert = generatedTasks.map((task: any) => ({
        org_id: orgId,
        title: task.title,
        description: task.description || '',
        status: 'todo',
        priority: (() => {
          const p = (task.priority || 'MEDIUM').toUpperCase();
          if (p === 'HIGH') return 'HIGH';
          if (p === 'LOW') return 'LOW';
          if (p === 'CRITICAL') return 'CRITICAL';
          return 'MEDIUM';
        })(),
        client_id: task.client_id || null,
        assignee_id: null,
        estimated_hours: task.estimated_hours || 2,
        category: task.category || 'Algemeen',
        is_forecast: true,
        forecast_metadata: {
          generated_at: new Date().toISOString(),
          complexity: task.complexity || 3,
          urgency: task.urgency || 3,
          batch: batch + 1
        }
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select();

      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        totalGenerated += inserted?.length || 0;
        console.log(`✅ Batch ${batch + 1} inserted: ${inserted?.length} tasks`);
      }

      if (batch < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Log function execution
    const endTime = Date.now();
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: userId,
      function_name: 'mega-forecast-generator',
      success: true,
      execution_time_ms: endTime - startTime,
      model_used: 'google/gemini-2.5-flash',
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalTokensUsed,
      estimated_cost_eur: 0
    });

    console.log(`🎉 Total generated: ${totalGenerated} forecast tasks`);

    return new Response(JSON.stringify({
      success: true,
      generated_tasks: totalGenerated,
      current_total: currentTaskCount + totalGenerated,
      target: targetTaskCount,
      batches_processed: batches
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in mega-forecast-generator:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
