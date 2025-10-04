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

    // Detect mode: authenticated vs autonomous with graceful fallback
    const authHeader = req.headers.get('Authorization');
    const isRealUserAuth = authHeader && !authHeader.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3');
    
    let orgId: string;
    let userId: string;
    let supabase: any;
    let question: string;
    let context: string = '';

    if (isRealUserAuth) {
      // TRY authenticated mode with real user
      console.log('🔐 Attempting authenticated mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        // FALLBACK to autonomous mode
        console.log('❌ Auth failed, falling back to autonomous mode');
        supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
        orgId = orgs![0].id;
        userId = orgId;
        question = 'Analyseer tariefstructuur en geef optimalisatie suggesties';
      } else {
        userId = user.id;
        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!userOrg) {
          const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
          orgId = orgs![0].id;
        } else {
          orgId = userOrg.org_id;
        }
        
        const body = await req.json();
        question = body.question;
        context = body.context || '';
      }
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
      question = 'Analyseer tariefstructuur en geef optimalisatie suggesties';
      console.log('🤖 Autonomous mode: analyzing tariffs for org:', orgId);
    }

    // Token tracking
    const startTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokensUsed = 0;

    console.log('💰 Tariff Analyzer processing request...');

    // Fetch tariff knowledge with client context
    let tariffQuery = supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .in('category', ['tarieven', 'cao', 'wetgeving'])
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false });

    // If question mentions a specific client, filter for that client
    const clientKeywords = ['swz', 'prisma', 'lunet', 'evb', 'citozorg', 'abczorg'];
    const questionLower = question.toLowerCase();
    const mentionedClients = clientKeywords.filter(kw => questionLower.includes(kw));
    
    if (mentionedClients.length > 0) {
      // Get client ID
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', `%${mentionedClients[0]}%`)
        .single();
      
      if (client) {
        // Filter for client-specific OR general knowledge
        tariffQuery = tariffQuery.or(`client_id.eq.${client.id},client_id.is.null`);
      }
    }

    const { data: tariffKnowledge } = await tariffQuery.limit(20);

    // Fetch client data for tariff comparison
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('org_id', orgId);

    const knowledgeContext = tariffKnowledge?.map((k: any) => 
      `[${k.category}] ${k.key}: ${typeof k.value === 'string' ? k.value : JSON.stringify(k.value)}`
    ).join('\n\n') || '';

    const clientsContext = clients?.map((c: any) => 
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
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        console.error('⚠️ Rate limit exceeded');
        return new Response(JSON.stringify({ 
          error: 'Rate limits exceeded' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        console.error('💳 Credits exhausted');
        return new Response(JSON.stringify({ 
          error: 'Credits exhausted' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.error('❌ AI API error:', aiResponse.status);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    // Extract token usage
    if (aiData.usage) {
      totalInputTokens += aiData.usage.prompt_tokens || 0;
      totalOutputTokens += aiData.usage.completion_tokens || 0;
      totalTokensUsed += aiData.usage.total_tokens || 0;
    }
    
    const answer = aiData.choices[0].message.content;

    // Log function execution
    const endTime = Date.now();
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: userId,
      function_name: 'tariff-analyzer',
      success: true,
      execution_time_ms: endTime - startTime,
      model_used: 'google/gemini-2.5-flash',
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalTokensUsed,
      estimated_cost_eur: 0
    });

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