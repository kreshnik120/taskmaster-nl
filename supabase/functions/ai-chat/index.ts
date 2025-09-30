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
      chatHistoryResult
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
✅ **ACTIES UITVOEREN**: Je kunt daadwerkelijk taken aanmaken, wijzigen en beheren!

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
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "Prioriteit van de taak" },
              due_at: { type: "string", description: "Deadline in ISO 8601 formaat (optioneel)" },
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
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "Nieuwe prioriteit (optioneel)" },
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
        model: 'google/gemini-2.5-flash',
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
                          const { data: newTask, error: createError } = await supabaseClient
                            .from("tasks")
                            .insert({
                              title: args.title,
                              description: args.description || null,
                              priority: args.priority || "MEDIUM",
                              due_at: args.due_at || null,
                              project_id: args.project_id || null,
                              client_id: args.client_id || null,
                              assignee_id: args.assignee_id || null,
                              org_id: userOrgId,
                              reporter_id: user.id
                            })
                            .select()
                            .single();

                          if (createError) throw createError;
                          result = { success: true, task_id: newTask.id, message: `Taak "${args.title}" succesvol aangemaakt met ID ${newTask.sequence_number || newTask.id}` };
                          break;

                        case "update_task":
                          const updateData: any = {};
                          if (args.title) updateData.title = args.title;
                          if (args.description !== undefined) updateData.description = args.description;
                          if (args.priority) updateData.priority = args.priority;
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
