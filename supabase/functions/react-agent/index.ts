// ============================================================================
// ENTERPRISE REACT AI AGENT: Core Engine
// ============================================================================
// Implements: Observe → Reason → Act → Reflect loop
// Features: Dynamic tool selection, self-correction, learning integration
// ============================================================================

import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { 
  TOOL_REGISTRY, 
  getToolDefinitionsForPrompt, 
  toolRequiresApproval,
  validateToolParameters,
  getAllToolNames
} from '../_shared/tool-registry.ts';
import type { 
  ReActStep, 
  ReActResult, 
  ReActConfig, 
  ToolResult, 
  WorkingMemory,
  SessionTrace,
  ApprovalRequest,
  DEFAULT_REACT_CONFIG 
} from '../_shared/react-agent-types.ts';
import { semanticKnowledgeRetrieval } from '../_shared/semantic-retrieval.ts';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REACT_CONFIG: ReActConfig = {
  max_steps: 15,
  max_same_tool_consecutive: 3,
  max_emails_per_session: 5,
  max_database_mutations: 10,
  timeout_seconds: 120,
  critical_actions: ['delete_professional', 'reject_application', 'send_contract', 'bulk_email'],
  fallback_on_error: true,
};

// ============================================================================
// SYSTEM PROMPT FOR REACT REASONING
// ============================================================================

const REACT_SYSTEM_PROMPT = `Je bent een Enterprise AI Agent voor recruitment in de Nederlandse zorgsector.

Je werkt via het ReAct pattern (Reason → Act):
1. THOUGHT: Analyseer de huidige situatie en bepaal de volgende stap
2. ACTION: Kies een tool en parameters
3. OBSERVATION: Ontvang het resultaat
4. Herhaal tot het doel bereikt is, of geef een FINAL ANSWER

BELANGRIJKE REGELS:
- Gebruik ALLEEN de beschikbare tools
- Wees specifiek met parameters
- Valideer data voordat je acties uitvoert
- Bij onzekerheid: vraag verduidelijking via FINAL ANSWER
- KRITIEKE ACTIES (reject_application, delete_professional) vereisen menselijke goedkeuring

OUTPUT FORMAT (strict JSON):
{
  "thought": "Je redenering over de huidige situatie en volgende stap",
  "action": "tool_name" of null voor final answer,
  "action_input": { parameters } of null,
  "final_answer": "Antwoord aan gebruiker" of null
}

Als je klaar bent of geen tools meer nodig hebt, gebruik dan:
{
  "thought": "Ik heb voldoende informatie om te antwoorden",
  "action": null,
  "action_input": null,
  "final_answer": "Je complete antwoord hier"
}`;

// ============================================================================
// TOOL HANDLERS
// ============================================================================

// Helper to safely get error message
const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
};

