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

const REACT_SYSTEM_PROMPT = `Je bent de TaskFlow Recruitment AI Agent voor Citozorg en ABCzorg.

Je werkt via het ReAct pattern (Reason → Act):
1. THOUGHT: Analyseer de huidige situatie en bepaal de volgende stap
2. ACTION: Kies een tool en parameters
3. OBSERVATION: Ontvang het resultaat (dit wordt door het SYSTEEM gegenereerd, NIET door jou!)
4. Herhaal tot het doel bereikt is, of geef een FINAL ANSWER

═══════════════════════════════════════════════════════════════════
KRITIEK - OUTPUT REGELS (STRIKT NALEVEN!)
═══════════════════════════════════════════════════════════════════
1. Stuur PRECIES ÉÉN stap per response
2. Wacht ALTIJD op de tool observation voordat je verdergaat
3. Genereer NOOIT zelf een OBSERVATION - die komt van het SYSTEEM
4. Als je meerdere tools wilt uitvoeren, doe ze ÉÉN VOOR ÉÉN
5. Geef NOOIT multi-step responses met meerdere THOUGHT/ACTION blokken

═══════════════════════════════════════════════════════════════════
JOUW SCOPE (STOPPUNT)
═══════════════════════════════════════════════════════════════════
Je handelt sollicitanten af van binnenkomst in de pipeline tot:
- "Screening" (kandidaat positief na fysiek interview + menselijke goedkeuring)
- of "Afgewezen"

Alles NA "Screening" valt buiten scope.

═══════════════════════════════════════════════════════════════════
PIPELINE STAGES (CORRECTE VOLGORDE - HERZIEN JANUARI 2026)
═══════════════════════════════════════════════════════════════════
nieuw → intake_verstuurd → gesprek_gepland → screening → goedgekeurd → geplaatst

- nieuw: Net binnengekomen, nog geen welkomstmail verstuurd
- intake_verstuurd: Welkomstmail verzonden, documenten worden verzameld (CV, Diploma). Blijft hier tot gesprek gepland.
- gesprek_gepland: Fysiek gesprek datum door MEDEWERKER ingevoerd (of kandidaat kiest slot)
- screening: NA gesprek + POSITIEVE medewerkerfeedback. VOG wordt hier aangevraagd!
- goedgekeurd: VOG geverifieerd, klaar voor plaatsing
- geplaatst: Actief bij klant

═══════════════════════════════════════════════════════════════════
HARD REGELS (INVARIANTEN)
═══════════════════════════════════════════════════════════════════
1) PIPELINE-REGEL:
   - Sollicitant BLIJFT op huidige stage tot aan de volgende stage vereisten voldaan zijn
   - Nieuw → Intake verstuurd: Na welkomstmail verzonden
   - Intake verstuurd → Gesprek gepland: ALLEEN wanneer medewerker gesprek_datum invult of kandidaat slot kiest
   - Gesprek gepland → Screening: ALLEEN na positieve gesprek_feedback door medewerker
   - GEEN automatische transitie op basis van document completeness!

2) INTERVIEW = HANDMATIG:
   - Jij plant GEEN gesprekken automatisch!
   - Medewerker plant fysiek gesprek via UI en vult gesprek_datum in
   - Jij stuurt GEEN interview slots

3) SCREENING = NA MENSELIJKE GOEDKEURING:
   - Kandidaat kan NIET naar screening zonder fysiek gesprek + positieve feedback
   - Bij transitie naar screening: VOG aanvraag triggeren (max 3 maanden oud requirement)

4) DATAMINIMALISATIE:
   - Vraag alleen info/documenten die ontbreken en nu nodig zijn
   - Gevoelige documenten (ID, verzekering) via upload portaal

5) GEEN GOKKEN:
   - Vul geen gegevens in als het niet in documenten/antwoord staat
   - Bij twijfel: stel gerichte vraag of markeer als "onbekend"

6) DOCUMENTBEHEER:
   - Label elk document correct (CV, Diploma, VOG, ID, BAV, KvK, etc.)
   - Sla op met einddatum/expiry indien relevant

7) VERIFICATIE:
   - Bij nieuw Diploma: trigger_document_verification (EMREX/DUO)
   - VOG: wordt pas aangevraagd bij screening stage (niet eerder!)

8) HUMAN INPUT BEPAALT EINDBESLUIT:
   - Jij beslist NIET aangenomen/afgewezen
   - Wacht ALTIJD op medewerkerfeedback via gesprek_feedback veld
     * gesprek_feedback = 'positive' → Screening (VOG request hier!)
     * gesprek_feedback = 'negative' → Afgewezen (met human review queue)

═══════════════════════════════════════════════════════════════════
BRONNEN (LEIDEND)
═══════════════════════════════════════════════════════════════════
Gebruik altijd systeemvelden als bron van waarheid:
- "missing_info" (ontbrekende velden uit context)
- "extracted_data" (geëxtraheerde gegevens)
- "pipeline_stage" (nieuw/intake_verstuurd/gesprek_gepland/screening/goedgekeurd/geplaatst/afgewezen)
- "gesprek_datum" (door medewerker ingevuld)
- "gesprek_feedback" (pending/positive/negative/no_show)
- "application_conversations" via query tools

═══════════════════════════════════════════════════════════════════
EVENT HANDLERS (gebruik de juiste tools per situatie)
═══════════════════════════════════════════════════════════════════

EVENT 1: Nieuwe sollicitatie (goal: send_welcome_and_intake)
DOEL: Welkomstmail sturen met gerichte vragen over ontbrekende info
TOOLS: send_email (email_type: 'welcome' of 'followup_question')
STAPPEN:
1. Lees missing_info uit context
2. Stuur welkomstmail met vragen over ontbrekende velden
3. Update pipeline_stage naar 'intake_verstuurd'

EVENT 2: Kandidatenreactie (goal: send_reply_response)
DOEL: Verwerken, profiel bijwerken, verificaties uitvoeren
TOOLS: send_email, trigger_document_verification
STAPPEN:
1. Detecteer nieuwe info uit context
2. Bij Diploma: trigger_document_verification (EMREX/DUO verificatie)
3. Stuur bevestiging/follow-up indien nodig
4. Kandidaat BLIJFT op 'intake_verstuurd' - GEEN automatische stage transitie!
5. Notificeer recruiter als CV + Diploma compleet zijn voor gesprek planning

EVENT 3: Gesprek Ingepland - Na handmatige planning door medewerker
DOEL: Bevestigen van afspraak aan kandidaat
TOOLS: send_email (email_type: 'interview_confirmation')
STATUS: Kandidaat gaat naar 'gesprek_gepland' stage
TRIGGER: Medewerker vult gesprek_datum in via UI

EVENT 4: Na fysiek gesprek - WACHTEN OP FEEDBACK
DOEL: Wachten op gesprek_feedback van medewerker
TOOLS: Geen automatische actie - medewerker vult feedback in via UI
- gesprek_feedback = 'positive' → Medewerker triggert transitie naar screening + VOG request
- gesprek_feedback = 'negative' → Human review queue, potentiële afwijzing
- gesprek_feedback = 'no_show' → Alternatieve actie door medewerker

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON - ALLEEN DIT FORMAT!)
═══════════════════════════════════════════════════════════════════
Antwoord ALTIJD met EEN ENKEL JSON object in dit format:

Voor een actie:
{
  "thought": "Je redenering over de huidige situatie en volgende stap",
  "action": "tool_name",
  "action_input": { "param": "value" }
}

OF voor eindantwoord:
{
  "thought": "Samenvatting van wat je hebt gedaan",
  "final_answer": "Het definitieve antwoord"
}

VERBODEN:
- Meerdere JSON blokken in één response
- OBSERVATION zelf genereren
- Multi-step responses met THOUGHT/ACTION/OBSERVATION sequences
- Automatisch interview slots sturen
- Kandidaat naar screening promoten zonder gesprek_feedback = 'positive'`;

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
        .select('id, email_from, pipeline_stage, functie_niveau, completeness_score, extracted_data, created_at');
      
      if (params.pipeline_stage) query = query.eq('pipeline_stage', params.pipeline_stage);
      // Filter by candidate_name using extracted_data->naam (JSONB filter)
      if (params.candidate_name) {
        query = query.ilike('extracted_data->>naam', `%${params.candidate_name}%`);
      }
      if (params.email) query = query.ilike('email_from', `%${params.email}%`);
      if (params.min_completeness) query = query.gte('completeness_score', params.min_completeness);
      
      query = query.order('created_at', { ascending: false }).limit(params.limit as number || 10);
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Map extracted_data.naam to candidate_name for backwards compatibility
      const mappedData = (data || []).map((app: any) => ({
        ...app,
        candidate_name: app.extracted_data?.naam || null,
        candidate_email: app.email_from
      }));
      
      return { success: true, data: mappedData, execution_ms: Date.now() - start };
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
      
      // Determine correct email_type based on goal and context
      let emailType = params.email_type as string || 'general';
      const goalText = context.goal || '';
      const goalTypeFromContext = (context.context?.goal_type as string) || '';
      
      // For send_welcome_and_intake goal, always use welcome_intake template
      const isWelcomeIntakeGoal = goalTypeFromContext === 'send_welcome_and_intake' || 
                                   goalText.toLowerCase().includes('welcome') || 
                                   goalText.toLowerCase().includes('intake') ||
                                   goalText.toLowerCase().includes('welkom');
      
      if (isWelcomeIntakeGoal && (emailType === 'welcome' || emailType === 'general')) {
        emailType = 'welcome_intake';
        console.log('[ReAct] send_email: Overriding email_type to welcome_intake for intake goal');
      }
      
      // Build template_data with missing_info for intake emails
      // PRIORITY: Use params.fields_to_ask from orchestrator first, then fall back to context
      // FIX: Handle AI sending params.context as string instead of structured data
      const contextData = (params.context && typeof params.context === 'string') 
        ? { ai_generated_content: params.context } // Preserve AI's free-text content
        : (params.context || {});
      
      // ENHANCED: Priority chain for fields_to_ask with remaining_missing_info support
      const paramsFieldsToAsk = params.fields_to_ask as string[] | undefined;
      const paramsMissingInfo = params.missing_info as string[] | undefined;
      const contextRemaining = context.context?.remaining_missing_info as string[] | undefined;
      const contextMissing = context.context?.missing_info as string[] | undefined;
      
      const fieldsToAsk = (Array.isArray(paramsFieldsToAsk) && paramsFieldsToAsk.length > 0) 
        ? paramsFieldsToAsk 
        : (Array.isArray(paramsMissingInfo) && paramsMissingInfo.length > 0)
          ? paramsMissingInfo
          : contextRemaining 
            || contextMissing 
            || [];
      
      const templateData = {
        ...contextData,
        // CRITICAL: Use enhanced priority chain for fields_to_ask
        fields_to_ask: fieldsToAsk,
        missing_info: params.all_missing_info || params.missing_info || context.context?.missing_info || [],
        extracted_data: params.extracted_data || context.context?.extracted_data || {},
        current_completeness: params.current_completeness || context.context?.completeness_score || 0,
        // Include application_id for database fallback
        application_id: params.application_id,
        // ENHANCED: Rejection context with priority chain
        rejection_context: params.rejection_context || context.context?.rejection_context || {},
      };
      
      console.log('[ReAct] send_email: templateData.fields_to_ask:', JSON.stringify(fieldsToAsk));
      console.log('[ReAct] send_email: templateData.rejection_context:', JSON.stringify(templateData.rejection_context));
      
      const { data, error } = await supabase.functions.invoke('send-ai-email', {
        body: { 
          email_type: emailType, 
          recipient_email: params.recipient_email, 
          recipient_name: params.recipient_name, 
          subject: params.subject, 
          template_data: templateData, 
          application_id: params.application_id,
          org_id: context.context?.org_id 
        }
      });
      if (error) throw error;
      return { success: true, data: { email_sent: true, email_type: emailType, ...data }, execution_ms: Date.now() - start };
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

  // ═══════════════════════════════════════════════════════════════════
  // SPECIALIST TOOLS (Master Prompt)
  // ═══════════════════════════════════════════════════════════════════

  check_recruiter_availability: async (supabase, params, _context) => {
    const start = Date.now();
    try {
      const daysAhead = (params.date_range_days as number) || 7;
      
      // Haal bestaande taken/afspraken op
      const startDate = new Date();
      const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
      
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('start_at, due_at, title')
        .gte('start_at', startDate.toISOString().split('T')[0])
        .lte('start_at', endDate.toISOString().split('T')[0])
        .is('deleted_at', null);
      
      if (error) throw error;
      
      // Blokkeer bezette tijden
      const blockedTimes = new Set(
        (tasks || []).map((t: { start_at: string | null; due_at: string | null; title: string | null }) => {
          if (!t.start_at) return null;
          const d = new Date(t.start_at);
          return `${d.toISOString().split('T')[0]}-${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        }).filter(Boolean)
      );
      
      // Genereer beschikbare slots (ma-vr 09:00-17:00)
      const defaultTimes = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
      const availableSlots = [];
      
      for (let dayOffset = 2; dayOffset <= daysAhead && availableSlots.length < 6; dayOffset++) {
        const date = new Date();
        date.setDate(date.getDate() + dayOffset);
        if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekend
        
        const dateStr = date.toISOString().split('T')[0];
        const weekday = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        const formattedDate = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
        
        for (const time of defaultTimes) {
          if (blockedTimes.has(`${dateStr}-${time}`) || availableSlots.length >= 6) continue;
          availableSlots.push({ 
            date: dateStr, 
            time, 
            formatted: `${weekday} ${formattedDate} om ${time}` 
          });
        }
      }
      
      return { 
        success: true, 
        data: { 
          available_slots: availableSlots.slice(0, 3),
          total_available: availableSlots.length,
          blocked_count: blockedTimes.size 
        }, 
        execution_ms: Date.now() - start 
      };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  record_interview_feedback: async (supabase, params, _context) => {
    const start = Date.now();
    try {
      const outcome = params.outcome as string;
      const applicationId = params.application_id as string;
      
      // Log feedback in application_conversations
      const { error: convError } = await supabase.from('application_conversations').insert({
        application_id: applicationId,
        role: 'system',
        content: `Interview feedback geregistreerd: ${outcome}. ${params.notes || ''}`,
        metadata: {
          feedback_type: 'interview_completed',
          outcome,
          interviewer_name: params.interviewer_name,
          recorded_at: new Date().toISOString(),
          recorded_by: 'react_agent'
        }
      });
      if (convError) throw convError;
      
      let newStage = null;
      let requiresHumanReview = false;
      
      if (outcome === 'positive') {
        newStage = 'screening';
      } else if (outcome === 'negative') {
        // HUMAN-IN-THE-LOOP: Afwijzingen vereisen menselijke goedkeuring
        requiresHumanReview = true;
        
        // Haal org_id op voor human_review_queue
        const { data: appData } = await supabase
          .from('professional_applications')
          .select('org_id')
          .eq('id', applicationId)
          .single();
        
        // Maak human review record aan met correct schema
        const { error: hrError } = await supabase.from('human_review_queue').insert({
          application_id: applicationId,
          org_id: appData?.org_id || '550e8400-e29b-41d4-a716-446655440000',
          review_type: 'low_confidence_rejection',  // Geldige waarden: low_confidence_rejection, data_conflict, must_have_fail, manual_escalation, document_verification
          escalation_reason: `Interview feedback: ${outcome}. ${params.notes || 'Geen notities'}`,
          status: 'pending',
          priority: 1,  // INTEGER: 1 = high, 2 = medium, 3 = low
          ai_recommendation: 'reject',  // Geldige waarden: proceed, reject, needs_info, interview
          ai_confidence: 0.85,
          ai_reasoning: {
            interviewer_name: params.interviewer_name,
            original_outcome: outcome,
            recorded_by: 'react_agent'
          }
        });
        
        if (hrError) {
          console.error('[record_interview_feedback] human_review_queue insert error:', hrError);
        }
        
        // Update application to pending review status
        await supabase.from('professional_applications')
          .update({ 
            pending_human_review: true,
            updated_at: new Date().toISOString() 
          })
          .eq('id', applicationId);
      }
      
      if (newStage && !requiresHumanReview) {
        const { error: updateError } = await supabase
          .from('professional_applications')
          .update({ 
            pipeline_stage: newStage, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', applicationId);
        
        if (updateError) throw updateError;
        
        await supabase.from('application_stage_audit').insert({
          application_id: applicationId,
          to_stage: newStage,
          reason: `Interview feedback: ${outcome}`
        });
      }
      
      return { 
        success: true, 
        data: { 
          recorded: true, 
          outcome, 
          pipeline_updated: !!newStage && !requiresHumanReview,
          new_stage: newStage,
          requires_human_review: requiresHumanReview
        }, 
        execution_ms: Date.now() - start 
      };
    } catch (err) {
      return { success: false, data: null, error: getErrorMessage(err), execution_ms: Date.now() - start };
    }
  },

  trigger_document_verification: async (supabase, params, _context) => {
    const start = Date.now();
    try {
      const docType = params.document_type as string;
      const applicationId = params.application_id as string;
      
      // Bepaal welke verificatie functie aan te roepen
      const functionName = docType === 'diploma' ? 'verify-diploma-duo' : 'verify-vog-gaav';
      
      console.log(`[ReAct] Triggering ${functionName} for application ${applicationId}`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { 
          application_id: applicationId, 
          document_path: params.document_path 
        }
      });
      
      if (error) throw error;
      
      return { 
        success: true, 
        data: { 
          verification_triggered: true,
          function: functionName,
          result: data 
        }, 
        execution_ms: Date.now() - start 
      };
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

      // Helper to detect truncation in AI response (v1.7.1 - improved detection)
      const detectTruncation = (text: string): boolean => {
        const trimmed = text.trim();
        
        // 1. Brace/bracket balans check
        const openBraces = (text.match(/{/g) || []).length;
        const closeBraces = (text.match(/}/g) || []).length;
        const openBrackets = (text.match(/\[/g) || []).length;
        const closeBrackets = (text.match(/\]/g) || []).length;
        
        if (openBraces > closeBraces) {
          console.log('[ReAct] Truncation: unbalanced braces', { open: openBraces, close: closeBraces });
          return true;
        }
        if (openBrackets > closeBrackets) {
          console.log('[ReAct] Truncation: unbalanced brackets', { open: openBrackets, close: closeBrackets });
          return true;
        }
        
        // 2. JSON code block check - begint met ```json maar eindigt niet op ```
        if (trimmed.includes('```json') && !trimmed.endsWith('```')) {
          console.log('[ReAct] Truncation: JSON code block not closed');
          return true;
        }
        
        // 3. Quote balans check (oneven = mid-string truncatie)
        const quoteCount = (text.match(/(?<!\\)"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          console.log('[ReAct] Truncation: uneven quote count', quoteCount);
          return true;
        }
        
        // 4. Uitgebreide truncatie-eindpatronen
        const suspiciousEndings = [
          '"', '_e', '_', ':', 'send_', 'email', 'emai', 'ema', 'em', 
          '"we', '"wel', '"welc', '"welco', '"welcom', 
          '"int', '"inta', '"intak',
          'action', '"action', 'input', '"action_input',
          'thought', '"thought'
        ];
        
        for (const ending of suspiciousEndings) {
          if (trimmed.endsWith(ending) && !trimmed.endsWith('"}') && !trimmed.endsWith('"]') && !trimmed.endsWith('```')) {
            console.log(`[ReAct] Truncation: ends with suspicious pattern "${ending}"`);
            return true;
          }
        }
        
        // 5. Actie-specifieke check: "action" aanwezig maar geen complete "action_input": {...}
        if (text.includes('"action"') && text.includes('"action_input"')) {
          // Check of action_input een complete object heeft
          const inputMatch = text.match(/"action_input"\s*:\s*\{/);
          if (inputMatch) {
            const afterInputStart = text.substring(text.indexOf(inputMatch[0]) + inputMatch[0].length);
            const innerBraces = (afterInputStart.match(/{/g) || []).length;
            const innerCloseBraces = (afterInputStart.match(/}/g) || []).length;
            if (innerBraces >= innerCloseBraces) {
              console.log('[ReAct] Truncation: action_input object not closed');
              return true;
            }
          }
        } else if (text.includes('"action"') && !text.includes('"action_input"')) {
          console.log('[ReAct] Truncation: action found but no action_input');
          return true;
        }
        
        return false;
      };

      // AI call with retry on truncation
      let responseText = '';
      let maxRetries = 2;
      let currentMaxTokens = 6144; // VERHOOGD van 4096 voor langere responses

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
            max_tokens: currentMaxTokens,
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
        }

        const aiData = await aiResponse.json();
        totalTokens += aiData.usage?.total_tokens || 0;
        responseText = aiData.choices?.[0]?.message?.content || '';

        // Check for truncation
        if (detectTruncation(responseText)) {
          console.warn(`[ReAct] ⚠️ Response truncation detected (attempt ${attempt + 1}/${maxRetries + 1}), response length: ${responseText.length}`);
          if (attempt < maxRetries) {
            currentMaxTokens = Math.min(currentMaxTokens * 2, 8192); // Double tokens for retry
            console.log(`[ReAct] Retrying with max_tokens: ${currentMaxTokens}`);
            continue;
          } else {
            console.warn('[ReAct] Max retries reached, proceeding with truncated response');
          }
        }
        break; // Success - exit retry loop
      }

        // v1.8.1: Enhanced logging for debugging
        console.log(`[ReAct] Step ${stepNum} - AI response length: ${responseText.length}`);
        console.log(`[ReAct] Step ${stepNum} - First 300 chars:`, responseText.substring(0, 300));
        console.log(`[ReAct] Step ${stepNum} - Last 100 chars:`, responseText.slice(-100));

        // v1.8.1: Pre-parse JSON repair for truncated responses
        const attemptJsonRepair = (text: string): string => {
          let repaired = text.trim();
          
          // Verwijder markdown code blocks
          repaired = repaired.replace(/^```json\s*/g, '').replace(/\s*```$/g, '');
          repaired = repaired.replace(/```json\s*/g, '').replace(/\s*```/g, '');
          
          // Tel braces
          const openBraces = (repaired.match(/{/g) || []).length;
          const closeBraces = (repaired.match(/}/g) || []).length;
          
          // Als er meer open dan close braces zijn
          if (openBraces > closeBraces) {
            // Check of we midden in een string zitten (oneven quotes)
            const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
            if (quoteCount % 2 !== 0) {
              repaired += '"';
            }
            // Sluit open braces
            repaired += '}'.repeat(openBraces - closeBraces);
            console.log(`[ReAct] 🔧 JSON repair: closed ${openBraces - closeBraces} braces`);
          }
          
          return repaired;
        };

        // v1.8.1: Iterative JSON extraction with fallback (greedy, from longest to shortest)
        const extractValidJson = (text: string): { thought?: string; action?: string | null; action_input?: Record<string, unknown> | null; final_answer?: string | null } | null => {
          const repaired = attemptJsonRepair(text);
          
          // Probeer eerst de volledige repaired response als JSON
          try {
            const full = JSON.parse(repaired);
            if (full.thought !== undefined || full.action !== undefined || full.final_answer !== undefined) {
              return full;
            }
          } catch {}
          
          // Zoek naar JSON code blocks
          const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            try {
              const parsed = JSON.parse(attemptJsonRepair(codeBlockMatch[1]));
              if (parsed.thought !== undefined || parsed.action !== undefined || parsed.final_answer !== undefined) {
                return parsed;
              }
            } catch {}
          }
          
          // Zoek naar standalone JSON objecten (greedy, van langste naar kortste match)
          const jsonStart = repaired.indexOf('{');
          if (jsonStart === -1) return null;
          
          // Probeer van de langste match naar kortere
          for (let end = repaired.length; end > jsonStart; end--) {
            if (repaired[end - 1] === '}') {
              try {
                const candidate = JSON.parse(repaired.substring(jsonStart, end));
                if (candidate.thought !== undefined || candidate.action !== undefined || candidate.final_answer !== undefined) {
                  return candidate;
                }
              } catch {}
            }
          }
          
          return null;
        };

        // Parse AI response
        let parsed: { thought: string; action: string | null; action_input: Record<string, unknown> | null; final_answer: string | null } = {
          thought: '',
          action: null,
          action_input: null,
          final_answer: null,
        };
      
        try {
        // KRITIEK: Detecteer en handel multi-step hallucinatie af (AI genereert eigen OBSERVATION)
        const hasHallucination = responseText.includes('OBSERVATION:') || responseText.includes('"observation"');
        
        if (hasHallucination) {
          console.warn('[ReAct] ⚠️ AI included fabricated OBSERVATION - extracting ONLY first action!');
          console.log('[ReAct] Response length:', responseText.length);
          console.log('[ReAct] Aantal gefabriceerde OBSERVATION blocks:', 
            (responseText.match(/OBSERVATION:/gi) || []).length);
          
          // Splits de response op de eerste OBSERVATION en negeer alles daarna
          const beforeFirstObservation = responseText.split(/OBSERVATION:|"observation"/i)[0];
          console.log('[ReAct] beforeFirstObservation (first 500 chars):', beforeFirstObservation.substring(0, 500));
          
          // KRITIEK FIX v1.6.0: Probeer eerst TEKSTUELE parsing (werkt altijd bij multi-step hallucinaties)
          // De JSON regex matcht vaak de ACTION_INPUT in plaats van de volledige response
          const thoughtMatch = beforeFirstObservation.match(/(?:THOUGHT|Thought):\s*([\s\S]*?)(?=(?:ACTION|Action):|$)/i);
          const actionMatch = beforeFirstObservation.match(/(?:ACTION|Action):\s*(\w+)/i);
          const inputMatch = beforeFirstObservation.match(/(?:ACTION_INPUT|Action_input):\s*(\{[\s\S]*?\})/i);
          
          if (actionMatch) {
            // Tekstuele parsing succesvol - dit is de primaire methode
            let actionInput = {};
            if (inputMatch) {
              try {
                actionInput = JSON.parse(inputMatch[1]);
              } catch (e) {
                console.warn('[ReAct] Failed to parse ACTION_INPUT JSON:', e);
              }
            }
            parsed = {
              thought: thoughtMatch?.[1]?.trim() || 'Extracted from hallucinated multi-step response',
              action: actionMatch[1],
              action_input: actionInput,
              final_answer: null, // NOOIT fallback gebruiken bij hallucinatie!
            };
            console.log('[ReAct] ✅ Parsed first action from textual hallucinated response:', parsed.action);
          } else {
            // Fallback: probeer JSON parsing met volledige ReAct structuur check
            const jsonMatches = beforeFirstObservation.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g);
            let foundValidJson = false;
            
            if (jsonMatches) {
              for (const jsonStr of jsonMatches) {
                try {
                  const candidate = JSON.parse(jsonStr);
                  // Check of dit een ReAct response is (met action property, NIET action_input parameters)
                  if (candidate.action && typeof candidate.action === 'string' && 
                      !candidate.application_id && !candidate.document_type && !candidate.email_type) {
                    parsed = {
                      thought: candidate.thought || 'Extracted from hallucinated multi-step response',
                      action: candidate.action,
                      action_input: candidate.action_input || {},
                      final_answer: null,
                    };
                    console.log('[ReAct] ✅ Parsed ReAct JSON from hallucinated response:', parsed.action);
                    foundValidJson = true;
                    break;
                  }
                } catch {
                  // Skip invalid JSON blocks
                }
              }
            }
            
            if (!foundValidJson) {
              console.error('[ReAct] ❌ No valid action found in hallucinated response');
              console.error('[ReAct] Raw beforeFirstObservation:', beforeFirstObservation);
              throw new Error('No action found in hallucinated response');
            }
          }
        } else {
          // Geen hallucinatie - v1.8.1: gebruik iteratieve JSON extraction
          const extracted = extractValidJson(responseText);
          if (extracted) {
            parsed = {
              thought: extracted.thought || '',
              action: extracted.action || null,
              action_input: extracted.action_input || null,
              final_answer: extracted.final_answer || null,
            };
            console.log(`[ReAct] ✅ Successfully extracted JSON via iterative parser`);
          } else {
            throw new Error('No valid JSON found in response');
          }
        }
      } catch (parseErr) {
        // Fallback: parse tekstueel THOUGHT/ACTION format (voor als AI het JSON format niet volgt)
        console.warn('[ReAct] JSON parse failed, trying textual format parsing...', parseErr);
        
        // Splits op OBSERVATION om alleen het eerste deel te gebruiken
        const cleanText = responseText.split(/OBSERVATION:/i)[0];
        
        const thoughtMatch = cleanText.match(/(?:THOUGHT|Thought):\s*([\s\S]*?)(?=(?:ACTION|Action):|(?:FINAL_ANSWER|Final_answer):|$)/i);
        const actionMatch = cleanText.match(/(?:ACTION|Action):\s*(\w+)/i);
        const inputMatch = cleanText.match(/(?:ACTION_INPUT|Action_input):\s*(\{[\s\S]*?\})/i);
        const finalMatch = cleanText.match(/(?:FINAL_ANSWER|Final_answer):\s*([\s\S]*?)$/i);
        
        if (actionMatch) {
          // Prioriteit aan actie boven final_answer
          parsed = {
            thought: thoughtMatch?.[1]?.trim() || 'Extracted from textual response',
            action: actionMatch[1],
            action_input: inputMatch ? JSON.parse(inputMatch[1]) : {},
            final_answer: null,
          };
          console.log('[ReAct] ✅ Successfully parsed action from textual format:', parsed.action);
        } else if (finalMatch) {
          parsed = {
            thought: thoughtMatch?.[1]?.trim() || cleanText.substring(0, 500),
            action: null,
            action_input: null,
            final_answer: finalMatch[1].trim(),
          };
          console.log('[ReAct] Parsed final_answer from textual format');
        } else {
          console.error('[ReAct] ❌ Failed to parse AI response:', responseText.substring(0, 500));
          
          // v1.8.0: Enhanced Goal-Based Action Recovery
          // Probeer actie te inferen van goal_type wanneer parsing faalt
          const goalTypeFromCtx = (memory.context?.goal_type as string) || '';
          const goalActionMapping: Record<string, { action: string; defaultEmailType: string }> = {
            'send_reply_response': { action: 'send_email', defaultEmailType: 'followup_question' },
            'send_welcome_and_intake': { action: 'send_email', defaultEmailType: 'welcome_intake' },
            'request_documents': { action: 'send_email', defaultEmailType: 'document_request' },
            'process_candidate_reply': { action: 'send_email', defaultEmailType: 'followup_question' },
          };
          
          // v1.8.0: Partial JSON Recovery voor kritieke tools
          const toolNameMatch = responseText.match(/"action"\s*:\s*"(\w+)"/);
          const thoughtMatch = responseText.match(/"thought"\s*:\s*"([^"]+)"/);
          
          // Probeer eerst van tool name, dan van goal type
          const inferredTool = toolNameMatch?.[1] || goalActionMapping[goalTypeFromCtx]?.action;
          
          if (inferredTool) {
            console.log(`[ReAct] ⚡ Attempting recovery - tool: "${inferredTool}", goal_type: "${goalTypeFromCtx}"`);
            
            // v1.8.3: Idempotency Check - Prevent duplicate emails via recovery
            if (inferredTool === 'send_email' || inferredTool.startsWith('send_')) {
              const emailAlreadySent = (memory.tool_call_counts?.['send_email'] || 0) > 0;
              
              if (emailAlreadySent) {
                console.log('[ReAct] ⚠️ Recovery skipped: send_email already executed in this session');
                console.log('[ReAct] 📊 tool_call_counts:', JSON.stringify(memory.tool_call_counts));
                
                // Redirect recovery to update_pipeline_stage instead of duplicate email
                if (goalTypeFromCtx === 'send_welcome_and_intake') {
                  const ctx = memory.context || {};
                  parsed = {
                    thought: 'Email al verstuurd in deze sessie, nu pipeline stage bijwerken naar intake_verstuurd',
                    action: 'update_pipeline_stage',
                    action_input: {
                      application_id: ctx.application_id || '',
                      new_stage: 'intake_verstuurd',
                      reason: 'Welcome email sent, transitioning from nieuw'
                    },
                    final_answer: null,
                  };
                  console.log('[ReAct] ✅ Recovery redirected to update_pipeline_stage');
                } else {
                  // Voor andere goal types: finish gracefully zonder duplicate
                  parsed = {
                    thought: 'Email actie al uitgevoerd in deze sessie, geen verdere actie nodig',
                    action: null,
                    action_input: null,
                    final_answer: 'De email is succesvol verzonden naar de kandidaat.',
                  };
                  console.log('[ReAct] ✅ Recovery completed with graceful finish');
                }
              } else {
                // Original recovery logic continues below
                const ctx = memory.context || {};
              
                // v1.8.0: Smart Email Type Selection gebaseerd op context
                const determineEmailType = (): string => {
                  const completeness = (ctx.current_completeness as number) || (ctx.completeness as number) || 0;
                  const remainingMissing = (ctx.remaining_missing_info as string[]) || (ctx.missing_info as string[]) || [];
                  const diplomaVerified = ctx.duo_verification_status === 'verified' || ctx.diploma_verified === true;
                  const hasDocumentsReceived = ctx.documents_received === true || (ctx.new_documents_count as number || 0) > 0;
                  
                  // Als diploma geverifieerd en high completeness → bevestigingsmail
                  if (diplomaVerified && completeness >= 80) {
                    // Alleen VOG ontbreekt of niets mist
                    const onlyVogMissing = remainingMissing.length === 0 || 
                      (remainingMissing.length === 1 && remainingMissing.includes('vog_upload'));
                    if (onlyVogMissing) {
                      return 'documents_received_confirmation';
                    }
                  }
                  
                  // Als er documenten zijn ontvangen, bevestig dat
                  if (hasDocumentsReceived && completeness >= 60) {
                    return 'document_confirmation';
                  }
                  
                  // Anders vraag ontbrekende info
                  if (remainingMissing.length > 0) {
                    return 'followup_question';
                  }
                  
                  // Default voor goal type
                  return goalActionMapping[goalTypeFromCtx]?.defaultEmailType || 'general_followup';
                };
                
                // v1.8.1: Uitgebreide context key aliasing voor robuustere recovery
                const getContextValue = (keys: string[]): string => {
                  for (const key of keys) {
                    const val = ctx[key];
                    if (val !== undefined && val !== null && val !== '') return String(val);
                  }
                  return '';
                };

                const recoveredInput = {
                  recipient_email: getContextValue(['candidate_email', 'email', 'kandidaat_email', 'to', 'recipient_email']),
                  recipient_name: getContextValue(['candidate_name', 'name', 'kandidaat_naam', 'recipient_name', 'full_name']),
                  email_type: determineEmailType(),
                  application_id: getContextValue(['application_id', 'sollicitatie_id', 'app_id', 'id']),
                  fields_to_ask: (ctx.remaining_missing_info as string[]) || (ctx.missing_info as string[]) || [],
                };
                
                if (recoveredInput.recipient_email && recoveredInput.application_id) {
                  parsed = {
                    thought: thoughtMatch?.[1] || `Recovered from goal type "${goalTypeFromCtx}" - sending ${recoveredInput.email_type}`,
                    action: 'send_email',
                    action_input: recoveredInput,
                    final_answer: null,
                  };
                  console.log('[ReAct] ✅ Successfully recovered send_email from context');
                  console.log('[ReAct] Recovered input:', JSON.stringify(recoveredInput));
                } else {
                  console.warn('[ReAct] ⚠️ Cannot recover send_email - missing required context (email or application_id)');
                  // Markeer als partial failure, niet als success
                  parsed = {
                    thought: responseText.substring(0, 500),
                    action: null,
                    action_input: null,
                    final_answer: '[RECOVERY_FAILED] Er ging iets mis bij het verwerken van de email. Probeer het opnieuw.',
                  };
                }
              }
            } else {
              // Andere tools kunnen niet automatisch recoveren
              console.warn(`[ReAct] ⚠️ Cannot auto-recover tool "${inferredTool}" - no context mapping available`);
              parsed = {
                thought: responseText.substring(0, 500),
                action: null,
                action_input: null,
                final_answer: '[RECOVERY_FAILED] Ik kon de vraag niet goed verwerken. Kun je het anders formuleren?',
              };
            }
          } else if (goalActionMapping[goalTypeFromCtx]) {
            // v1.8.0: Goal-based inference als geen tool name gevonden
            console.log(`[ReAct] ⚡ Inferring action from goal_type: "${goalTypeFromCtx}"`);
            const mapping = goalActionMapping[goalTypeFromCtx];
            const ctx = memory.context || {};
            
            const recoveredInput = {
              recipient_email: ctx.candidate_email || ctx.email || '',
              recipient_name: ctx.candidate_name || ctx.name || '',
              email_type: mapping.defaultEmailType,
              application_id: ctx.application_id || '',
              fields_to_ask: (ctx.remaining_missing_info as string[]) || (ctx.missing_info as string[]) || [],
            };
            
            if (recoveredInput.recipient_email && recoveredInput.application_id) {
              parsed = {
                thought: `Inferred from goal_type "${goalTypeFromCtx}" - original response parsing failed`,
                action: mapping.action,
                action_input: recoveredInput,
                final_answer: null,
              };
              console.log('[ReAct] ✅ Successfully inferred action from goal_type');
            } else {
              parsed = {
                thought: responseText.substring(0, 500),
                action: null,
                action_input: null,
                final_answer: '[RECOVERY_FAILED] Ik kon de vraag niet goed verwerken. Kun je het anders formuleren?',
              };
            }
          } else {
            // Geen tool gevonden en geen goal mapping - standaard fallback
            parsed = {
              thought: responseText.substring(0, 500),
              action: null,
              action_input: null,
              final_answer: '[RECOVERY_FAILED] Ik kon de vraag niet goed verwerken. Kun je het anders formuleren?',
            };
          }
        }
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

        // v1.8.0: Correcte Outcome Detectie
        // Detecteer of dit een echte success is of een fallback error message
        const ERROR_FALLBACK_PHRASES = [
          'Ik kon de vraag niet goed verwerken',
          'Er ging iets mis bij het verwerken',
          'Probeer het opnieuw',
          'Kun je het anders formuleren',
          '[RECOVERY_FAILED]',
          'Er is een fout opgetreden',
        ];
        
        const isErrorFallback = ERROR_FALLBACK_PHRASES.some(phrase => 
          parsed.final_answer?.includes(phrase)
        );
        
        const actualOutcome = isErrorFallback ? 'partial' : 'success';
        const isActualSuccess = !isErrorFallback;
        
        console.log(`${isActualSuccess ? '✅' : '⚠️'} [ReAct] Session completed in ${stepNum} steps (outcome: ${actualOutcome})`);
        if (isErrorFallback) {
          console.warn('[ReAct] Detected error fallback message - marking as partial failure');
        }

        // Persist session trace with correct outcome
        await persistSessionTrace(supabase, memory, actualOutcome, parsed.final_answer, totalTokens, toolsExecuted);

        return {
          success: isActualSuccess,
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

          // Update tool stability with org_id from context
          const orgId = (memory.context.org_id as string) || '550e8400-e29b-41d4-a716-446655440000';
          await updateToolStability(supabase, toolName, result.success, orgId);

          if (result.data && typeof result.data === 'object' && result.data !== null) {
            memory.entities_discovered.push(result.data as Record<string, unknown>);
          }
        } catch (toolErr) {
          step.observation = `ERROR: ${getErrorMessage(toolErr)}`;
          step.execution_ms = Date.now() - toolStart;
          const orgId = (memory.context.org_id as string) || '550e8400-e29b-41d4-a716-446655440000';
          await updateToolStability(supabase, toolName, false, orgId);
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
      goal_type: memory.context.goal_type || null,
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

async function updateToolStability(
  supabase: any, 
  toolName: string, 
  success: boolean,
  orgId: string = '550e8400-e29b-41d4-a716-446655440000'
): Promise<void> {
  try {
    await supabase.rpc('update_tool_stability', {
      p_tool_name: toolName,
      p_org_id: orgId,
      p_success: success,
      p_execution_ms: 0,
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
