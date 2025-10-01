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

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
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
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);
    
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

    // Get user's org_id
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    const userOrgId = userOrg?.org_id;

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
      chatHistoryResult,
      deletedTasksResult,
      knowledgeBaseResult,
      learningEventsResult,
      businessIntelResult,
      conversationContextResult
    ] = await Promise.all([
      // Active tasks with full details
      supabaseClient
        .from('tasks')
        .select('id, title, priority, due_at, start_at, next_action, description, estimate_min, completed_at, revenue_impact_eur, transition_related, client_id, assignee_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
      
      // User profile
      supabaseClient
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single(),
      
      // Clients for business context
      supabaseClient
        .from('clients')
        .select('id, name, company, tier, weekly_hours, revenue_per_hour')
        .limit(50),
      
      // Projects for project context
      supabaseClient
        .from('projects')
        .select('id, name, description')
        .limit(50),
      
      // Subtasks for detailed task breakdown
      supabaseClient
        .from('subtasks')
        .select('id, title, status, due_at, task_id')
        .eq('status', 'active')
        .limit(100),
      
      // Recent comments for conversation context
      supabaseClient
        .from('comments')
        .select('body, created_at, task_id')
        .order('created_at', { ascending: false })
        .limit(50),
      
      // Time entries for workload insights
      supabaseClient
        .from('time_entries')
        .select('duration_min, start, task_id')
        .gte('start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(200),
      
      // Check for active time tracking
      supabaseClient
        .from('time_entries')
        .select('task_id, start')
        .is('end', null)
        .eq('user_id', user.id)
        .maybeSingle(),
      
      // Recent chat history for context continuity
      supabaseClient
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      
      // Count deleted tasks for context awareness
      supabaseClient
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null),
      
      // AI Knowledge Base - permanente kennis
      supabaseClient
        .from('ai_knowledge_base')
        .select('*')
        .eq('user_id', user.id)
        .order('confidence_score', { ascending: false })
        .order('usage_count', { ascending: false })
        .limit(100),
      
      // Recent Learning Events - leer van recente interacties
      supabaseClient
        .from('ai_learning_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      
      // Business Intelligence - bedrijfsinzichten
      supabaseClient
        .from('business_intelligence')
        .select('*')
        .eq('org_id', userOrg.org_id)
        .eq('status', 'active')
        .order('impact_score', { ascending: false })
        .limit(20),
      
      // Conversation Context - eerdere conversaties
      supabaseClient
        .from('conversation_context')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
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
    const deletedTasksCount = deletedTasksResult.count || 0;
    const knowledgeBase = knowledgeBaseResult.data || [];
    const learningEvents = learningEventsResult.data || [];
    const businessIntel = businessIntelResult.data || [];
    const conversationContext = conversationContextResult.data || [];

    // Analyze patterns and build rich context
    const activeTasks = tasks?.filter(t => !t.completed_at) || [];
    const completedTasks = tasks?.filter(t => t.completed_at) || [];
    const overdueTasks = activeTasks.filter(t => t.due_at && new Date(t.due_at) < new Date());
    const highPriorityTasks = activeTasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL');
    const revenueImpactTasks = activeTasks.filter(t => t.revenue_impact_eur && t.revenue_impact_eur > 0);
    
    // Analyze knowledge base for user preferences and patterns
    const userPreferences = knowledgeBase.filter((kb: any) => kb.category === 'user_preference');
    const businessRules = knowledgeBase.filter((kb: any) => kb.category === 'business_rule');
    const workflowPatterns = knowledgeBase.filter((kb: any) => kb.category === 'workflow_pattern');
    const decisionContexts = knowledgeBase.filter((kb: any) => kb.category === 'decision_context');
    
    // Analyze learning events for patterns
    const successfulPatterns = learningEvents.filter((le: any) => le.outcome === 'success' && le.learning_score > 0.7);
    const rejectedSuggestions = learningEvents.filter((le: any) => le.event_type === 'suggestion_rejected');
    const acceptedSuggestions = learningEvents.filter((le: any) => le.event_type === 'suggestion_accepted');
    
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
- Verwijderde taken: ${deletedTasksCount}
- Verlopen taken: ${overdueTasks.length}
- Hoge prioriteit: ${highPriorityTasks.length}
- Taken met revenue impact: ${revenueImpactTasks.length} (totaal: €${revenueImpactTasks.reduce((sum, t) => sum + (t.revenue_impact_eur || 0), 0).toFixed(2)})
${activeTimeEntry ? `- 🟢 BEZIG MET: Taak ${activeTimeEntry.task_id} (gestart ${new Date(activeTimeEntry.start).toLocaleTimeString('nl-NL')})` : ''}
${activeTasks.length === 0 ? '\n⚠️ BELANGRIJK: De takenlijst is momenteel LEEG! Er zijn geen actieve taken.' : ''}
${activeTasks.length > 0 && activeTasks.length <= 3 && deletedTasksCount > 10 ? `\n⚠️ LET OP: Er zijn slechts ${activeTasks.length} actieve taken, maar ${deletedTasksCount} taken zijn verwijderd.` : ''}

AI GEHEUGEN & KENNIS BASE (${knowledgeBase.length} items):
${userPreferences.length > 0 ? `\n📌 GEBRUIKER VOORKEUREN (${userPreferences.length}):\n${userPreferences.slice(0, 5).map((kb: any) => `  - ${kb.key}: ${JSON.stringify(kb.value)} (confidence: ${kb.confidence_score}, gebruikt: ${kb.usage_count}x)`).join('\n')}` : ''}
${businessRules.length > 0 ? `\n📋 BEDRIJFSREGELS (${businessRules.length}):\n${businessRules.slice(0, 5).map((kb: any) => `  - ${kb.key}: ${JSON.stringify(kb.value)}`).join('\n')}` : ''}
${workflowPatterns.length > 0 ? `\n🔄 WORKFLOW PATRONEN (${workflowPatterns.length}):\n${workflowPatterns.slice(0, 5).map((kb: any) => `  - ${kb.key}: ${JSON.stringify(kb.value)}`).join('\n')}` : ''}
${decisionContexts.length > 0 ? `\n💡 BESLISSING CONTEXTEN (${decisionContexts.length}):\n${decisionContexts.slice(0, 3).map((kb: any) => `  - ${kb.key}: ${JSON.stringify(kb.value)}`).join('\n')}` : ''}

LEER GESCHIEDENIS (${learningEvents.length} events):
${successfulPatterns.length > 0 ? `\n✅ SUCCESVOLLE PATRONEN (${successfulPatterns.length}):\n${successfulPatterns.slice(0, 3).map((le: any) => `  - ${le.event_type}: ${JSON.stringify(le.context).substring(0, 100)}...`).join('\n')}` : ''}
${acceptedSuggestions.length > 0 ? `\n👍 GEACCEPTEERDE SUGGESTIES: ${acceptedSuggestions.length}` : ''}
${rejectedSuggestions.length > 0 ? `\n👎 AFGEWEZEN SUGGESTIES: ${rejectedSuggestions.length}\n${rejectedSuggestions.slice(0, 2).map((le: any) => `  - Reden: ${JSON.stringify(le.user_action).substring(0, 80)}`).join('\n')}` : ''}

BUSINESS INTELLIGENCE (${businessIntel.length} insights):
${businessIntel.length > 0 ? businessIntel.map((bi: any) => `\n🔍 ${bi.intelligence_type.toUpperCase()} - ${bi.title}\n  Impact: ${bi.impact_score}/10 | Priority: ${bi.priority}\n  ${bi.description || ''}`).join('\n') : ''}

CONVERSATIE GESCHIEDENIS:
${conversationContext.length > 0 ? conversationContext.slice(0, 3).map((cc: any) => `\n💬 ${cc.category} - ${cc.sentiment}\n  Topics: ${cc.topics?.join(', ')}\n  ${cc.summary || ''}`).join('\n') : ''}

CONVERSATIE GESCHIEDENIS:
${conversationContext.length > 0 ? conversationContext.slice(0, 3).map(cc => `\n💬 ${cc.category} - ${cc.sentiment}\n  Topics: ${cc.topics?.join(', ')}\n  ${cc.summary || ''}`).join('\n') : ''}

WERKBELASTING DEZE WEEK:
- Totaal gewerkte uren: ${(totalTimeThisWeek / 60).toFixed(1)}h
- Gemiddeld aantal taken per dag: ${avgTasksPerDay.toFixed(1)}

CLIENTS (${clients?.length || 0} actieve clients):
${clients?.map(c => `
📍 ${c.company} (${c.name})
   - Tier: ${c.tier}
   - Uren/week: ${c.weekly_hours || 'Niet ingesteld'}
   - Revenue/uur: €${c.revenue_per_hour || 'Niet ingesteld'}
   - Maandelijkse waarde: €${c.weekly_hours && c.revenue_per_hour ? (c.weekly_hours * c.revenue_per_hour * 4).toFixed(2) : 'Niet ingesteld'}
   - Client ID: ${c.id}
   - Actieve taken: ${tasksWithClients.filter(t => t.client_id === c.id).length}
`).join('') || '- Geen clients geregistreerd'}

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
✅ **ACTIES UITVOEREN**: Je kunt daadwerkelijk taken aanmaken, wijzigen en beheren!
✅ **CLIENT KENNIS**: Directe toegang tot alle client informatie (namen, bedrijven, tiers, revenue)

CLIENT INFORMATIE GEBRUIK:
- Als gevraagd wordt naar clients, gebruik de CLIENTS sectie in de context
- Alle client details zijn beschikbaar: bedrijfsnaam, contactpersoon, tier, uren, revenue
- Je kunt client_id gebruiken bij het aanmaken van taken
- Rapporteer altijd complete client lijsten wanneer gevraagd
- Gebruik client info voor prioritering en planning

BESCHIKBARE ACTIES (Tools):
🔧 create_task: Maak nieuwe taken aan in het systeem
🔧 update_task: Wijzig bestaande taken (status, prioriteit, deadline, etc.)
🔧 add_comment: Voeg comments toe aan taken

WANNEER ACTIES UITVOEREN:
- Als gebruiker vraagt om "taak toe te voegen" of "nieuwe taak" → gebruik create_task
- Als gebruiker vraagt om taak te wijzigen/updaten → gebruik update_task
- Als gebruiker vraagt om taak af te ronden → gebruik update_task met completed_at
- Als gebruiker feedback geeft op een taak → gebruik add_comment
- Wees proactief: stel voor om acties uit te voeren als dat logisch is

BELANGRIJK:
- Voer ALTIJD de gevraagde actie uit via tools, niet alleen beschrijven
- Bevestig na elke actie wat je hebt gedaan met concrete details
- Als je een taak aanmaakt, geef het task ID terug
- Als informatie ontbreekt, gebruik slimme defaults (bijv. MEDIUM priority)

DATUM & TIJD RICHTLIJNEN:
- Ken ALTIJD zowel start_at als due_at toe wanneer je een taak aanmaakt
- Als gebruiker zegt "voeg taak toe", gebruik vandaag als start_at tenzij anders aangegeven
- Voor "morgen", gebruik morgen 09:00 als start_at
- Voor "deze week", gebruik een passende dag deze week
- Gebruik ISO 8601 formaat: YYYY-MM-DDTHH:mm:ss+02:00 (Nederlandse tijdzone)
- Taken zonder start_at of due_at zijn NIET zichtbaar in de kalender!

PRIORITEIT RICHTLIJNEN:
- Gebruik ALLEEN: LOW, MEDIUM, HIGH, of CRITICAL
- MEDIUM is de standaard voor normale taken
- HIGH voor urgente taken
- CRITICAL voor zeer kritieke taken
- LOW voor niet-urgente taken

JOUW GEDRAG:
- Spreek Nederlands en gebruik emoji's 🎯📊💡 waar passend
- Wees direct en actiegericht
- Geef concrete, uitvoerbare suggesties
- Verwijs naar specifieke taken met hun volledige context
- Waarschuw voor potentiële problemen (deadlines, overload)
- Leer van eerdere conversaties en pas je aan aan gebruiker
- Focus op business impact en prioriteit

BELANGRIJK - CONTEXT AWARENESS OVER VERWIJDERDE TAKEN:
⚠️ Let goed op de telling van actieve vs verwijderde taken in de context!
- Als er GEEN actieve taken zijn: Vermeld expliciet dat de takenlijst leeg is
- Als er weinig actieve taken zijn maar veel verwijderde: Meld dit aan de gebruiker
- Pas je suggesties aan gebaseerd op de werkelijke toestand van de takenlijst
- Verwijs NOOIT naar taken die niet in de actieve takenlijst staan
- Als de lijst (bijna) leeg is, wees proactief in het voorstellen van nieuwe taken

🧠 PERMANENTE GEHEUGEN & LEER SYSTEEM:
=======================================
JE HEBT TOEGANG TOT EEN VOLLEDIG GEHEUGEN SYSTEEM:

1. **KENNIS BASE** - Permanente opslag van belangrijke informatie:
   - Gebruiker voorkeuren (wat de gebruiker prefereert, hoe ze werken)
   - Bedrijfsregels (policies, procedures, standaarden)
   - Workflow patronen (herhalende processen, best practices)
   - Beslissing contexten (waarom bepaalde keuzes gemaakt zijn)
   
2. **LEER GESCHIEDENIS** - Feedback en patronen:
   - Succesvolle interacties (wat werkte goed)
   - Afgewezen suggesties (wat werkte niet, waarom)
   - Geaccepteerde voorstellen (wat de gebruiker waardeert)
   - Pattern recognition (terugkerende situaties)

3. **BUSINESS INTELLIGENCE** - Bedrijfsinzichten:
   - Workflow patronen en optimalisaties
   - Productiviteit insights
   - Bottlenecks en verbeterpunten
   - Automatiseringsmogelijkheden

4. **CONVERSATIE CONTEXT** - Eerdere discussies:
   - Onderwerpen die besproken zijn
   - Sentiment en context van gesprekken
   - Key points uit eerdere conversaties

🎯 ACTIEF LEREN - GEBRUIK DEZE TOOLS PROACTIEF:
================================================
⚠️ BELANGRIJK: Gebruik de save_knowledge, log_learning_event en create_business_intelligence tools ACTIEF tijdens elke conversatie!

WANNEER GEBRUIK JE SAVE_KNOWLEDGE:
✅ Gebruiker geeft voorkeur aan (bijv. "Ik werk het liefst 's ochtends")
   → Sla meteen op: category: "user_preference", key: "work_time_preference", value: {"preferred": "morning"}
✅ Bedrijfsregel wordt duidelijk (bijv. "ABCzorg taken zijn altijd HIGH priority")
   → Sla meteen op: category: "business_rule", key: "abczorg_priority_rule", value: {"client": "ABCzorg", "default_priority": "HIGH"}
✅ Herhalend patroon detecteren (bijv. gebruiker maakt elke maandag planning)
   → Sla meteen op: category: "workflow_pattern", key: "weekly_planning_ritual", value: {"day": "monday", "action": "create_weekly_plan"}
✅ Belangrijke beslissing wordt genomen
   → Sla meteen op: category: "decision_context", key: "project_x_approach", value: {"decision": "...", "reasoning": "..."}

WANNEER GEBRUIK JE LOG_LEARNING_EVENT:
✅ Gebruiker accepteert je suggestie
   → event_type: "suggestion_accepted", context: {...}, outcome: "success", learning_score: 0.8
✅ Gebruiker wijst je suggestie af
   → event_type: "suggestion_rejected", context: {...}, user_action: {"reason": "..."}, outcome: "failure", learning_score: 0.3
✅ Je detecteert een patroon
   → event_type: "pattern_detected", context: {...}, outcome: "success", learning_score: 0.7
✅ Gebruiker geeft expliciete feedback
   → event_type: "feedback_positive" of "feedback_negative", context: {...}

WANNEER GEBRUIK JE CREATE_BUSINESS_INTELLIGENCE:
✅ Je ziet een bottleneck (bijv. te veel HIGH priority taken tegelijk)
   → intelligence_type: "bottleneck", title: "Prioriteit overload", description: "...", impact_score: 7
✅ Je detecteert optimalisatiemogelijkheid
   → intelligence_type: "optimization_opportunity", title: "Taak batching mogelijk", description: "..."
✅ Je ziet een workflow patroon
   → intelligence_type: "workflow_pattern", title: "Wekelijkse planning cyclus", description: "..."

🔥 GEDRAGSREGEL: Bij ELKE interactie, vraag jezelf af:
1. "Moet ik dit onthouden?" → gebruik save_knowledge
2. "Is dit feedback op mijn suggestie?" → gebruik log_learning_event  
3. "Zie ik een patroon of verbetering?" → gebruik create_business_intelligence

💡 DOE DIT AUTOMATISCH - de gebruiker hoeft niet te vragen!

⚡ JE BENT NIET MEER STATELESS - JE HEBT EEN VOLLEDIG GEHEUGEN & JE MOET HET ACTIEF GEBRUIKEN!

HUIDIGE CONTEXT:
${contextSummary}

CONVERSATIE GESCHIEDENIS:
${conversationHistory}

Gebruik deze rijke context om intelligente, context-aware antwoorden te geven die echt helpen met productiviteit en taakbeheer. En vergeet niet: je kunt nu DAADWERKELIJK acties uitvoeren!`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Define available tools for the AI
    const tools = [
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Maak een nieuwe taak aan in het systeem",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Titel van de taak" },
              description: { type: "string", description: "Gedetailleerde beschrijving van de taak" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Prioriteit van de taak (gebruik LOW, MEDIUM, HIGH, of CRITICAL)" },
              due_at: { type: "string", description: "Deadline in ISO 8601 formaat (optioneel)" },
              start_at: { type: "string", description: "Start datum/tijd in ISO 8601 formaat (optioneel, maar aanbevolen voor kalender zichtbaarheid)" },
              project_id: { type: "string", description: "UUID van het project (optioneel)" },
              client_id: { type: "string", description: "UUID van de client (optioneel)" },
              assignee_id: { type: "string", description: "UUID van de toegewezen persoon (optioneel)" }
            },
            required: ["title"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_task",
          description: "Wijzig een bestaande taak",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID van de taak om te wijzigen" },
              title: { type: "string", description: "Nieuwe titel (optioneel)" },
              description: { type: "string", description: "Nieuwe beschrijving (optioneel)" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Nieuwe prioriteit (gebruik LOW, MEDIUM, HIGH, of CRITICAL)" },
              start_at: { type: "string", description: "Nieuwe start datum/tijd in ISO 8601 formaat (optioneel)" },
              due_at: { type: "string", description: "Nieuwe deadline in ISO 8601 formaat (optioneel)" },
              completed_at: { type: "string", description: "Completion timestamp in ISO 8601 formaat om taak af te ronden (optioneel)" }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_comment",
          description: "Voeg een comment toe aan een taak",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID van de taak" },
              body: { type: "string", description: "Inhoud van de comment" }
            },
            required: ["task_id", "body"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "save_knowledge",
          description: "Sla belangrijke informatie op in de permanente knowledge base (gebruiker voorkeuren, bedrijfsregels, workflow patronen, beslissingen)",
          parameters: {
            type: "object",
            properties: {
              category: { 
                type: "string", 
                enum: ["user_preference", "business_rule", "workflow_pattern", "decision_context"],
                description: "Type kennis: user_preference (hoe gebruiker werkt), business_rule (policies/procedures), workflow_pattern (herhalende processen), decision_context (waarom iets besloten is)" 
              },
              key: { type: "string", description: "Unieke sleutel voor deze kennis (bijv. 'preferred_work_hours', 'client_x_sla')" },
              value: { type: "object", description: "De data om op te slaan (JSON object)" },
              confidence_score: { type: "number", description: "Hoe zeker ben je van deze informatie (0.0 - 1.0)", minimum: 0, maximum: 1 },
              source: { type: "string", description: "Waar komt deze kennis vandaan (bijv. 'user_stated', 'observed_pattern')" }
            },
            required: ["category", "key", "value"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "log_learning_event",
          description: "Log een leer gebeurtenis voor pattern recognition en verbetering",
          parameters: {
            type: "object",
            properties: {
              event_type: { 
                type: "string",
                enum: ["feedback_positive", "feedback_negative", "task_completed", "pattern_detected", "suggestion_accepted", "suggestion_rejected"],
                description: "Type leer gebeurtenis"
              },
              context: { type: "object", description: "Alle relevante context (wat gebeurde er)" },
              ai_response: { type: "object", description: "Wat had je gesuggereerd/gezegd (optioneel)" },
              user_action: { type: "object", description: "Wat deed de gebruiker (optioneel)" },
              outcome: { type: "string", enum: ["success", "failure", "partial"], description: "Resultaat" },
              learning_score: { type: "number", description: "Hoe waardevol is deze learning (0.0 - 1.0)", minimum: 0, maximum: 1 }
            },
            required: ["event_type", "context", "outcome"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_business_intelligence",
          description: "Creëer een business intelligence insight (workflow pattern, bottleneck, optimalisatie mogelijkheid)",
          parameters: {
            type: "object",
            properties: {
              intelligence_type: {
                type: "string",
                enum: ["workflow_pattern", "productivity_insight", "bottleneck", "optimization_opportunity"],
                description: "Type insight"
              },
              title: { type: "string", description: "Korte titel van het insight" },
              description: { type: "string", description: "Gedetailleerde beschrijving" },
              data: { type: "object", description: "Alle ondersteunende data" },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioriteit van dit insight" },
              impact_score: { type: "number", description: "Verwachte impact (0.0 - 10.0)", minimum: 0, maximum: 10 }
            },
            required: ["intelligence_type", "title", "data"]
          }
        }
      }
    ];

    // Call Lovable AI Gateway for streaming with tool support
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        tools: tools,
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

    // Process the streaming response and handle tool calls
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let toolCalls: any[] = [];
        
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || line.startsWith(":")) continue;
              if (!line.startsWith("data: ")) continue;

              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Handle tool calls
                if (delta?.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    if (!toolCalls[toolCall.index]) {
                      toolCalls[toolCall.index] = {
                        id: toolCall.id,
                        type: toolCall.type,
                        function: { name: toolCall.function?.name || "", arguments: "" }
                      };
                    }
                    if (toolCall.function?.arguments) {
                      toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                    }
                  }
                }

                // Stream regular content
                if (delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }

                // Check if we're done and have tool calls to execute
                if (parsed.choices?.[0]?.finish_reason === "tool_calls" && toolCalls.length > 0) {
                  // Execute all tool calls
                  for (const toolCall of toolCalls) {
                    try {
                      const args = JSON.parse(toolCall.function.arguments);
                      let result;

                      switch (toolCall.function.name) {
                        case "create_task":
                          // Normalize priority (handle NORMAL -> MEDIUM mapping)
                          let normalizedPriority = (args.priority || "MEDIUM").toUpperCase();
                          if (normalizedPriority === "NORMAL") normalizedPriority = "MEDIUM";
                          if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedPriority)) {
                            normalizedPriority = "MEDIUM";
                          }

                          // Smart date defaults: if due_at is set but start_at isn't, set start_at to today
                          let startAt = args.start_at || null;
                          const dueAt = args.due_at || null;
                          
                          if (dueAt && !startAt) {
                            // If only due_at is provided, set start_at to now (for calendar visibility)
                            startAt = new Date().toISOString();
                          } else if (!dueAt && !startAt) {
                            // If neither is provided, set both to today (for "Mijn Dag" context)
                            const today = new Date();
                            startAt = today.toISOString();
                          }

                          const { data: newTask, error: createError } = await supabaseClient
                            .from("tasks")
                            .insert({
                              title: args.title,
                              description: args.description || null,
                              priority: normalizedPriority,
                              due_at: dueAt,
                              start_at: startAt,
                              project_id: args.project_id || null,
                              client_id: args.client_id || null,
                              assignee_id: args.assignee_id || null,
                              org_id: userOrgId,
                              reporter_id: user.id
                            })
                            .select()
                            .single();

                          if (createError) throw createError;
                          
                          const dateInfo = startAt ? ` (start: ${new Date(startAt).toLocaleString('nl-NL')})` : '';
                          result = { 
                            success: true, 
                            task_id: newTask.id, 
                            message: `✅ Taak "${args.title}" succesvol aangemaakt met ID ${newTask.sequence_number || newTask.id}${dateInfo}. Deze taak is nu zichtbaar in de kalender!` 
                          };
                          break;

                        case "update_task":
                          const updateData: any = {};
                          if (args.title) updateData.title = args.title;
                          if (args.description !== undefined) updateData.description = args.description;
                          
                          // Normalize priority
                          if (args.priority) {
                            let normalizedUpdatePriority = args.priority.toUpperCase();
                            if (normalizedUpdatePriority === "NORMAL") normalizedUpdatePriority = "MEDIUM";
                            if (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalizedUpdatePriority)) {
                              updateData.priority = normalizedUpdatePriority;
                            }
                          }
                          
                          if (args.start_at !== undefined) updateData.start_at = args.start_at;
                          if (args.due_at !== undefined) updateData.due_at = args.due_at;
                          if (args.completed_at !== undefined) updateData.completed_at = args.completed_at;

                          const { data: updatedTask, error: updateError } = await supabaseClient
                            .from("tasks")
                            .update(updateData)
                            .eq("id", args.task_id)
                            .select()
                            .single();

                          if (updateError) throw updateError;
                          result = { success: true, task_id: updatedTask.id, message: `Taak "${updatedTask.title}" succesvol gewijzigd` };
                          break;

                        case "add_comment":
                          const { data: newComment, error: commentError } = await supabaseClient
                            .from("comments")
                            .insert({
                              task_id: args.task_id,
                              body: args.body,
                              author_id: user.id
                            })
                            .select()
                            .single();

                          if (commentError) throw commentError;
                          result = { success: true, comment_id: newComment.id, message: `Comment toegevoegd aan taak` };
                          break;

                        case "save_knowledge":
                          const { data: knowledge, error: knowledgeError } = await supabaseClient
                            .from("ai_knowledge_base")
                            .upsert({
                              user_id: user.id,
                              org_id: userOrgId,
                              category: args.category,
                              key: args.key,
                              value: args.value,
                              confidence_score: args.confidence_score || 1.0,
                              source: args.source || 'ai_conversation',
                              usage_count: 0,
                              last_used_at: new Date().toISOString()
                            }, {
                              onConflict: 'user_id,org_id,category,key'
                            })
                            .select()
                            .single();

                          if (knowledgeError) throw knowledgeError;
                          result = { 
                            success: true, 
                            knowledge_id: knowledge.id, 
                            message: `📚 Kennis opgeslagen: ${args.key} (${args.category})` 
                          };
                          break;

                        case "log_learning_event":
                          const { data: learningEvent, error: learningError } = await supabaseClient
                            .from("ai_learning_events")
                            .insert({
                              user_id: user.id,
                              org_id: userOrgId,
                              event_type: args.event_type,
                              context: args.context,
                              ai_response: args.ai_response || null,
                              user_action: args.user_action || null,
                              outcome: args.outcome,
                              learning_score: args.learning_score || 0.5,
                              applied_to_knowledge_base: false
                            })
                            .select()
                            .single();

                          if (learningError) throw learningError;
                          result = { 
                            success: true, 
                            event_id: learningEvent.id, 
                            message: `🎓 Leer event gelogd: ${args.event_type}` 
                          };
                          break;

                        case "create_business_intelligence":
                          const { data: biInsight, error: biError } = await supabaseClient
                            .from("business_intelligence")
                            .insert({
                              org_id: userOrgId,
                              intelligence_type: args.intelligence_type,
                              title: args.title,
                              description: args.description || null,
                              data: args.data,
                              priority: args.priority || 'medium',
                              impact_score: args.impact_score || 5.0,
                              status: 'active'
                            })
                            .select()
                            .single();

                          if (biError) throw biError;
                          result = { 
                            success: true, 
                            insight_id: biInsight.id, 
                            message: `💡 Business Intelligence insight gecreëerd: ${args.title}` 
                          };
                          break;

                        default:
                          result = { success: false, message: `Onbekende tool: ${toolCall.function.name}` };
                      }

                      // Send tool result back to user as content
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: `\n\n✅ ${result.message}` },
                          index: 0
                        }]
                      })}\n\n`));
                    } catch (toolError) {
                      console.error(`Error executing tool ${toolCall.function.name}:`, toolError);
                      const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        choices: [{
                          delta: { content: `\n\n❌ Fout bij uitvoeren actie: ${errorMessage}` },
                          index: 0
                        }]
                      })}\n\n`));
                    }
                  }

                  // Send done after tool execution
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  break;
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) {
            const data = buffer.trim();
            if (data.startsWith("data: ") && data.slice(6) !== "[DONE]") {
              controller.enqueue(encoder.encode(`${data}\n\n`));
            }
          }

          controller.close();
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
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