const TOOL_HANDLERS: Record<string, (supabase: any, params: Record<string, unknown>, context: WorkingMemory) => Promise<ToolResult>> = {
  
  // === DATABASE QUERY TOOLS ===
  
  query_professionals: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('professionals').select('id, naam, email, functie_niveau, regio, werkvorm, beschikbaarheid, specialismen, created_at');
      
      if (params.functie_niveau) query = query.ilike('functie_niveau', `%${params.functie_niveau}%`);
      if (params.regio) query = query.ilike('regio', `%${params.regio}%`);
      if (params.werkvorm) query = query.ilike('werkvorm', `%${params.werkvorm}%`);
      if (params.sector) query = query.contains('sector', [params.sector]);
      
      query = query.limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  query_applications: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('professional_applications')
        .select('id, candidate_name, candidate_email, pipeline_stage, functie_niveau, completeness_percentage, extracted_data, created_at');
      
      if (params.pipeline_stage) query = query.eq('pipeline_stage', params.pipeline_stage);
      if (params.candidate_name) query = query.ilike('candidate_name', `%${params.candidate_name}%`);
      if (params.email) query = query.ilike('candidate_email', `%${params.email}%`);
      if (params.min_completeness) query = query.gte('completeness_percentage', params.min_completeness);
      
      query = query.order('created_at', { ascending: false }).limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  query_worklocations: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('client_sublocations')
        .select('id, naam, plaats, provincie, sector, doelgroep, gezochte_functies, is_active');
      
      if (params.sector) query = query.contains('sector', [params.sector]);
      if (params.plaats) query = query.ilike('plaats', `%${params.plaats}%`);
      if (params.provincie) query = query.ilike('provincie', `%${params.provincie}%`);
      if (params.doelgroep) query = query.contains('doelgroep', [params.doelgroep]);
      
      query = query.eq('is_active', true).limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  query_tasks: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('tasks')
        .select('id, title, description, status, priority, due_date, created_at');
      
      if (params.status) query = query.eq('status', params.status);
      if (params.priority) query = query.eq('priority', params.priority);
      if (params.due_before) query = query.lte('due_date', params.due_before);
      
      query = query.order('due_date', { ascending: true }).limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  query_clients: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('organizations')
        .select('id, name, type, website, logo_url');
      
      if (params.organization_name) query = query.ilike('name', `%${params.organization_name}%`);
      
      query = query.limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  query_vacancies: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('vacancies')
        .select('id, functie, sublocation_id, status, uren_per_week, created_at');
      
      if (params.functie) query = query.ilike('functie', `%${params.functie}%`);
      if (params.sublocation_id) query = query.eq('sublocation_id', params.sublocation_id);
      if (params.status) query = query.eq('status', params.status);
      
      query = query.limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  query_placements: async (supabase, params) => {
    const start = Date.now();
    try {
      let query = supabase.from('assignments')
        .select('id, professional_id, sublocation_id, status, start_date, end_date, weekly_hours');
      
      if (params.professional_id) query = query.eq('professional_id', params.professional_id);
      if (params.sublocation_id) query = query.eq('sublocation_id', params.sublocation_id);
      if (params.status) query = query.eq('status', params.status);
      
      query = query.limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  // === ACTION TOOLS ===

  send_email: async (supabase, params, context) => {
    const start = Date.now();
    try {
      const emailCount = context.tool_call_counts['send_email'] || 0;
      if (emailCount >= REACT_CONFIG.max_emails_per_session) {
        return { success: false, data: null, error: `Email limit reached (${REACT_CONFIG.max_emails_per_session} per session)`, execution_ms: Date.now() - start };
      }
      const { data, error } = await supabase.functions.invoke('send-ai-email', {
        body: { email_type: params.email_type, recipient_email: params.recipient_email, recipient_name: params.recipient_name, subject: params.subject, template_data: params.context, application_id: params.application_id }
      });
      if (error) throw error;
      return { success: true, data: { email_sent: true, ...data }, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  schedule_interview: async (supabase, params) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('schedule-interview', {
        body: { application_id: params.application_id, candidate_email: params.candidate_email, candidate_name: params.candidate_name, interview_type: params.interview_type || 'video', duration_minutes: params.duration_minutes || 30, action: 'request_availability' }
      });
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  request_documents: async (supabase, params) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('send-ai-email', {
        body: { email_type: 'document_request', recipient_email: params.candidate_email, recipient_name: params.candidate_name, application_id: params.application_id, template_data: { documents: params.documents, deadline: params.deadline, urgent: params.urgent } }
      });
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  create_calendar_event: async (_supabase, params) => {
    const start = Date.now();
    try {
      console.log('[ReAct] Calendar event requested:', params);
      return { success: true, data: { event_created: true, title: params.title, start_time: params.start_time, attendees: params.attendees }, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  update_pipeline_stage: async (supabase, params) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('professional_applications').update({ pipeline_stage: params.new_stage, updated_at: new Date().toISOString() }).eq('id', params.application_id).select().single();
      if (error) throw error;
      await supabase.from('application_stage_audit').insert({ application_id: params.application_id, to_stage: params.new_stage, reason: params.reason || 'ReAct Agent transition' });
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  create_task: async (supabase, params, context) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('tasks').insert({ title: params.title, description: params.description, due_date: params.due_date, priority: params.priority || 'medium', status: 'todo', org_id: context.context.org_id }).select().single();
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  reject_application: async (_supabase, _params, _context) => {
    const start = Date.now();
    return { success: false, data: null, error: 'REQUIRES_APPROVAL: reject_application requires human approval', execution_ms: Date.now() - start };
  },

  delete_professional: async (_supabase, _params, _context) => {
    const start = Date.now();
    return { success: false, data: null, error: 'REQUIRES_APPROVAL: delete_professional requires human approval', execution_ms: Date.now() - start };
  },

  // === KNOWLEDGE TOOLS ===

  search_knowledge: async (supabase, params, context) => {
    const start = Date.now();
    try {
      const matches = await semanticKnowledgeRetrieval(params.query as string, supabase, {
        orgId: context.context.org_id as string,
        threshold: 0.5,
        maxResults: params.limit as number || 10,
      });
      return { success: true, data: matches.map(m => ({ knowledge_id: m.knowledge_id, category: m.category, key: m.key, value: m.value, similarity: m.similarity })), execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  save_knowledge: async (supabase, params, context) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('ai_knowledge_base').upsert({ org_id: context.context.org_id, category: params.category, key: params.key, value: params.value, source: params.source || 'react_agent', confidence_score: params.confidence_score || 0.7, needs_review: true }, { onConflict: 'org_id,category,key' }).select().single();
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  log_learning_event: async (supabase, params, context) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('ai_learning_events').insert({ org_id: context.context.org_id, event_type: params.event_type, context: params.context, outcome: params.outcome }).select().single();
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  // === SEARCH & MATCHING TOOLS ===

  calculate_match_score: async (supabase, params) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('calculate-application-matches', { body: { application_id: params.professional_id, sublocation_id: params.sublocation_id } });
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  find_matches: async (supabase, params) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('application_sublocation_matches').select('*, client_sublocations(naam, plaats)').eq('application_id', params.application_id).gte('match_score', params.min_score || 50).order('match_score', { ascending: false }).limit(params.limit as number || 10);
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  // === ORCHESTRATION TOOLS ===

  create_agent_goal: async (supabase, params, context) => {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('agent_goals').insert({ org_id: context.context.org_id, goal_type: params.goal_type, goal_description: params.goal_description, input_data: params.input_data, priority: params.priority || 5, status: 'pending' }).select().single();
      if (error) throw error;
      return { success: true, data, execution_ms: Date.now() - start };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  wait_for_callback: async (_supabase, params) => {
    const start = Date.now();
    return { success: true, data: { waiting: true, callback_type: params.callback_type, timeout_minutes: params.timeout_minutes }, execution_ms: Date.now() - start };
  },
};

// ============================================================================
// REACT LOOP IMPLEMENTATION
// ============================================================================

async function executeReActLoop(
  supabase: any,
  goal: string,
  context: Record<string, unknown>,
  config: ReActConfig = REACT_CONFIG
): Promise<ReActResult> {
  const sessionId = crypto.randomUUID();
  const startTime = Date.now();
  const steps: ReActStep[] = [];
  const toolsExecuted: string[] = [];
  let totalTokens = 0;
  let consecutiveToolCounts: Record<string, number> = {};

  // Initialize working memory
  const memory: WorkingMemory = {
    session_id: sessionId,
    goal,
    context,
    steps: [],
    tool_call_counts: {},
    entities_discovered: [],
    start_time: startTime,
  };

  console.log(`🧠 [ReAct] Starting session ${sessionId} with goal: ${goal.substring(0, 100)}...`);

  // Get available tools for prompt
  const toolsPrompt = getToolDefinitionsForPrompt();

  try {
    for (let stepNum = 1; stepNum <= config.max_steps; stepNum++) {
      // Check timeout
      if (Date.now() - startTime > config.timeout_seconds * 1000) {
        console.log(`⏰ [ReAct] Session timeout after ${config.timeout_seconds}s`);
        return {
          success: false,
          final_answer: 'De sessie is verlopen door timeout. Probeer het opnieuw met een specifiekere vraag.',
          steps,
          total_tokens_used: totalTokens,
          total_duration_ms: Date.now() - startTime,
          tools_executed: toolsExecuted,
          error: 'TIMEOUT',
        };
      }

      // Build conversation history for AI
      const conversationHistory = steps.map(s => {
        let content = `THOUGHT: ${s.thought}`;
        if (s.action) {
          content += `\nACTION: ${s.action}`;
          content += `\nACTION_INPUT: ${JSON.stringify(s.action_input)}`;
          content += `\nOBSERVATION: ${s.observation}`;
        }
        return { role: 'assistant' as const, content };
      });

      // Call AI for next step
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: REACT_SYSTEM_PROMPT + '\n\nBESCHIKBARE TOOLS:\n' + toolsPrompt },
            { role: 'user', content: `DOEL: ${goal}\n\nCONTEXT: ${JSON.stringify(context)}` },
            ...conversationHistory,
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
      }

      const aiData = await aiResponse.json();
      totalTokens += aiData.usage?.total_tokens || 0;

      // Parse AI response
      const responseText = aiData.choices?.[0]?.message?.content || '';
      let parsed: { thought: string; action: string | null; action_input: Record<string, unknown> | null; final_answer: string | null };
      
      try {
        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error('[ReAct] Failed to parse AI response:', responseText);
        parsed = {
          thought: responseText,
          action: null,
          action_input: null,
          final_answer: 'Ik kon de vraag niet goed verwerken. Kun je het anders formuleren?',
        };
      }

      const step: ReActStep = {
        step_number: stepNum,
        thought: parsed.thought || '',
        action: parsed.action,
        action_input: parsed.action_input,
        observation: null,
        timestamp: new Date().toISOString(),
      };

      // Check for final answer
      if (!parsed.action && parsed.final_answer) {
        step.observation = 'FINAL_ANSWER';
        steps.push(step);
        memory.steps = steps;

        console.log(`✅ [ReAct] Session completed in ${stepNum} steps`);

        // Persist session trace
        await persistSessionTrace(supabase, memory, 'success', parsed.final_answer, totalTokens, toolsExecuted);

        return {
          success: true,
          final_answer: parsed.final_answer,
          steps,
          total_tokens_used: totalTokens,
          total_duration_ms: Date.now() - startTime,
          tools_executed: toolsExecuted,
        };
      }

      // Execute tool
      if (parsed.action) {
        const toolName = parsed.action;
        const toolParams = parsed.action_input || {};

        // Check for loop prevention
        consecutiveToolCounts[toolName] = (consecutiveToolCounts[toolName] || 0) + 1;
        if (consecutiveToolCounts[toolName] > config.max_same_tool_consecutive) {
          step.observation = `ERROR: Tool ${toolName} called ${config.max_same_tool_consecutive} times consecutively. Breaking potential loop.`;
          steps.push(step);
          continue;
        }

        // Reset other tool counts
        Object.keys(consecutiveToolCounts).forEach(t => {
          if (t !== toolName) consecutiveToolCounts[t] = 0;
        });

        // Check if tool exists
        const handler = TOOL_HANDLERS[toolName];
        if (!handler) {
          step.observation = `ERROR: Unknown tool '${toolName}'. Available tools: ${getAllToolNames().join(', ')}`;
          steps.push(step);
          continue;
        }

        // Check for critical action approval
        if (toolRequiresApproval(toolName)) {
          const approval = await createApprovalRequest(supabase, {
            session_id: sessionId,
            action_type: 'critical_action',
            tool_name: toolName,
            input_data: toolParams,
            reason: `ReAct agent wil ${toolName} uitvoeren`,
            risk_level: 'high',
          });

          step.observation = `PENDING_APPROVAL: Action ${toolName} requires human approval. Approval ID: ${approval.id}`;
          steps.push(step);
          memory.steps = steps;

          // Return partial result
          return {
            success: false,
            final_answer: null,
            steps,
            total_tokens_used: totalTokens,
            total_duration_ms: Date.now() - startTime,
            tools_executed: toolsExecuted,
            error: 'HUMAN_APPROVAL_REQUIRED',
          };
        }

        // Execute tool
        const toolStart = Date.now();
        try {
          const result = await handler(supabase, toolParams, memory);
          step.observation = JSON.stringify(result.data || { error: result.error });
          step.execution_ms = Date.now() - toolStart;
          
          // Update stats
          memory.tool_call_counts[toolName] = (memory.tool_call_counts[toolName] || 0) + 1;
          toolsExecuted.push(toolName);

          // Update tool stability
          await updateToolStability(supabase, toolName, result.success);

          if (result.data && typeof result.data === 'object' && result.data !== null) {
            memory.entities_discovered.push(result.data as Record<string, unknown>);
          }
        } catch (toolErr) {
          step.observation = `ERROR: ${getErrorMessage(toolErr)}`;
          step.execution_ms = Date.now() - toolStart;
          await updateToolStability(supabase, toolName, false);
        }
      }

      steps.push(step);
      memory.steps = steps;
    }

    console.log(`⚠️ [ReAct] Max steps (${config.max_steps}) reached`);
    await persistSessionTrace(supabase, memory, 'partial', null, totalTokens, toolsExecuted);

    return {
      success: false,
      final_answer: 'Ik heb het maximum aantal stappen bereikt zonder een volledig antwoord. Probeer een specifiekere vraag.',
      steps,
      total_tokens_used: totalTokens,
      total_duration_ms: Date.now() - startTime,
      tools_executed: toolsExecuted,
      error: 'MAX_STEPS_REACHED',
    };

  } catch (err) {
    console.error('[ReAct] Fatal error:', err);
    await persistSessionTrace(supabase, memory, 'failure', null, totalTokens, toolsExecuted, getErrorMessage(err));

    return {
      success: false,
      final_answer: config.fallback_on_error ? 'Er is een fout opgetreden. Probeer het later opnieuw.' : null,
      steps,
      total_tokens_used: totalTokens,
      total_duration_ms: Date.now() - startTime,
      tools_executed: toolsExecuted,
      error: getErrorMessage(err),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function persistSessionTrace(
  supabase: any,
  memory: WorkingMemory,
  outcome: 'success' | 'failure' | 'partial' | 'timeout',
  finalAnswer: string | null,
  totalTokens: number,
  toolsExecuted: string[],
  errorMessage?: string
): Promise<void> {
  try {
    const toolUsageStats: Record<string, { count: number; success: number; failure: number; avg_ms: number }> = {};
    
    for (const step of memory.steps) {
      if (step.action) {
        if (!toolUsageStats[step.action]) {
          toolUsageStats[step.action] = { count: 0, success: 0, failure: 0, avg_ms: 0 };
        }
        toolUsageStats[step.action].count++;
        if (!step.observation?.startsWith('ERROR')) {
          toolUsageStats[step.action].success++;
        } else {
          toolUsageStats[step.action].failure++;
        }
        if (step.execution_ms) {
          const stats = toolUsageStats[step.action];
          stats.avg_ms = (stats.avg_ms * (stats.count - 1) + step.execution_ms) / stats.count;
        }
      }
    }

    await supabase.from('agent_execution_traces').insert({
      org_id: memory.context.org_id || '550e8400-e29b-41d4-a716-446655440000',
      session_id: memory.session_id,
      goal_description: memory.goal,
      steps: memory.steps,
      final_answer: finalAnswer,
      outcome,
      total_tokens_used: totalTokens,
      total_duration_ms: Date.now() - memory.start_time,
      tool_usage_stats: toolUsageStats,
      tools_executed: toolsExecuted,
      learning_applied: false,
      error_message: errorMessage,
    });
  } catch (err) {
    console.error('[ReAct] Failed to persist session trace:', err);
  }
}

async function updateToolStability(supabase: any, toolName: string, success: boolean): Promise<void> {
  try {
    await supabase.rpc('update_tool_stability', {
      p_tool_name: toolName,
      p_success: success,
      p_execution_ms: 0, // Will be updated separately if needed
    });
  } catch (err) {
    console.error('[ReAct] Failed to update tool stability:', err);
  }
}

async function createApprovalRequest(supabase: any, request: ApprovalRequest): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .insert({
      session_id: request.session_id,
      trace_id: request.trace_id,
      action_type: request.action_type,
      tool_name: request.tool_name,
      input_data: request.input_data,
      reason: request.reason,
      risk_level: request.risk_level,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();
    const body = await req.json();
    
    const { goal, context = {}, config_override } = body;

    if (!goal) {
      return errorResponse('Missing required field: goal', 400);
    }

    // Check feature flag
    const { data: configData } = await supabase
      .from('react_agent_config')
      .select('*')
      .eq('config_key', 'default')
      .single();

    const isEnabled = configData?.enabled ?? false;
    const rolloutPercentage = configData?.rollout_percentage ?? 0;

    // Check if this request should use ReAct agent
    const randomValue = Math.random() * 100;
    if (!isEnabled || randomValue > rolloutPercentage) {
      return jsonResponse({
        success: false,
        error: 'ReAct agent is disabled or not selected for this request',
        fallback_to_legacy: true,
      });
    }

    // Execute ReAct loop
    const mergedConfig = { ...REACT_CONFIG, ...config_override };
    const result = await executeReActLoop(supabase, goal, context, mergedConfig);

    return jsonResponse({
      success: result.success,
      answer: result.final_answer,
      steps_count: result.steps.length,
      tokens_used: result.total_tokens_used,
      duration_ms: result.total_duration_ms,
      tools_used: result.tools_executed,
      error: result.error,
      // Include steps for debugging if requested
      steps: body.include_steps ? result.steps : undefined,
    });

  } catch (err) {
    console.error('[react-agent] Fatal error:', err);
    return errorResponse(getErrorMessage(err), 500);
  }
});
