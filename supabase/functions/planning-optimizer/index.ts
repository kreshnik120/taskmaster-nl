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
    let dateRange: any = {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    let optimizationGoal = 'efficiency';

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
      dateRange = body.date_range || dateRange;
      optimizationGoal = body.optimization_goal || 'efficiency';
      
      console.log('🔐 Authenticated mode');
    } else {
      // Autonomous mode
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (!orgs || orgs.length === 0) {
        throw new Error('No organizations found');
      }

      orgId = orgs[0].id;
      console.log('🤖 Autonomous mode: optimizing planning');
    }

    console.log('📅 Planning Optimizer analyzing schedule...');

    // Fetch tasks in date range
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('org_id', orgId)
      .gte('start_at', dateRange.start)
      .lte('start_at', dateRange.end)
      .is('deleted_at', null);

    // Fetch professionals and their availability
    const { data: professionals } = await supabase
      .from('professionals')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'actief');

    const { data: availability } = await supabase
      .from('professional_availability')
      .select('*, professionals(*)')
      .in('professional_id', professionals?.map(p => p.id) || [])
      .gte('date', dateRange.start)
      .lte('date', dateRange.end);

    const tasksContext = tasks?.map(t => ({
      id: t.id,
      title: t.title,
      start_at: t.start_at,
      due_at: t.due_at,
      assignee_id: t.assignee_id,
      estimate_min: t.estimate_min,
      priority: t.priority,
      client_id: t.client_id
    })) || [];

    const professionalsContext = professionals?.map(p => ({
      id: p.id,
      name: p.full_name,
      functie_niveau: p.functie_niveau,
      regio: p.regio
    })) || [];

    const availabilityContext = availability?.map(a => ({
      professional_id: a.professional_id,
      professional_name: a.professionals?.full_name,
      date: a.date,
      shift: a.shift,
      is_available: a.is_available
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
            content: `Je bent een planning optimization expert die roosters analyseert en verbeteringen voorstelt.

Analyseer de planning en detecteer:
1. Conflicten (dubbele boekingen, overlappende taken)
2. Inefficiënties (te veel reistijd, suboptimale volgorde)
3. Overbelasting (professionals met te veel werk)
4. Onderbenutting (professionals met te weinig werk)
5. Optimalisatie mogelijkheden

Geef concrete suggesties met:
- Welke wijziging
- Waarom deze wijziging
- Verwacht voordeel (tijd/kosten besparing)
- Prioriteit (high/medium/low)

Output ALLEEN valid JSON object: {"conflicts": [...], "optimization_suggestions": [...], "efficiency_score": 0-100, "summary": "text"}`
          },
          {
            role: 'user',
            content: `OPTIMIZATION GOAL: ${optimizationGoal}

TASKS:
${JSON.stringify(tasksContext, null, 2)}

PROFESSIONALS:
${JSON.stringify(professionalsContext, null, 2)}

AVAILABILITY:
${JSON.stringify(availabilityContext, null, 2)}`
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

    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      analysis = {
        conflicts: [],
        optimization_suggestions: [],
        efficiency_score: 50,
        summary: 'Analysis failed'
      };
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: analysis,
      tasks_analyzed: tasks?.length || 0,
      professionals_analyzed: professionals?.length || 0,
      expert_type: 'planning-optimizer'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Planning Optimizer error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});