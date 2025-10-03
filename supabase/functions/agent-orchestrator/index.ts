import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (new Date() > CUTOFF_DATE) {
      return new Response(JSON.stringify({ stopped: true, reason: 'Free period ended' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { question, context } = await req.json();

    console.log('🎭 Agent Orchestrator routing question to specialist agents...');

    // Step 1: Determine which agents to involve
    const routingResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Je bent een intelligent routing systeem dat vragen analyseert en bepaalt welke specialist agents nodig zijn.

Beschikbare agents:
1. compliance-expert: CAO, wetgeving, BIG-register, VOG, compliance vragen
2. tariff-analyzer: Tarieven, marges, pricing, winstgevendheid
3. professional-matcher: CV matching, skills analysis, professional selectie
4. planning-optimizer: Roosters, planning, conflicten, efficiency

Analyseer de vraag en output ALLEEN valid JSON:
{"agents_needed": ["agent1", "agent2"], "reasoning": "waarom deze agents", "priority_order": ["agent1", "agent2"]}`
          },
          {
            role: 'user',
            content: `Welke specialist agents zijn nodig voor deze vraag?\n\nVRAAG: ${question}\nCONTEXT: ${context || 'none'}`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!routingResponse.ok) {
      throw new Error('Routing failed');
    }

    const routingData = await routingResponse.json();
    const routingContent = routingData.choices[0].message.content;

    let routing;
    try {
      const jsonMatch = routingContent.match(/\{[\s\S]*\}/);
      routing = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(routingContent);
    } catch {
      // Fallback: use general AI chat
      routing = { agents_needed: [], priority_order: [] };
    }

    console.log(`📍 Routing to agents: ${routing.agents_needed.join(', ')}`);

    // Step 2: Call each specialist agent in parallel
    const agentCalls = routing.agents_needed.map(async (agentName: string) => {
      try {
        const agentResponse = await supabase.functions.invoke(agentName, {
          body: { question, context }
        });

        if (agentResponse.error) {
          console.error(`Agent ${agentName} error:`, agentResponse.error);
          return { agent: agentName, success: false, error: agentResponse.error };
        }

        return { agent: agentName, success: true, data: agentResponse.data };
      } catch (err) {
        console.error(`Failed to call agent ${agentName}:`, err);
        return { agent: agentName, success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    const agentResults = await Promise.all(agentCalls);

    console.log(`✅ Received responses from ${agentResults.filter(r => r.success).length}/${agentResults.length} agents`);

    // Step 3: If no agents were needed or all failed, use general AI
    let finalAnswer = '';
    let usedAgents = [];

    if (agentResults.length === 0 || agentResults.every(r => !r.success)) {
      console.log('🤖 No specialist agents available, using general AI...');
      
      const generalResponse = await supabase.functions.invoke('ai-chat', {
        body: { message: question }
      });

      if (generalResponse.error) {
        throw new Error('General AI also failed');
      }

      finalAnswer = generalResponse.data.response;
    } else {
      // Step 4: Combine agent responses
      const successfulResults = agentResults.filter(r => r.success);
      
      const combinedContext = successfulResults.map(r => 
        `[${r.agent.toUpperCase()}]:\n${r.data.answer || JSON.stringify(r.data)}`
      ).join('\n\n---\n\n');

      const synthesisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: `Je bent een synthesis agent die antwoorden van meerdere specialisten combineert tot één coherent antwoord.

Combineer de antwoorden van de specialisten tot een compleet, helder antwoord voor de gebruiker.
- Vermijd herhaling
- Integreer alle relevante inzichten
- Geef een structured antwoord
- Zorg dat het natuurlijk leest`
            },
            {
              role: 'user',
              content: `ORIGINELE VRAAG: ${question}

ANTWOORDEN VAN SPECIALISTEN:
${combinedContext}

Combineer deze tot één helder antwoord:`
            }
          ],
          temperature: 0.3,
        }),
      });

      const synthesisData = await synthesisResponse.json();
      finalAnswer = synthesisData.choices[0].message.content;
      usedAgents = successfulResults.map(r => r.agent);
    }

    return new Response(JSON.stringify({
      success: true,
      answer: finalAnswer,
      agents_consulted: usedAgents,
      routing_reasoning: routing.reasoning,
      orchestration_type: 'multi-agent'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Agent Orchestrator error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});