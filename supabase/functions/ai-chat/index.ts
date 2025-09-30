import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Authenticatie vereist' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract the access token from the Authorization header
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { 
        headers: { 
          Authorization: authHeader 
        } 
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Get user context with explicit access token
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Authenticatie gefaald' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!user) {
      console.error('No user found');
      return new Response(JSON.stringify({ error: 'Gebruiker niet gevonden' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // Fetch comprehensive context for AI
    const [
      tasksResult,
      profileResult,
      clientsResult,
      projectsResult,
      subtasksResult,
      commentsResult,
      timeEntriesResult,
      activeTimeResult,
      chatHistoryResult
    ] = await Promise.all([
      // Active tasks with full details
      supabase
        .from('tasks')
        .select('id, title, priority, due_at, start_at, next_action, description, estimate_min, completed_at, revenue_impact_eur, transition_related, client_id, assignee_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
      
      // User profile
      supabase
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single(),
      
      // Clients for business context
      supabase
        .from('clients')
        .select('id, name, company, tier, weekly_hours, revenue_per_hour')
        .limit(50),
      
      // Projects for project context
      supabase
        .from('projects')
        .select('id, name, description')
        .limit(50),
      
      // Subtasks for detailed task breakdown
      supabase
        .from('subtasks')
        .select('id, title, status, due_at, task_id')
        .eq('status', 'active')
        .limit(100),
      
      // Recent comments for conversation context
      supabase
        .from('comments')
        .select('body, created_at, task_id')
        .order('created_at', { ascending: false })
        .limit(50),
      
      // Time entries for workload insights
      supabase
        .from('time_entries')
        .select('duration_min, start, task_id')
        .gte('start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(200),
      
      // Check for active time tracking
      supabase
        .from('time_entries')
        .select('task_id, start')
        .is('end', null)
        .eq('user_id', user.id)
        .maybeSingle(),
      
      // Recent chat history for context continuity
      supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
    ]);

    const tasks = tasksResult.data;
    const profile = profileResult.data;
    const clients = clientsResult.data;
    const projects = projectsResult.data;
    const subtasks = subtasksResult.data;
    const recentComments = commentsResult.data;
    const timeEntries = timeEntriesResult.data;
    const activeTimeEntry = activeTimeResult.data;
    const chatHistory = chatHistoryResult.data;

    // Analyze patterns and build rich context
    const activeTasks = tasks?.filter(t => !t.completed_at) || [];
    const completedTasks = tasks?.filter(t => t.completed_at) || [];
    const overdueTasks = activeTasks.filter(t => t.due_at && new Date(t.due_at) < new Date());
    const highPriorityTasks = activeTasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL');
    const revenueImpactTasks = activeTasks.filter(t => t.revenue_impact_eur && t.revenue_impact_eur > 0);
    
    // Calculate workload metrics
    const totalTimeThisWeek = timeEntries?.reduce((sum, e) => sum + (e.duration_min || 0), 0) || 0;
    const avgTasksPerDay = activeTasks.length / 7;
    
    // Client insights
    const clientMap = new Map(clients?.map(c => [c.id, c]) || []);
    const tasksWithClients = activeTasks.filter(t => t.client_id);
    
    // Build comprehensive context summary
    const contextSummary = `
GEBRUIKER: ${profile?.name || 'Gebruiker'} (${profile?.email || ''})

HUIDIGE WERKSTATUS:
- Actieve taken: ${activeTasks.length}
- Afgeronde taken: ${completedTasks.length}
- Verlopen taken: ${overdueTasks.length}
- Hoge prioriteit: ${highPriorityTasks.length}
- Taken met revenue impact: ${revenueImpactTasks.length} (totaal: €${revenueImpactTasks.reduce((sum, t) => sum + (t.revenue_impact_eur || 0), 0).toFixed(2)})
${activeTimeEntry ? `- 🟢 BEZIG MET: Taak ${activeTimeEntry.task_id} (gestart ${new Date(activeTimeEntry.start).toLocaleTimeString('nl-NL')})` : ''}

WERKBELASTING DEZE WEEK:
- Totaal gewerkte uren: ${(totalTimeThisWeek / 60).toFixed(1)}h
- Gemiddeld aantal taken per dag: ${avgTasksPerDay.toFixed(1)}

CLIENTS: ${clients?.length || 0} actieve clients
${tasksWithClients.slice(0, 5).map(t => {
  const client = clientMap.get(t.client_id!);
  return client ? `- ${client.company}: ${t.title}` : '';
}).filter(Boolean).join('\n')}

PROJECTEN: ${projects?.length || 0} actieve projecten

TOP 10 PRIORITEITEN:
${activeTasks.slice(0, 10).map((t, i) => 
  `${i + 1}. [${t.priority}] ${t.title}${t.due_at ? ` (deadline: ${new Date(t.due_at).toLocaleDateString('nl-NL')})` : ''}${t.next_action ? `\n   → Next: ${t.next_action}` : ''}`
).join('\n')}

SUBTAKEN STATUS:
- Actieve subtaken: ${subtasks?.length || 0}

RECENTE ACTIVITEIT:
${recentComments?.slice(0, 5).map(c => `- ${c.body.substring(0, 80)}...`).join('\n') || '- Geen recente comments'}
`;

    // Get conversation history (reverse order for chronological display)
    const historyMessages = chatHistory ? [...chatHistory].reverse().slice(0, 10) : [];
    const conversationHistory = historyMessages.length > 0
      ? historyMessages.map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`).join('\n')
      : 'Eerste conversatie';

    const systemPrompt = `Je bent een geavanceerde AI-assistent voor TaskFlow, gespecialiseerd in taakbeheer en productiviteitsoptimalisatie.

JOUW CAPABILITIES:
✅ Volledig inzicht in gebruiker's taken, projecten, clients en werkpatronen
✅ Real-time context awareness (welke taak is actief, deadlines, prioriteiten)
✅ Intelligente suggesties gebaseerd op historie en patterns
✅ Proactieve workflow optimalisatie en planning
✅ Business impact analyse (revenue, client relationships)
✅ Tijdmanagement en workload balancering

JOUW GEDRAG:
- Spreek Nederlands en gebruik emoji's 🎯📊💡 waar passend
- Wees direct en actiegericht
- Geef concrete, uitvoerbare suggesties
- Verwijs naar specifieke taken met hun volledige context
- Waarschuw voor potentiële problemen (deadlines, overload)
- Leer van eerdere conversaties en pas je aan aan gebruiker
- Focus op business impact en prioriteit

HUIDIGE CONTEXT:
${contextSummary}

CONVERSATIE GESCHIEDENIS:
${conversationHistory}

Gebruik deze rijke context om intelligente, context-aware antwoorden te geven die echt helpen met productiviteit en taakbeheer.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Call Lovable AI Gateway for streaming
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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit bereikt, probeer het later opnieuw.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits op. Neem contact op met support.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI gateway fout' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('AI chat error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
