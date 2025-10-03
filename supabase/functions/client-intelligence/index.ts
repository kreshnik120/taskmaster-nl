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
      return new Response(JSON.stringify({ 
        message: 'Free period ended' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const orgId = '550e8400-e29b-41d4-a716-446655440000';
    console.log(`🏢 Client Intelligence Deep Dive for org: ${orgId}`);

    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('org_id', orgId)
      .limit(100);

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No clients found',
        knowledge_added: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Analyzing ${clients.length} clients...`);

    const { data: tasksPerClient } = await supabase
      .from('tasks')
      .select('client_id, status, priority, estimated_hours')
      .eq('org_id', orgId)
      .not('client_id', 'is', null);

    const systemPrompt = `Je bent een business intelligence analist voor ABCzorg en CitoZorg.

TAAK: Analyseer client data en genereer strategische inzichten voor optimale planning en resource allocatie.

Voor elke client, analyseer:
1. Zorgbehoeften en complexiteit
2. Volumepatronen (uren per week/maand)
3. Vereiste functieniveaus en specialisaties
4. Tariefstructuur en winstgevendheid
5. Planningscomplexiteit en voorkeuren
6. Risicofactoren en kwaliteitseisen
7. Groeipotenties en contractverlenging
8. Seizoenspatronen en voorspelbaarheid

OUTPUT FORMAT (JSON array):
[
  {
    "category": "client_intelligence",
    "key": "client_[id]_[aspect]",
    "value": { 
      "insight": "detailed analysis",
      "impact": "business impact",
      "action": "recommended actions"
    },
    "confidence_score": 0.75-0.95,
    "source": "client_analysis"
  }
]

Genereer 20-40 knowledge items per client.`;

    const knowledgeItems: any[] = [];
    
    for (const client of clients) {
      const clientTasks = tasksPerClient?.filter(t => t.client_id === client.id) || [];
      
      console.log(`🔍 Analyzing: ${client.name} (${clientTasks.length} tasks)`);

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
            { 
              role: 'user', 
              content: `Analyseer deze client:\n\nClient: ${JSON.stringify(client, null, 2)}\n\nTaken (${clientTasks.length}):\n${JSON.stringify(clientTasks.slice(0, 20), null, 2)}`
            }
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        console.error(`AI API error for ${client.name}:`, response.status);
        continue;
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices[0].message.content;

      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const items = JSON.parse(jsonMatch[0]);
          knowledgeItems.push(...items.map((item: any) => ({
            ...item,
            org_id: orgId,
            user_id: orgId,
            client_id: client.id
          })));
        }
      } catch (e) {
        console.error('Failed to parse AI response:', e);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`📚 Total knowledge items extracted: ${knowledgeItems.length}`);

    let insertedCount = 0;
    for (let i = 0; i < knowledgeItems.length; i += 100) {
      const batch = knowledgeItems.slice(i, i + 100);
      
      const { data: inserted, error } = await supabase
        .from('ai_knowledge_base')
        .upsert(batch, { 
          onConflict: 'org_id,category,key',
          ignoreDuplicates: false 
        })
        .select();

      if (!error && inserted) {
        insertedCount += inserted.length;
      }
    }

    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: orgId,
      function_name: 'client-intelligence',
      success: true,
      execution_time_ms: Date.now(),
      model_used: 'google/gemini-2.5-flash',
      estimated_cost_eur: 0,
    });

    console.log(`✅ Stored ${insertedCount} client intelligence items`);

    return new Response(JSON.stringify({
      success: true,
      clients_analyzed: clients.length,
      knowledge_items_generated: knowledgeItems.length,
      knowledge_items_stored: insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in client-intelligence:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
