import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Helper function to match a task to a professional
async function matchTaskToProfessional(
  supabase: any,
  orgId: string,
  taskRequirements: any,
  clientId: string | null,
  taskId: string
): Promise<boolean> {
  // Fetch professionals
  const { data: professionals } = await supabase
    .from('professionals')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'actief');

  if (!professionals || professionals.length === 0) {
    return false;
  }

  const professionalsContext = professionals.map((p: any) => ({
    id: p.id,
    name: p.full_name,
    functie_niveau: p.functie_niveau,
    skills: p.skills || [],
    regio: p.regio,
    rating: p.rating
  }));

  // Use AI to find best match
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
          content: `Find BEST professional match. Return JSON: {"professional_id": "uuid", "match_score": 0-100, "reasoning": "text"}`
        },
        {
          role: 'user',
          content: `Task: ${JSON.stringify(taskRequirements)}\n\nProfessionals: ${JSON.stringify(professionalsContext)}`
        }
      ],
      temperature: 0.1,
    }),
  });

  if (!aiResponse.ok) {
    return false;
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices[0].message.content;

  let match;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    match = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return false;
  }

  if (match && match.match_score >= 70) {
    // Assign task
    await supabase
      .from('tasks')
      .update({ assignee_id: match.professional_id })
      .eq('id', taskId);

    console.log(`✅ Matched task ${taskId} to ${match.professional_id} (score: ${match.match_score})`);
    return true;
  }

  return false;
}

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
    let taskRequirements: any;
    let clientId: string | null = null;

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
      taskRequirements = body.task_requirements;
      clientId = body.client_id;
      
      console.log('🔐 Authenticated mode');
    } else {
      // Autonomous mode - match unassigned forecast tasks
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (!orgs || orgs.length === 0) {
        throw new Error('No organizations found');
      }

      orgId = orgs[0].id;
      console.log('🤖 Autonomous mode: matching forecast tasks');
    }

    console.log('🎯 Professional Matcher finding best matches...');

    // In autonomous mode, get unassigned forecast tasks
    if (!authHeader) {
      const { data: forecastTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_forecast', true)
        .is('assignee_id', null)
        .limit(20);

      if (!forecastTasks || forecastTasks.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'No unassigned forecast tasks',
          tasks_matched: 0 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`📋 Found ${forecastTasks.length} unassigned forecast tasks`);
      
      // Process each task
      let matchedCount = 0;
      for (const task of forecastTasks) {
        taskRequirements = {
          title: task.title,
          category: task.category,
          priority: task.priority,
          estimated_hours: task.estimated_hours,
          complexity: task.complexity || 3
        };
        clientId = task.client_id;

        // Continue to matching logic below
        const matched = await matchTaskToProfessional(supabase, orgId, taskRequirements, clientId, task.id);
        if (matched) matchedCount++;
      }

      return new Response(JSON.stringify({
        success: true,
        forecast_tasks_processed: forecastTasks.length,
        tasks_matched: matchedCount
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all active professionals
    const { data: professionals } = await supabase
      .from('professionals')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'actief');

    // Fetch client info if provided
    let clientInfo = null;
    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
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
${JSON.stringify(taskRequirements, null, 2)}

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