import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentGoal {
  id: string;
  org_id: string;
  goal_type: string;
  goal_description: string;
  status: string;
  priority: number;
  deadline: string | null;
  input_data: Record<string, any>;
  plan: any[];
}

interface AgentAction {
  action_type: string;
  action_order: number;
  action_description: string;
  scheduled_at: string | null;
  input_data: Record<string, any>;
}

// Goal type configurations
const GOAL_CONFIGS: Record<string, {
  planGenerator: (goal: AgentGoal, context: any) => AgentAction[];
  requiredFields: string[];
}> = {
  // =====================================================
  // NEW: Application Intake Completion - Autonome follow-up
  // =====================================================
  'application_intake_completion': {
    requiredFields: ['application_id', 'candidate_email'],
    planGenerator: (goal, context) => {
      const missingInfo = goal.input_data.missing_info || [];
      
      // Prioriteit volgorde voor vragen (kritieke velden eerst)
      const priorityFields = [
        'functie_niveau',    // Kritiek voor matching
        'werkvorm',          // Kritiek voor matching
        'regio',             // Kritiek voor matching
        'beschikbaarheid',   // Belangrijk voor plaatsing
        'telefoonnummer',    // Belangrijk voor contact
        'ervaring_sector',   // Belangrijk voor matching
        'doelgroep_ervaring',// Belangrijk voor matching
        'naam',              // Basis info
        'email',             // Basis info
        'eigen_vervoer',     // Praktisch
        'vog',               // Administratief
        'big_registratie',   // Administratief
      ];
      
      // Filter en sorteer missing info op prioriteit
      const sortedMissing = [...missingInfo].sort((a: string, b: string) => {
        const aIndex = priorityFields.indexOf(a);
        const bIndex = priorityFields.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
      
      // Neem max 3 items per email (niet overweldigend)
      const fieldsToAsk = sortedMissing.slice(0, 3);
      
      return [
        {
          action_type: 'send_followup_question',
          action_order: 1,
          action_description: `Vraag ontbrekende info: ${fieldsToAsk.join(', ')}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            application_id: goal.input_data.application_id,
            candidate_email: goal.input_data.candidate_email,
            candidate_name: goal.input_data.candidate_name,
            fields_to_ask: fieldsToAsk,
            all_missing_info: missingInfo,
            current_completeness: goal.input_data.current_completeness,
            follow_up_count: goal.input_data.follow_up_count || 0,
          }
        }
      ];
    }
  },

  // Send interview email via n8n
  'send_interview_email': {
    requiredFields: ['candidateEmail', 'candidateName', 'scheduledAt'],
    planGenerator: (goal, context) => {
      return [
        {
          action_type: 'send_interview_email',
          action_order: 1,
          action_description: `Stuur interview bevestigingsmail naar ${goal.input_data.candidateName}`,
          scheduled_at: new Date().toISOString(), // Execute immediately
          input_data: {
            candidateEmail: goal.input_data.candidateEmail,
            candidateName: goal.input_data.candidateName,
            candidatePhone: goal.input_data.candidatePhone,
            functieNiveau: goal.input_data.functieNiveau,
            scheduledAt: goal.input_data.scheduledAt,
            duration: goal.input_data.duration,
            locationType: goal.input_data.locationType,
            locationDetails: goal.input_data.locationDetails,
            notes: goal.input_data.notes,
            recruiterName: goal.input_data.recruiterName,
            emailPreview: goal.input_data.emailPreview,
            applicationId: goal.input_data.applicationId,
            taskId: goal.input_data.taskId,
          }
        }
      ];
    }
  },
  
  // Request documents from candidate
  'request_documents': {
    requiredFields: ['application_id', 'candidate_email', 'candidate_name', 'documents'],
    planGenerator: (goal, context) => {
      return [
        {
          action_type: 'send_document_request',
          action_order: 1,
          action_description: `Vraag documenten op bij ${goal.input_data.candidate_name}: ${goal.input_data.documents.join(', ')}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            application_id: goal.input_data.application_id,
            candidate_email: goal.input_data.candidate_email,
            candidate_name: goal.input_data.candidate_name,
            documents: goal.input_data.documents,
            deadline: goal.input_data.deadline,
            urgent: goal.input_data.urgent || false
          }
        }
      ];
    }
  },

  // Send general email
  'send_general_email': {
    requiredFields: ['recipient_email', 'recipient_name', 'subject'],
    planGenerator: (goal, context) => {
      return [
        {
          action_type: 'send_general_email',
          action_order: 1,
          action_description: `Stuur email naar ${goal.input_data.recipient_name}: ${goal.input_data.subject}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            recipient_email: goal.input_data.recipient_email,
            recipient_name: goal.input_data.recipient_name,
            subject: goal.input_data.subject,
            email_type: goal.input_data.email_type,
            ...goal.input_data
          }
        }
      ];
    }
  },

  // Create calendar event
  'create_calendar_event': {
    requiredFields: ['title', 'start_time', 'end_time', 'attendees'],
    planGenerator: (goal, context) => {
      return [
        {
          action_type: 'create_calendar_event',
          action_order: 1,
          action_description: `Maak kalenderafspraak: ${goal.input_data.title}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            title: goal.input_data.title,
            start_time: goal.input_data.start_time,
            end_time: goal.input_data.end_time,
            attendees: goal.input_data.attendees,
            location: goal.input_data.location,
            description: goal.input_data.description,
            is_online_meeting: goal.input_data.is_online_meeting || false
          }
        }
      ];
    }
  },

  'interview_reminder': {
    requiredFields: ['interview_id', 'scheduled_at', 'professional_id'],
    planGenerator: (goal, context) => {
      const interviewTime = new Date(goal.input_data.scheduled_at);
      const reminder24h = new Date(interviewTime.getTime() - 24 * 60 * 60 * 1000);
      const reminder1h = new Date(interviewTime.getTime() - 60 * 60 * 1000);
      const noShowCheck = new Date(interviewTime.getTime() + 15 * 60 * 1000);
      
      return [
        {
          action_type: 'send_reminder',
          action_order: 1,
          action_description: '24-hour interview reminder',
          scheduled_at: reminder24h.toISOString(),
          input_data: {
            reminder_type: '24h',
            channel: 'email', // Could be 'whatsapp' if configured
            interview_id: goal.input_data.interview_id,
            professional_id: goal.input_data.professional_id,
            message_template: 'interview_reminder_24h'
          }
        },
        {
          action_type: 'send_reminder',
          action_order: 2,
          action_description: '1-hour interview reminder',
          scheduled_at: reminder1h.toISOString(),
          input_data: {
            reminder_type: '1h',
            channel: 'email',
            interview_id: goal.input_data.interview_id,
            professional_id: goal.input_data.professional_id,
            message_template: 'interview_reminder_1h'
          }
        },
        {
          action_type: 'check_attendance',
          action_order: 3,
          action_description: 'Check if candidate attended interview',
          scheduled_at: noShowCheck.toISOString(),
          input_data: {
            interview_id: goal.input_data.interview_id,
            check_type: 'no_show'
          }
        }
      ];
    }
  },
  'candidate_onboarding': {
    requiredFields: ['professional_id'],
    planGenerator: (goal, context) => {
      const now = new Date();
      return [
        {
          action_type: 'send_welcome',
          action_order: 1,
          action_description: 'Send welcome message',
          scheduled_at: now.toISOString(),
          input_data: {
            professional_id: goal.input_data.professional_id,
            message_template: 'welcome_new_professional'
          }
        },
        {
          action_type: 'create_tasks',
          action_order: 2,
          action_description: 'Create onboarding tasks',
          scheduled_at: new Date(now.getTime() + 60 * 1000).toISOString(),
          input_data: {
            professional_id: goal.input_data.professional_id,
            task_template: 'onboarding_checklist'
          }
        },
        {
          action_type: 'schedule_followup',
          action_order: 3,
          action_description: 'Schedule 1-week followup',
          scheduled_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          input_data: {
            professional_id: goal.input_data.professional_id,
            followup_type: 'week_1_check'
          }
        }
      ];
    }
  },
  'proactive_matching': {
    requiredFields: ['professional_id'],
    planGenerator: (goal, context) => {
      return [
        {
          action_type: 'find_matches',
          action_order: 1,
          action_description: 'Find matching opportunities',
          scheduled_at: new Date().toISOString(),
          input_data: {
            professional_id: goal.input_data.professional_id,
            min_score: 70
          }
        },
        {
          action_type: 'send_opportunities',
          action_order: 2,
          action_description: 'Send matching opportunities to candidate',
          scheduled_at: null, // Execute after previous completes
          input_data: {
            professional_id: goal.input_data.professional_id,
            max_opportunities: 5
          }
        }
      ];
    }
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const { action, goal_id, limit = 10 } = body;

    console.log(`[AI Agent Orchestrator] Action: ${action}, Goal ID: ${goal_id}`);

    // Action: Process pending goals
    if (action === 'process_pending_goals' || !action) {
      return await processPendingGoals(supabase, limit);
    }

    // Action: Plan a specific goal
    if (action === 'plan_goal' && goal_id) {
      return await planGoal(supabase, goal_id);
    }

    // Action: Execute pending actions
    if (action === 'execute_actions') {
      return await executePendingActions(supabase, limit);
    }

    // Action: Process task queue
    if (action === 'process_queue') {
      return await processTaskQueue(supabase, limit);
    }

    // Action: Create a new goal manually
    if (action === 'create_goal') {
      return await createGoal(supabase, body);
    }

    return new Response(
      JSON.stringify({ 
        error: 'Unknown action',
        available_actions: ['process_pending_goals', 'plan_goal', 'execute_actions', 'process_queue', 'create_goal']
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[AI Agent Orchestrator] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Process all pending goals
async function processPendingGoals(supabase: any, limit: number) {
  const { data: goals, error } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const results: Array<{ goal_id: string; success: boolean; error?: string; actions_created?: number }> = [];
  for (const goal of goals || []) {
    try {
      const result = await planAndQueueGoal(supabase, goal);
      results.push({ goal_id: goal.id, success: true, actions_created: result.actions_created });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Orchestrator] Failed to process goal ${goal.id}:`, err);
      results.push({ goal_id: goal.id, success: false, error: errorMessage });
      
      // Mark goal as failed
      await supabase
        .from('agent_goals')
        .update({ status: 'failed', output_data: { error: errorMessage } })
        .eq('id', goal.id);
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Plan a specific goal
async function planGoal(supabase: any, goalId: string) {
  const { data: goal, error } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (error || !goal) {
    return new Response(
      JSON.stringify({ error: 'Goal not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const result = await planAndQueueGoal(supabase, goal);

  return new Response(
    JSON.stringify({ success: true, ...result }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Core planning logic
async function planAndQueueGoal(supabase: any, goal: AgentGoal) {
  const config = GOAL_CONFIGS[goal.goal_type];
  
  if (!config) {
    throw new Error(`Unknown goal type: ${goal.goal_type}`);
  }

  // Validate required fields
  for (const field of config.requiredFields) {
    if (!goal.input_data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Update goal status to planning
  await supabase
    .from('agent_goals')
    .update({ status: 'planning', started_at: new Date().toISOString() })
    .eq('id', goal.id);

  // Generate action plan
  const actions = config.planGenerator(goal, {});
  
  // Save plan to goal
  await supabase
    .from('agent_goals')
    .update({ plan: actions })
    .eq('id', goal.id);

  // Create action records
  const actionRecords = actions.map(action => ({
    goal_id: goal.id,
    action_type: action.action_type,
    action_order: action.action_order,
    action_description: action.action_description,
    scheduled_at: action.scheduled_at,
    input_data: action.input_data,
    status: 'pending'
  }));

  const { data: createdActions, error: actionsError } = await supabase
    .from('agent_actions')
    .insert(actionRecords)
    .select();

  if (actionsError) throw actionsError;

  // Queue first action(s) that are ready
  const now = new Date();
  for (const action of createdActions || []) {
    if (!action.scheduled_at || new Date(action.scheduled_at) <= now) {
      await queueAction(supabase, goal.id, action.id, action);
    } else {
      // Schedule future actions
      await supabase.from('agent_task_queue').insert({
        goal_id: goal.id,
        action_id: action.id,
        task_type: 'execute_action',
        priority: goal.priority,
        scheduled_at: action.scheduled_at,
        execute_after: action.scheduled_at,
        execution_data: action.input_data
      });
    }
  }

  // Update goal status to executing
  await supabase
    .from('agent_goals')
    .update({ status: 'executing' })
    .eq('id', goal.id);

  return {
    goal_id: goal.id,
    actions_created: createdActions?.length || 0,
    plan: actions
  };
}

// Queue an action for immediate execution
async function queueAction(supabase: any, goalId: string, actionId: string, action: any) {
  await supabase.from('agent_task_queue').insert({
    goal_id: goalId,
    action_id: actionId,
    task_type: 'execute_action',
    priority: 5,
    scheduled_at: new Date().toISOString(),
    execution_data: action.input_data
  });

  await supabase
    .from('agent_actions')
    .update({ status: 'queued' })
    .eq('id', actionId);
}

// Execute pending actions from the queue
async function executePendingActions(supabase: any, limit: number) {
  const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lockDuration = 5 * 60 * 1000; // 5 minutes
  
  // Lock tasks for processing
  const { data: tasks, error } = await supabase
    .from('agent_task_queue')
    .update({
      status: 'locked',
      locked_by: workerId,
      locked_until: new Date(Date.now() + lockDuration).toISOString()
    })
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .or('execute_after.is.null,execute_after.lte.' + new Date().toISOString())
    .order('priority', { ascending: false })
    .order('scheduled_at', { ascending: true })
    .limit(limit)
    .select();

  if (error) throw error;

  const results: Array<{ task_id: string; success: boolean; error?: string; result?: any }> = [];
  for (const task of tasks || []) {
    try {
      const result = await executeTask(supabase, task);
      results.push({ task_id: task.id, success: true, result });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Orchestrator] Task ${task.id} failed:`, err);
      results.push({ task_id: task.id, success: false, error: errorMessage });
      
      // Update task as failed
      await supabase
        .from('agent_task_queue')
        .update({
          status: 'failed',
          error_message: errorMessage,
          processed_at: new Date().toISOString()
        })
        .eq('id', task.id);
    }
  }

  return new Response(
    JSON.stringify({ executed: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Execute a single task
async function executeTask(supabase: any, task: any) {
  console.log(`[Orchestrator] Executing task ${task.id} (${task.task_type})`);

  // Get the action details
  const { data: action, error: actionError } = await supabase
    .from('agent_actions')
    .select('*, agent_goals(*)')
    .eq('id', task.action_id)
    .single();

  if (actionError || !action) {
    throw new Error('Action not found');
  }

  // Update action status
  await supabase
    .from('agent_actions')
    .update({ status: 'executing', started_at: new Date().toISOString() })
    .eq('id', action.id);

  let result;

  // Execute based on action type
  switch (action.action_type) {
    case 'send_followup_question': // Follow-up vragen voor incomplete applicaties
      result = await executeFollowupQuestion(supabase, action);
      break;
    
    case 'send_interview_email': // Interview email via send-interview-email (Resend)
      result = await executeInterviewEmail(supabase, action);
      break;
    
    case 'send_document_request': // Document request via send-ai-email
    case 'send_general_email': // General email via send-ai-email
    case 'send_reminder': // Reminders via send-ai-email
    case 'send_welcome': // Welcome email via send-ai-email
      result = await executeSendAiEmail(supabase, action);
      break;
    
    case 'create_calendar_event': // Calendar event via n8n/Microsoft Graph
      result = await executeExternalAction(supabase, action);
      break;
    
    case 'check_attendance':
      result = await checkAttendance(supabase, action);
      break;
    
    case 'find_matches':
      result = await findMatches(supabase, action);
      break;
    
    case 'create_tasks':
      result = await createOnboardingTasks(supabase, action);
      break;
    
    default:
      result = { status: 'skipped', reason: `Unknown action type: ${action.action_type}` };
  }

  // Update action as completed
  await supabase
    .from('agent_actions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_data: result
    })
    .eq('id', action.id);

  // Update task as completed
  await supabase
    .from('agent_task_queue')
    .update({
      status: 'completed',
      result_data: result,
      processed_at: new Date().toISOString()
    })
    .eq('id', task.id);

  // Check if goal is complete
  await checkGoalCompletion(supabase, action.goal_id);

  return result;
}

// =====================================================
// NEW: Execute Interview Email via send-interview-email (Resend)
// =====================================================
async function executeInterviewEmail(supabase: any, action: any) {
  const org_id = action.agent_goals?.org_id;
  let organization = 'citozorg';
  if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
  }

  console.log(`[Orchestrator] Sending interview email via Resend for ${organization}`);

  try {
    const { data, error } = await supabase.functions.invoke('send-interview-email', {
      body: {
        ...action.input_data,
        organization
      }
    });

    if (error) {
      console.error('[Orchestrator] send-interview-email failed:', error);
      throw error;
    }

    console.log('[Orchestrator] Interview email result:', data);
    return { executed_via: 'resend', organization, ...data };

  } catch (err: any) {
    console.error('[Orchestrator] Interview email failed:', err);
    return { 
      executed_via: 'failed', 
      error: err.message,
      organization
    };
  }
}

// =====================================================
// NEW: Execute AI Email via send-ai-email (Resend)
// =====================================================
async function executeSendAiEmail(supabase: any, action: any) {
  const org_id = action.agent_goals?.org_id;
  let organization = 'citozorg';
  if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
  }

  // Map action types to email types
  const emailTypeMap: Record<string, string> = {
    'send_document_request': 'document_request',
    'send_general_email': 'general',
    'send_reminder': 'followup_question',
    'send_welcome': 'welcome'
  };

  const emailType = emailTypeMap[action.action_type] || 'general';

  console.log(`[Orchestrator] Sending ${emailType} email via send-ai-email for ${organization}`);

  try {
    const { data, error } = await supabase.functions.invoke('send-ai-email', {
      body: {
        email_type: emailType,
        recipient_email: action.input_data.to_email || action.input_data.recipient_email || action.input_data.candidate_email,
        recipient_name: action.input_data.recipient_name || action.input_data.candidate_name,
        subject: action.input_data.subject || action.input_data.emailSubject,
        html_content: action.input_data.body || action.input_data.emailHtml,
        template_data: action.input_data,
        application_id: action.input_data.application_id,
        professional_id: action.input_data.professional_id,
        org_id: org_id
      }
    });

    if (error) {
      console.error('[Orchestrator] send-ai-email failed:', error);
      throw error;
    }

    console.log('[Orchestrator] AI email result:', data);
    return { executed_via: 'resend', email_type: emailType, organization, ...data };

  } catch (err: any) {
    console.error('[Orchestrator] AI email failed:', err);
    return { 
      executed_via: 'failed', 
      error: err.message,
      email_type: emailType,
      organization
    };
  }
}

// Execute external action via n8n-webhook-bridge (for calendar events only now)
async function executeExternalAction(supabase: any, action: any) {
  const org_id = action.agent_goals?.org_id;
  
  // Determine organization for n8n routing
  let organization = 'citozorg'; // default
  if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
  }

  console.log(`[Orchestrator] Executing external action via bridge: ${action.action_type} for ${organization}`);

  try {
    // Route through n8n-webhook-bridge for calendar events
    const { data, error } = await supabase.functions.invoke('n8n-webhook-bridge', {
      body: {
        action: 'trigger',
        action_type: action.action_type,
        action_id: action.id,
        org_id: org_id,
        organization: organization,
        input_data: action.input_data
      }
    });

    if (error) {
      console.error('[Orchestrator] Bridge invocation failed:', error);
      throw error;
    }

    console.log('[Orchestrator] Bridge response:', data);
    return { executed_via: 'n8n_bridge', organization, ...data };
    
  } catch (err) {
    console.error('[Orchestrator] External action failed:', err);
    return { executed_via: 'simulated', note: 'n8n bridge call failed, action simulated' };
  }
}

// Check interview attendance
async function checkAttendance(supabase: any, action: any) {
  const { data: interview } = await supabase
    .from('interview_appointments')
    .select('*')
    .eq('id', action.input_data.interview_id)
    .single();

  if (!interview) {
    return { status: 'skipped', reason: 'Interview not found' };
  }

  // If interview status is still 'scheduled', it's a potential no-show
  if (interview.status === 'scheduled') {
    // Create alert in business_intelligence
    await supabase.from('business_intelligence').insert({
      org_id: interview.org_id,
      intelligence_type: 'workflow_pattern',
      title: 'Mogelijke no-show gedetecteerd',
      description: `Kandidaat is niet verschenen voor interview`,
      severity: 'medium',
      priority: 'high',
      data: {
        interview_id: interview.id,
        scheduled_at: interview.scheduled_at,
        professional_id: interview.professional_id,
        category: 'no_show_detection'
      }
    });

    return { status: 'no_show_detected', interview_id: interview.id };
  }

  return { status: 'attended', interview_status: interview.status };
}

// =====================================================
// Execute Follow-up Question via send-ai-email (Resend)
// =====================================================
async function executeFollowupQuestion(supabase: any, action: any) {
  const { 
    application_id, 
    candidate_email, 
    candidate_name, 
    fields_to_ask,
    current_completeness,
    follow_up_count 
  } = action.input_data;

  console.log(`[Orchestrator] Executing follow-up question for ${candidate_email}`);
  console.log(`[Orchestrator] Fields to ask: ${fields_to_ask?.join(', ')}`);

  // Rate limiting: Max 3 follow-ups per application
  if (follow_up_count >= 3) {
    console.log(`[Orchestrator] Max follow-ups reached for application ${application_id}`);
    return { 
      status: 'skipped', 
      reason: 'Max follow-ups (3) reached',
      follow_up_count 
    };
  }

  const org_id = action.agent_goals?.org_id;
  let organization = 'citozorg';
  if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
  }

  console.log(`[Orchestrator] Sending followup via send-ai-email for ${organization}`);

  try {
    // Send directly via send-ai-email (Resend) instead of n8n
    const { data, error } = await supabase.functions.invoke('send-ai-email', {
      body: {
        email_type: 'followup_question',
        recipient_email: candidate_email,
        recipient_name: candidate_name || 'Sollicitant',
        subject: `Aanvullende informatie nodig voor je sollicitatie`,
        template_data: {
          fields_to_ask,
          current_completeness,
          follow_up_count: follow_up_count + 1
        },
        application_id,
        org_id
      }
    });

    if (error) {
      console.error('[Orchestrator] send-ai-email failed:', error);
      throw error;
    }

    console.log('[Orchestrator] Follow-up email result:', data);

    // Update application with follow-up count
    await supabase
      .from('professional_applications')
      .update({ 
        follow_up_count: (follow_up_count || 0) + 1,
        last_followup_at: new Date().toISOString()
      })
      .eq('id', application_id);

    return { 
      status: 'sent_via_resend', 
      organization,
      fields_asked: fields_to_ask,
      follow_up_count: follow_up_count + 1,
      ...data
    };

  } catch (err: any) {
    console.error('[Orchestrator] Followup send failed:', err);
    return { 
      status: 'failed', 
      error: err.message,
      organization
    };
  }
}

// Find matching opportunities for a professional
async function findMatches(supabase: any, action: any) {
  // This would integrate with the matching service
  // For now, return a placeholder
  return { status: 'matches_found', count: 0, note: 'Matching service integration pending' };
}

// Create onboarding tasks
async function createOnboardingTasks(supabase: any, action: any) {
  const { data: professional } = await supabase
    .from('professionals')
    .select('*, profiles:user_id(*)')
    .eq('id', action.input_data.professional_id)
    .single();

  if (!professional) {
    return { status: 'skipped', reason: 'Professional not found' };
  }

  // Create onboarding task
  const { data: task, error } = await supabase.from('tasks').insert({
    org_id: professional.org_id,
    title: `Onboarding: ${professional.full_name}`,
    description: 'Onboarding checklist voor nieuwe professional',
    priority: 'high',
    category: 'recruitment',
    status: 'todo'
  }).select().single();

  return { status: 'task_created', task_id: task?.id };
}

// Check if all actions for a goal are complete
async function checkGoalCompletion(supabase: any, goalId: string) {
  const { data: actions } = await supabase
    .from('agent_actions')
    .select('status')
    .eq('goal_id', goalId);

  const allComplete = actions?.every((a: { status: string }) =>
    a.status === 'completed' || a.status === 'skipped'
  );

  if (allComplete) {
    await supabase
      .from('agent_goals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success_score: 1.0
      })
      .eq('id', goalId);

    console.log(`[Orchestrator] Goal ${goalId} completed successfully`);
  }
}

// Process the task queue (called by cron)
async function processTaskQueue(supabase: any, limit: number) {
  // Release stale locks
  await supabase
    .from('agent_task_queue')
    .update({ status: 'pending', locked_by: null, locked_until: null })
    .eq('status', 'locked')
    .lt('locked_until', new Date().toISOString());

  // Execute pending actions
  return await executePendingActions(supabase, limit);
}

// Create a new goal manually
async function createGoal(supabase: any, body: any) {
  const { org_id, goal_type, goal_description, input_data, priority = 5 } = body;

  if (!org_id || !goal_type) {
    return new Response(
      JSON.stringify({ error: 'org_id and goal_type are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: goal, error } = await supabase
    .from('agent_goals')
    .insert({
      org_id,
      goal_type,
      goal_description: goal_description || `${goal_type} goal`,
      input_data: input_data || {},
      priority
    })
    .select()
    .single();

  if (error) throw error;

  // Immediately plan the goal
  const planResult = await planAndQueueGoal(supabase, goal);

  return new Response(
    JSON.stringify({ success: true, goal, ...planResult }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
