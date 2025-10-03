import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
      return new Response(JSON.stringify({ stopped: true }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Support both authenticated and autonomous modes
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      authHeader ? Deno.env.get('SUPABASE_ANON_KEY') ?? '' : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );

    let orgId: string;
    let question: string;
    let context: string = '';

    if (authHeader) {
      // Authenticated mode
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthorized');

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      orgId = userOrg!.org_id;
      
      const body = await req.json();
      question = body.question;
      context = body.context || '';
      
      console.log('🔐 Authenticated mode');
    } else {
      // Autonomous mode - analyze all clients
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (!orgs || orgs.length === 0) {
        throw new Error('No organizations found');
      }

      orgId = orgs[0].id;
      question = 'Analyseer tariefstructuur en geef optimalisatie suggesties';
      console.log('🤖 Autonomous mode: analyzing tariffs');
    }

    console.log('💰 Tariff Analyzer processing request...');

    // Fetch tariff knowledge
    const { data: tariffKnowledge } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .in('category', ['tarieven', 'cao', 'wetgeving'])
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .limit(20);

    // Fetch client data for tariff comparison
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('org_id', orgId);

    const knowledgeContext = tariffKnowledge?.map(k => 
      `[${k.category}] ${k.key}: ${typeof k.value === 'string' ? k.value : JSON.stringify(k.value)}`
    ).join('\n\n') || '';

    const clientsContext = clients?.map(c => 
      `Client: ${c.name} (${c.company}) - €${c.revenue_per_hour || 'unknown'}/uur - ${c.weekly_hours || 'unknown'} uur/week - Tier ${c.tier}`
    ).join('\n') || '';

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Je bent een tariff analyzer expert gespecialiseerd in zorgtarieven, marges, en pricing optimalisatie.

Je taken:
- Analyseer tarieven en vergelijk met markt/concurrenten
- Bereken marges en winstgevendheid
- Detecteer afwijkende tarieven (te hoog/te laag)
- Geef pricing aanbevelingen
- Analyseer contractvoorwaarden

Geef altijd:
1. Concrete cijfers en berekeningen
2. Vergelijkingen (indien mogelijk)
3. Winstmarges en break-even analyses
4. Concrete aanbevelingen voor verbetering
5. Risico's bij huidige tarieven`
          },
          {
            role: 'user',
            content: `VRAAG: ${question}

CONTEXT: ${context || 'Geen extra context'}

TARIEF KENNIS:
${knowledgeContext}

CLIENT DATA:
${clientsContext}`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) throw new Error('Rate limit exceeded');
      if (aiResponse.status === 402) throw new Error('AI credits exhausted');
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0].message.content;

    return new Response(JSON.stringify({
      success: true,
      answer: answer,
      knowledge_used: tariffKnowledge?.length || 0,
      clients_analyzed: clients?.length || 0,
      expert_type: 'tariff',
      confidence: 0.85
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Tariff Analyzer error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});