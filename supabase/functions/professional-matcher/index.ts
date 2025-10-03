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

    const { task_requirements, client_id } = await req.json();

    console.log('🎯 Professional Matcher finding best matches...');

    // Fetch all active professionals
    const { data: professionals } = await supabase
      .from('professionals')
      .select('*')
      .eq('org_id', userOrg!.org_id)
      .eq('status', 'actief');

    // Fetch client info if provided
    let clientInfo = null;
    if (client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();
      clientInfo = client;
    }

    const professionalsContext = professionals?.map(p => ({
      id: p.id,
      name: p.full_name,
      functie_niveau: p.functie_niveau,
      skills: p.skills || [],
      regio: p.regio,
      werkvorm: p.werkvorm,
      gewenst_uurloon: p.gewenst_uurloon,
      rating: p.rating,
      heeft_auto: p.heeft_auto,
      heeft_rijbewijs: p.heeft_rijbewijs,
      big_nummer: p.big_nummer,
      cao_akkoord: p.cao_akkoord
    })) || [];

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
            content: `Je bent een professional matching expert die ZZP'ers matcht aan opdrachten.

Analyseer de opdracht requirements en match met de beste professionals.

Geef per professional:
1. Match score (0-100%)
2. Waarom deze match goed/slecht is
3. Belangrijke aandachtspunten
4. Eventuele dealbreakers

Sorteer op match score (hoogste eerst).
Output ALLEEN valid JSON array met: [{"professional_id": "uuid", "match_score": 0-100, "reasoning": "text", "strengths": ["..."], "concerns": ["..."], "dealbreakers": ["..."]}]`
          },
          {
            role: 'user',
            content: `OPDRACHT REQUIREMENTS:
${JSON.stringify(task_requirements, null, 2)}

CLIENT INFO:
${clientInfo ? JSON.stringify(clientInfo, null, 2) : 'Geen client info'}

BESCHIKBARE PROFESSIONALS:
${JSON.stringify(professionalsContext, null, 2)}`
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) throw new Error('Rate limit exceeded');
      if (aiResponse.status === 402) throw new Error('AI credits exhausted');
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;

    let matches = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      matches = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      matches = [];
    }

    // Enrich matches with professional data
    const enrichedMatches = matches.map((match: any) => {
      const professional = professionals?.find(p => p.id === match.professional_id);
      return {
        ...match,
        professional: professional
      };
    });

    return new Response(JSON.stringify({
      success: true,
      matches: enrichedMatches,
      total_professionals_analyzed: professionals?.length || 0,
      expert_type: 'professional-matcher'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Professional Matcher error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});