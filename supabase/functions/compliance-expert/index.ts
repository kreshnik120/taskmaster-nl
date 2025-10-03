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
      return new Response(JSON.stringify({ stopped: true, reason: 'Free period ended' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!userOrg) throw new Error('No organization found');

    const { question, context } = await req.json();

    console.log('⚖️ Compliance Expert analyzing question...');

    // Fetch relevant compliance knowledge
    const { data: complianceKnowledge } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', userOrg.org_id)
      .in('category', ['compliance_unknown', 'cao_vereisten', 'zzp_vereisten'])
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .limit(20);

    const knowledgeContext = complianceKnowledge?.map(k => 
      `[${k.category}] ${k.key}: ${typeof k.value === 'string' ? k.value : JSON.stringify(k.value)}`
    ).join('\n\n') || '';

    // Call AI with specialized compliance prompt
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
            content: `Je bent een compliance expert gespecialiseerd in Nederlandse zorgwetgeving, CAO VVT, BIG-register, VOG vereisten, en ZZP regelgeving.

Je taken:
- Beantwoord vragen over compliance en wetgeving
- Controleer of professionals voldoen aan vereisten
- Geef duidelijke waarschuwingen bij non-compliance
- Verwijs naar specifieke CAO artikelen of wetsartikelen
- Geef praktische adviezen voor compliance

Geef altijd:
1. Direct antwoord op de vraag
2. Relevante wetgeving/CAO artikelen
3. Praktische stappen om compliant te zijn
4. Risico's bij non-compliance

Gebruik de kennisbank als primaire bron. Als informatie ontbreekt, geef dit duidelijk aan.`
          },
          {
            role: 'user',
            content: `VRAAG: ${question}

CONTEXT: ${context || 'Geen extra context'}

RELEVANTE COMPLIANCE KENNIS:
${knowledgeContext}`
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

    console.log('✅ Compliance analysis complete');

    return new Response(JSON.stringify({
      success: true,
      answer: answer,
      knowledge_used: complianceKnowledge?.length || 0,
      expert_type: 'compliance',
      confidence: 0.9
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Compliance Expert error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});