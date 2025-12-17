import { corsHeaders, handleCors, createAdminClient } from '../_shared/core.ts';

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
  planGenerator: (goal: AgentGoal, context: any) => AgentAction[] | Promise<AgentAction[]>;
  requiredFields: string[];
}> = {
  // =====================================================
  // NEW: Welcome & Intake - Gecombineerde welkomst + informatieverzoek
  // =====================================================
  'send_welcome_and_intake': {
    requiredFields: ['application_id', 'candidate_email'],
    planGenerator: async (goal, context) => {
      // Get missing_info from input_data or fallback to database query
      let missingInfo = goal.input_data.missing_info || [];
      
      // FALLBACK: If missing_info is empty, query the database directly
      if (missingInfo.length === 0 && goal.input_data.application_id && context?.supabase) {
        console.log('📋 [Orchestrator] missing_info empty, querying database...');
        const { data: app } = await context.supabase
          .from('professional_applications')
          .select('missing_info, extracted_data')
          .eq('id', goal.input_data.application_id)
          .single();
        
        if (app?.missing_info && app.missing_info.length > 0) {
          missingInfo = app.missing_info;
          console.log('✅ [Orchestrator] Got missing_info from database:', missingInfo);
        } else if (app?.extracted_data) {
          const extractedData = app.extracted_data as Record<string, any>;
          const criticalFields = ['functie_niveau', 'werkvorm', 'regio', 'beschikbaarheid', 'telefoonnummer'];
          missingInfo = criticalFields.filter(field => !extractedData[field]);
          console.log('✅ [Orchestrator] Derived missing_info from extracted_data:', missingInfo);
        }
      }
      
      // Prioriteit volgorde voor vragen (kritieke velden eerst)
      const priorityFields = [
        'functie_niveau',    // Kritiek voor matching
        'werkvorm',          // Kritiek voor matching
        'regio',             // Kritiek voor matching
        'beschikbaarheid',   // Belangrijk voor plaatsing
        'telefoonnummer',    // Belangrijk voor contact
        'ervaring_sector',   // Belangrijk voor matching
        'doelgroep_ervaring',// Belangrijk voor matching
      ];
      
      // Filter en sorteer missing info op prioriteit
      const sortedMissing = [...missingInfo].sort((a: string, b: string) => {
        const aIndex = priorityFields.indexOf(a);
        const bIndex = priorityFields.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
      
      // Neem max 10 items per email
      const fieldsToAsk = sortedMissing.slice(0, 10);
      
      console.log('🎉 [Orchestrator] Welcome + Intake email, fields:', fieldsToAsk);
      
      return [
        {
          action_type: 'send_welcome_and_intake',
          action_order: 1,
          action_description: `Stuur welkomstmail met intake vragen aan ${goal.input_data.candidate_name || 'kandidaat'}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            application_id: goal.input_data.application_id,
            candidate_email: goal.input_data.candidate_email,
            candidate_name: goal.input_data.candidate_name,
            fields_to_ask: fieldsToAsk,
            all_missing_info: missingInfo,
            current_completeness: goal.input_data.current_completeness,
            email_type: 'welcome_and_intake',
            is_first_contact: true,
          }
        }
      ];
    }
  },

  // =====================================================
  // Application Intake Completion - Follow-up voor bestaande sollicitaties
  // =====================================================
  'application_intake_completion': {
    requiredFields: ['application_id', 'candidate_email'],
    planGenerator: async (goal, context) => {
      // Get missing_info from input_data or fallback to database query
      let missingInfo = goal.input_data.missing_info || [];
      
      // FALLBACK: If missing_info is empty, query the database directly
      if (missingInfo.length === 0 && goal.input_data.application_id && context?.supabase) {
        console.log('📋 [Orchestrator] missing_info empty, querying database...');
        const { data: app } = await context.supabase
          .from('professional_applications')
          .select('missing_info, extracted_data')
          .eq('id', goal.input_data.application_id)
          .single();
        
        if (app?.missing_info && app.missing_info.length > 0) {
          missingInfo = app.missing_info;
          console.log('✅ [Orchestrator] Got missing_info from database:', missingInfo);
        } else if (app?.extracted_data) {
          // Derive from extracted_data if missing_info column is empty
          const extractedData = app.extracted_data as Record<string, any>;
          const criticalFields = ['functie_niveau', 'werkvorm', 'regio', 'beschikbaarheid', 'telefoonnummer'];
          missingInfo = criticalFields.filter(field => !extractedData[field]);
          console.log('✅ [Orchestrator] Derived missing_info from extracted_data:', missingInfo);
        }
      }
      
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
      
      // Neem max 10 items per email (volledig overzicht voor kandidaat)
      const fieldsToAsk = sortedMissing.slice(0, 10);
      
      console.log('📧 [Orchestrator] Fields to ask:', fieldsToAsk, 'from missing:', missingInfo);
      
      return [
        {
          action_type: 'send_followup_question',
          action_order: 1,
          action_description: `Vraag ontbrekende info: ${fieldsToAsk.join(', ') || 'geen specifieke velden'}`,
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

  // =====================================================
  // NEW: Schedule Interview - AI-driven interview scheduling
  // =====================================================
  'schedule_interview': {
    requiredFields: ['application_id', 'candidate_email'],
    planGenerator: (goal, context) => {
      return [
        {
          action_type: 'request_interview_availability',
          action_order: 1,
          action_description: `Vraag beschikbaarheid aan ${goal.input_data.candidate_name || 'kandidaat'}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            application_id: goal.input_data.application_id,
            candidate_email: goal.input_data.candidate_email,
            candidate_name: goal.input_data.candidate_name,
            current_completeness: goal.input_data.current_completeness,
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

  // =====================================================
  // NEW: Professional Document Collection - Post-approval document gathering
  // =====================================================
  'professional_document_collection': {
    requiredFields: ['professional_id', 'candidate_email', 'candidate_name'],
    planGenerator: (goal, context) => {
      const missingDocs = goal.input_data.missing_documents || ['VOG (Verklaring Omtrent Gedrag)', 'Diploma/Certificaten'];
      const deadline = goal.input_data.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      return [
        {
          action_type: 'send_document_request',
          action_order: 1,
          action_description: `Vraag documenten op bij ${goal.input_data.candidate_name}: ${missingDocs.join(', ')}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            professional_id: goal.input_data.professional_id,
            application_id: goal.input_data.application_id,
            candidate_email: goal.input_data.candidate_email,
            candidate_name: goal.input_data.candidate_name,
            documents: missingDocs,
            deadline: deadline,
            urgent: false,
            email_type: 'professional_document_request',
            context: 'Je bent goedgekeurd als professional! Om je profiel compleet te maken hebben we nog enkele documenten nodig.'
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
  },

  // =====================================================
  // NEW: Request New VOG - Auto-triggered when VOG verification fails
  // =====================================================
  'request_new_vog': {
    requiredFields: ['application_id', 'candidate_email'],
    planGenerator: (goal, context) => {
      const rejectionReason = goal.input_data.rejection_reason || 'unknown';
      const reasonMessages: Record<string, string> = {
        'authentic_fail': 'niet authentiek bevonden door de GAAV verificatie',
        'expired': 'verlopen (ouder dan 3 maanden)',
        'format_error': 'niet leesbaar of beschadigd',
        'unknown': 'niet gevalideerd kunnen worden'
      };
      
      const reasonMessage = reasonMessages[rejectionReason] || reasonMessages['unknown'];
      
      return [
        {
          action_type: 'send_vog_rejection_email',
          action_order: 1,
          action_description: `Vraag nieuwe VOG aan bij ${goal.input_data.candidate_name || 'kandidaat'} - ${reasonMessage}`,
          scheduled_at: new Date().toISOString(),
          input_data: {
            application_id: goal.input_data.application_id,
            candidate_email: goal.input_data.candidate_email,
            candidate_name: goal.input_data.candidate_name,
            rejection_reason: rejectionReason,
            rejection_message: reasonMessage,
            vog_validation_details: goal.input_data.vog_validation_details,
            email_type: 'vog_rejection',
            subject: 'Je VOG document kon niet worden gevalideerd',
            urgent: rejectionReason === 'expired' // Expired is less urgent than fraud
          }
        }
      ];
    }
  }
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    const body = await req.json().catch(() => ({}));
    const { action, goal_id, limit = 10, force_execute_task_id } = body;

    console.log(`🤖 [AI Agent Orchestrator] Action: ${action}, Goal ID: ${goal_id}`);

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

    // Action: Force execute a specific task (bypass queue checks)
    if (action === 'force_execute' && force_execute_task_id) {
      return await forceExecuteTask(supabase, force_execute_task_id);
    }

    // Action: Process task queue
    if (action === 'process_queue') {
      return await processTaskQueue(supabase, limit);
    }

    // Action: Create a new goal manually
    if (action === 'create_goal') {
      return await createGoal(supabase, body);
    }

    // Action: Debug queue status
    if (action === 'debug_queue') {
      return await debugQueueStatus(supabase);
    }

    return new Response(
      JSON.stringify({ 
        error: 'Unknown action',
        available_actions: ['process_pending_goals', 'plan_goal', 'execute_actions', 'force_execute', 'process_queue', 'create_goal', 'debug_queue']
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('❌ [AI Agent Orchestrator] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Debug queue status
async function debugQueueStatus(supabase: any) {
  console.log('🔍 [DEBUG] Checking queue status...');
  
  // Get all queue items
  const { data: allQueue, error: queueError } = await supabase
    .from('agent_task_queue')
    .select('id, status, scheduled_at, execute_after, locked_by, created_at, task_type')
    .order('created_at', { ascending: false })
    .limit(20);

  // Get all pending actions
  const { data: allActions, error: actionsError } = await supabase
    .from('agent_actions')
    .select('id, action_type, status, scheduled_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const now = new Date().toISOString();
  
  // Count by status
  const queueByStatus = (allQueue || []).reduce((acc: any, item: any) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const actionsByStatus = (allActions || []).reduce((acc: any, item: any) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  console.log('📊 Queue status:', queueByStatus);
  console.log('📊 Actions status:', actionsByStatus);
  console.log('⏰ Current time:', now);

  return new Response(
    JSON.stringify({
      current_time: now,
      queue: {
        total: allQueue?.length || 0,
        by_status: queueByStatus,
        items: allQueue
      },
      actions: {
        total: allActions?.length || 0,
        by_status: actionsByStatus,
        items: allActions
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Process all pending goals
async function processPendingGoals(supabase: any, limit: number) {
  console.log('📋 [Orchestrator] Processing pending goals...');
  
  const { data: goals, error } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  console.log(`📋 Found ${goals?.length || 0} pending goals`);

  const results: Array<{ goal_id: string; success: boolean; error?: string; actions_created?: number }> = [];
  for (const goal of goals || []) {
    try {
      const result = await planAndQueueGoal(supabase, goal);
      results.push({ goal_id: goal.id, success: true, actions_created: result.actions_created });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ [Orchestrator] Failed to process goal ${goal.id}:`, err);
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

  // Generate action plan (may be async for some goal types)
  const actions = await Promise.resolve(config.planGenerator(goal, { supabase }));
  
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

  console.log(`✅ Created ${createdActions?.length || 0} actions for goal ${goal.id}`);

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
  console.log(`📥 Queueing action ${actionId} for immediate execution`);
  
  await supabase.from('agent_task_queue').insert({
    goal_id: goalId,
    action_id: actionId,
    task_type: 'execute_action',
    priority: 5,
    status: 'pending',
    scheduled_at: new Date().toISOString(),
    execution_data: action.input_data
  });

  await supabase
    .from('agent_actions')
    .update({ status: 'queued' })
    .eq('id', actionId);
}

// Execute pending actions from the queue - IMPROVED with better logging and query
async function executePendingActions(supabase: any, limit: number) {
  const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lockDuration = 5 * 60 * 1000; // 5 minutes
  const now = new Date();
  const nowIso = now.toISOString();
  
  console.log(`🔄 [Execute] Starting execution with worker ${workerId}`);
  console.log(`⏰ [Execute] Current time: ${nowIso}`);

  // STEP 1: First, find eligible tasks (separate SELECT)
  const { data: eligibleTasks, error: findError } = await supabase
    .from('agent_task_queue')
    .select('id, status, scheduled_at, execute_after, task_type, action_id')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (findError) {
    console.error('❌ [Execute] Error finding tasks:', findError);
    throw findError;
  }

  console.log(`📊 [Execute] Found ${eligibleTasks?.length || 0} pending tasks in queue`);
  
  if (!eligibleTasks || eligibleTasks.length === 0) {
    return new Response(
      JSON.stringify({ 
        executed: 0, 
        message: 'No pending tasks in queue',
        debug: { current_time: nowIso }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Log each task's timing
  for (const task of eligibleTasks) {
    const scheduledAt = task.scheduled_at ? new Date(task.scheduled_at) : null;
    const executeAfter = task.execute_after ? new Date(task.execute_after) : null;
    const isReady = (!scheduledAt || scheduledAt <= now) && (!executeAfter || executeAfter <= now);
    
    console.log(`📋 Task ${task.id.slice(0, 8)}... | scheduled: ${task.scheduled_at} | execute_after: ${task.execute_after} | ready: ${isReady}`);
  }

  // STEP 2: Filter tasks that are ready to execute
  const readyTasks = eligibleTasks.filter((task: any) => {
    const scheduledAt = task.scheduled_at ? new Date(task.scheduled_at) : null;
    const executeAfter = task.execute_after ? new Date(task.execute_after) : null;
    return (!scheduledAt || scheduledAt <= now) && (!executeAfter || executeAfter <= now);
  });

  console.log(`✅ [Execute] ${readyTasks.length} tasks are ready for execution`);

  if (readyTasks.length === 0) {
    return new Response(
      JSON.stringify({ 
        executed: 0, 
        message: 'Tasks found but none are ready yet (scheduled for future)',
        pending_count: eligibleTasks.length,
        debug: { current_time: nowIso }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // STEP 3: Lock and process ready tasks
  const results: Array<{ task_id: string; success: boolean; error?: string; result?: any }> = [];
  
  for (const task of readyTasks) {
    try {
      // Lock this specific task
      const { error: lockError } = await supabase
        .from('agent_task_queue')
        .update({
          status: 'locked',
          locked_by: workerId,
          locked_until: new Date(Date.now() + lockDuration).toISOString()
        })
        .eq('id', task.id)
        .eq('status', 'pending'); // Only lock if still pending

      if (lockError) {
        console.error(`❌ [Execute] Failed to lock task ${task.id}:`, lockError);
        continue;
      }

      console.log(`🔒 [Execute] Locked task ${task.id}, executing...`);

      // Execute the task
      const result = await executeTask(supabase, task);
      results.push({ task_id: task.id, success: true, result });
      
      console.log(`✅ [Execute] Task ${task.id} completed successfully`);
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ [Execute] Task ${task.id} failed:`, err);
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

  console.log(`🏁 [Execute] Finished. Executed ${results.length} tasks`);

  return new Response(
    JSON.stringify({ 
      executed: results.length, 
      results,
      debug: { 
        current_time: nowIso,
        worker_id: workerId,
        pending_found: eligibleTasks.length,
        ready_count: readyTasks.length
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Force execute a specific task (bypass queue checks)
async function forceExecuteTask(supabase: any, taskId: string) {
  console.log(`🔧 [Force Execute] Task ${taskId}`);

  // Get the task
  const { data: task, error: taskError } = await supabase
    .from('agent_task_queue')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return new Response(
      JSON.stringify({ error: 'Task not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`📋 [Force Execute] Task found: ${task.task_type}, status: ${task.status}`);

  try {
    // Update status to locked
    await supabase
      .from('agent_task_queue')
      .update({ status: 'locked', locked_by: 'force-execute' })
      .eq('id', taskId);

    // Execute the task
    const result = await executeTask(supabase, task);

    return new Response(
      JSON.stringify({ success: true, task_id: taskId, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`❌ [Force Execute] Failed:`, err);
    
    await supabase
      .from('agent_task_queue')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', taskId);

    return new Response(
      JSON.stringify({ success: false, task_id: taskId, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Process task queue (includes scheduled tasks)
async function processTaskQueue(supabase: any, limit: number) {
  console.log('📋 [Process Queue] Starting...');
  
  // First process pending goals
  await processPendingGoals(supabase, limit);
  
  // Then execute pending actions
  return await executePendingActions(supabase, limit);
}

// Execute a single task
async function executeTask(supabase: any, task: any) {
  console.log(`⚙️ [Execute Task] ${task.id} (${task.task_type})`);

  // Get the action details
  const { data: action, error: actionError } = await supabase
    .from('agent_actions')
    .select('*, agent_goals(*)')
    .eq('id', task.action_id)
    .single();

  if (actionError || !action) {
    console.error(`❌ [Execute Task] Action not found for task ${task.id}:`, actionError);
    throw new Error('Action not found');
  }

  console.log(`📧 [Execute Task] Action type: ${action.action_type}`);

  // Update action status
  await supabase
    .from('agent_actions')
    .update({ status: 'executing', started_at: new Date().toISOString() })
    .eq('id', action.id);

  let result;

  // Execute based on action type
  switch (action.action_type) {
    case 'send_welcome_and_intake': // Welkomstmail + intake vragen voor nieuwe applicaties
      result = await executeWelcomeAndIntake(supabase, action);
      break;
    
    case 'send_followup_question': // Follow-up vragen voor incomplete applicaties
      result = await executeFollowupQuestion(supabase, action);
      break;
    
    case 'request_interview_availability': // Request interview availability via schedule-interview
      result = await executeRequestInterviewAvailability(supabase, action);
      break;
    
    case 'send_interview_email': // Interview email via send-interview-email (Resend)
      result = await executeInterviewEmail(supabase, action);
      break;
    
    case 'send_document_request': // Document request via send-ai-email
    case 'send_general_email': // General email via send-ai-email
    case 'send_reminder': // Reminders via send-ai-email
    case 'send_welcome': // Welcome email via send-ai-email
    case 'send_vog_rejection_email': // VOG rejection notification via send-ai-email
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
      console.warn(`⚠️ [Execute Task] Unknown action type: ${action.action_type}`);
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
// Execute Follow-up Question via send-ai-email
// ENHANCED: Added deduplication check to prevent duplicate emails
// =====================================================
async function executeFollowupQuestion(supabase: any, action: any) {
  const applicationId = action.input_data.application_id;
  
  // 🔧 FIX: Get organization from application's assigned_organization OR fallback to org_id
  let organization = 'citozorg';
  let org_name = 'CitoZorg';
  
  // First try to get from application's extracted_data.assigned_organization
  if (applicationId) {
    const { data: appData } = await supabase
      .from('professional_applications')
      .select('extracted_data, org_id')
      .eq('id', applicationId)
      .single();
    
    if (appData?.extracted_data?.assigned_organization) {
      const assignedOrg = appData.extracted_data.assigned_organization.toLowerCase();
      if (assignedOrg.includes('abc')) {
        organization = 'abczorg';
        org_name = 'ABCzorg';
      }
      console.log(`📧 [Followup] Using assigned_organization: ${org_name}`);
    } else if (appData?.org_id === '550e8400-e29b-41d4-a716-446655440000') {
      organization = 'abczorg';
      org_name = 'ABCzorg';
      console.log(`📧 [Followup] Using org_id fallback: ${org_name}`);
    }
  }
  
  // Fallback to goal's org_id
  const goal_org_id = action.agent_goals?.org_id;
  if (organization === 'citozorg' && goal_org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
    org_name = 'ABCzorg';
  }

  console.log(`📧 [Followup] Organization determined: ${org_name}`);
  
  // 🔧 FIX: Get candidate_name from extracted_data if not provided (fixes "Beste null" bug)
  let candidateName = action.input_data.candidate_name;
  if (!candidateName && applicationId) {
    const { data: nameData } = await supabase
      .from('professional_applications')
      .select('extracted_data, email')
      .eq('id', applicationId)
      .single();
    
    if (nameData) {
      // Fallback chain: naam → full_name → email prefix → 'sollicitant'
      candidateName = nameData.extracted_data?.naam 
        || nameData.extracted_data?.full_name
        || (nameData.email ? nameData.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null)
        || 'sollicitant';
      console.log(`📧 [Followup] Resolved candidate name: ${candidateName}`);
    }
  }
  candidateName = candidateName || 'sollicitant';
  
  console.log(`📧 [Followup] Checking for recent emails before sending...`);

  // 🔒 DEDUPLICATION CHECK: Skip if email was sent recently (within 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentEmails } = await supabase
    .from('application_conversations')
    .select('id, created_at, content')
    .eq('application_id', applicationId)
    .eq('role', 'assistant')
    .gte('created_at', oneHourAgo)
    .ilike('content', '%Email verzonden%')
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentEmails && recentEmails.length > 0) {
    console.log(`⚠️ [Followup] SKIPPING - Recent email found at ${recentEmails[0].created_at}`);
    return { 
      executed_via: 'skipped', 
      reason: 'Recent email already sent (within 1 hour)',
      last_email_at: recentEmails[0].created_at,
      organization: org_name
    };
  }

  console.log(`📧 [Followup] No recent email found, proceeding to send...`);

  try {
    // Generate followup email using generate-followup-email
    const { data: emailData, error: genError } = await supabase.functions.invoke('generate-followup-email', {
      body: {
        application_id: applicationId,
        candidate_email: action.input_data.candidate_email,
        fields_to_ask: action.input_data.fields_to_ask,
        candidate_name: candidateName,
        current_completeness: action.input_data.current_completeness,
        org_name: org_name
      }
    });

    if (genError) {
      console.error('[Followup] Email generation failed:', genError);
      throw genError;
    }

    console.log('[Followup] Email generated, sending via Resend...');

    // Send via send-ai-email
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-ai-email', {
      body: {
        email_type: 'followup_question',
        recipient_email: action.input_data.candidate_email,
        recipient_name: action.input_data.candidate_name,
        subject: emailData?.emailSubject || `Aanvullende informatie nodig - ${action.input_data.candidate_name}`,
        html_content: emailData?.emailHtml,
        plain_text: emailData?.emailPlainText,
        application_id: action.input_data.application_id,
        org_id: action.agent_goals?.org_id
      }
    });

    if (sendError) {
      console.error('[Followup] Email send failed:', sendError);
      throw sendError;
    }

    console.log('✅ [Followup] Email sent successfully');
    return { 
      executed_via: 'resend', 
      organization, 
      email_generated: !!emailData,
      email_sent: !!sendData,
      ...sendData 
    };

  } catch (err: any) {
    console.error('❌ [Followup] Failed:', err);
    return { 
      executed_via: 'failed', 
      error: err.message,
      organization
    };
  }
}

// =====================================================
// Execute Welcome & Intake Email - Gecombineerde welkomst + informatieverzoek
// ENHANCED: Added deduplication check to prevent duplicate welcome emails
// =====================================================
async function executeWelcomeAndIntake(supabase: any, action: any) {
  const applicationId = action.input_data.application_id;
  
  // 🔧 FIX: Get organization from application's assigned_organization OR fallback to org_id
  let organization = 'citozorg';
  let org_name = 'CitoZorg';
  
  // First try to get from application's extracted_data.assigned_organization
  if (applicationId) {
    const { data: appData } = await supabase
      .from('professional_applications')
      .select('extracted_data, org_id')
      .eq('id', applicationId)
      .single();
    
    if (appData?.extracted_data?.assigned_organization) {
      const assignedOrg = appData.extracted_data.assigned_organization.toLowerCase();
      if (assignedOrg.includes('abc')) {
        organization = 'abczorg';
        org_name = 'ABCzorg';
      }
      console.log(`🎉 [Welcome] Using assigned_organization: ${org_name}`);
    } else if (appData?.org_id === '550e8400-e29b-41d4-a716-446655440000') {
      organization = 'abczorg';
      org_name = 'ABCzorg';
      console.log(`🎉 [Welcome] Using org_id fallback: ${org_name}`);
    }
  }
  
  // Fallback to goal's org_id
  const goal_org_id = action.agent_goals?.org_id;
  if (organization === 'citozorg' && goal_org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
    org_name = 'ABCzorg';
  }

  console.log(`🎉 [Welcome] Organization determined: ${org_name}`);
  console.log(`🎉 [Welcome] Checking for existing welcome emails...`);

  // 🔒 DEDUPLICATION CHECK: Skip if welcome email was already sent (any time)
  const { data: existingWelcome } = await supabase
    .from('application_conversations')
    .select('id, created_at')
    .eq('application_id', applicationId)
    .eq('role', 'assistant')
    .or('content.ilike.%Welkom bij%,content.ilike.%Welcome%')
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingWelcome && existingWelcome.length > 0) {
    console.log(`⚠️ [Welcome] SKIPPING - Welcome email already sent at ${existingWelcome[0].created_at}`);
    return { 
      executed_via: 'skipped', 
      reason: 'Welcome email already sent previously',
      sent_at: existingWelcome[0].created_at,
      organization: org_name
    };
  }

  console.log(`🎉 [Welcome] No existing welcome email, proceeding to send for ${org_name}...`);

  try {
    // Generate welcome + intake email using generate-followup-email with welcome type
    const { data: emailData, error: genError } = await supabase.functions.invoke('generate-followup-email', {
      body: {
        application_id: applicationId,
        candidate_email: action.input_data.candidate_email,
        candidate_name: action.input_data.candidate_name,
        fields_to_ask: action.input_data.fields_to_ask || [],
        current_completeness: action.input_data.current_completeness,
        email_type: 'welcome_and_intake',
        is_first_contact: true,
        org_name: org_name
      }
    });

    if (genError) {
      console.error('[Welcome] Email generation failed:', genError);
      throw genError;
    }

    console.log('[Welcome] Email generated, sending via Resend...');

    // Send via send-ai-email
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-ai-email', {
      body: {
        email_type: 'welcome',
        recipient_email: action.input_data.candidate_email,
        recipient_name: action.input_data.candidate_name,
        subject: emailData?.emailSubject || `Welkom bij ${org_name} - Je sollicitatie is ontvangen!`,
        html_content: emailData?.emailHtml,
        plain_text: emailData?.emailPlainText,
        application_id: action.input_data.application_id,
        org_id: action.agent_goals?.org_id
      }
    });

    if (sendError) {
      console.error('[Welcome] Email send failed:', sendError);
      throw sendError;
    }

    console.log('✅ [Welcome] Welcome email sent successfully');
    return { 
      executed_via: 'resend', 
      organization, 
      email_type: 'welcome_and_intake',
      email_generated: !!emailData,
      email_sent: !!sendData,
      fields_asked: action.input_data.fields_to_ask?.length || 0,
      ...sendData 
    };

  } catch (err: any) {
    console.error('❌ [Welcome] Failed:', err);
    return { 
      executed_via: 'failed', 
      error: err.message,
      organization
    };
  }
}

// =====================================================
// Execute Request Interview Availability via schedule-interview
// =====================================================
async function executeRequestInterviewAvailability(supabase: any, action: any) {
  const org_id = action.agent_goals?.org_id;
  let organization = 'citozorg';
  if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
  }

  console.log(`🗓️ [Interview] Requesting availability for ${action.input_data.candidate_name}`);

  try {
    // Call schedule-interview edge function with action: request_availability
    const { data, error } = await supabase.functions.invoke('schedule-interview', {
      body: {
        action: 'request_availability',
        application_id: action.input_data.application_id,
        candidate_email: action.input_data.candidate_email,
        candidate_name: action.input_data.candidate_name,
        organization
      }
    });

    if (error) {
      console.error('[Interview] Request availability failed:', error);
      throw error;
    }

    console.log('✅ [Interview] Availability request sent');
    return { 
      executed_via: 'schedule-interview', 
      organization, 
      slots_offered: data?.slots?.length || 0,
      email_sent: data?.email_sent,
      ...data 
    };

  } catch (err: any) {
    console.error('❌ [Interview] Failed:', err);
    return { 
      executed_via: 'failed', 
      error: err.message,
      organization
    };
  }
}

// =====================================================
// Execute Interview Email via send-interview-email (Resend)
// =====================================================
async function executeInterviewEmail(supabase: any, action: any) {
  const org_id = action.agent_goals?.org_id;
  let organization = 'citozorg';
  if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
    organization = 'abczorg';
  }

  console.log(`📧 [Interview] Sending interview email via Resend for ${organization}`);

  try {
    const { data, error } = await supabase.functions.invoke('send-interview-email', {
      body: {
        ...action.input_data,
        organization
      }
    });

    if (error) {
      console.error('[Interview] send-interview-email failed:', error);
      throw error;
    }

    console.log('✅ [Interview] Email sent:', data);
    return { executed_via: 'resend', organization, ...data };

  } catch (err: any) {
    console.error('❌ [Interview] Email failed:', err);
    return { 
      executed_via: 'failed', 
      error: err.message,
      organization
    };
  }
}

// =====================================================
// Execute AI Email via send-ai-email (Resend)
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

  console.log(`📧 [AI Email] Sending ${emailType} email via send-ai-email for ${organization}`);

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
      console.error('[AI Email] send-ai-email failed:', error);
      throw error;
    }

    console.log('✅ [AI Email] Result:', data);
    return { executed_via: 'resend', email_type: emailType, organization, ...data };

  } catch (err: any) {
    console.error('❌ [AI Email] Failed:', err);
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

  console.log(`🌐 [External] Executing via n8n bridge: ${action.action_type} for ${organization}`);

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
      console.error('[External] Bridge invocation failed:', error);
      throw error;
    }

    console.log('✅ [External] Bridge response:', data);
    return { executed_via: 'n8n_bridge', organization, ...data };
    
  } catch (err) {
    console.error('❌ [External] Action failed:', err);
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
      intelligence_type: 'no_show_alert',
      title: `Mogelijke no-show: ${interview.id}`,
      description: 'Interview was gepland maar status is nog steeds "scheduled" na de geplande tijd',
      data: { interview_id: interview.id, scheduled_at: interview.scheduled_at },
      severity: 'warning'
    });

    return { status: 'alert_created', interview_status: interview.status };
  }

  return { status: 'checked', interview_status: interview.status };
}

// Find matching opportunities for a professional
async function findMatches(supabase: any, action: any) {
  // This would integrate with the matching service
  // For now, return a placeholder
  console.log(`🔍 [Find Matches] Finding matches for professional ${action.input_data.professional_id}`);
  
  return { 
    status: 'completed', 
    matches_found: 0,
    note: 'Matching integration pending'
  };
}

// Create onboarding tasks
async function createOnboardingTasks(supabase: any, action: any) {
  console.log(`📝 [Onboarding] Creating tasks for professional ${action.input_data.professional_id}`);
  
  // Get the default org_id
  const org_id = '550e8400-e29b-41d4-a716-446655440000';
  
  const onboardingTasks = [
    { title: 'VOG aanvragen', category: 'Onboarding' },
    { title: 'BIG-registratie verifiëren', category: 'Onboarding' },
    { title: 'Contractdocumenten verzamelen', category: 'Onboarding' },
  ];

  for (const taskTemplate of onboardingTasks) {
    await supabase.from('tasks').insert({
      org_id: org_id,
      title: taskTemplate.title,
      category: taskTemplate.category,
      priority: 'medium',
      status: 'pending',
      description: `Onboarding taak voor professional ${action.input_data.professional_id}`
    });
  }

  return { status: 'completed', tasks_created: onboardingTasks.length };
}

// Check if all actions for a goal are complete
async function checkGoalCompletion(supabase: any, goalId: string) {
  const { data: actions } = await supabase
    .from('agent_actions')
    .select('status')
    .eq('goal_id', goalId);

  if (!actions || actions.length === 0) return;

  const allCompleted = actions.every((a: any) => a.status === 'completed');
  const anyFailed = actions.some((a: any) => a.status === 'failed');

  if (allCompleted) {
    await supabase
      .from('agent_goals')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString() 
      })
      .eq('id', goalId);
    console.log(`🎉 [Goal] ${goalId} completed!`);
  } else if (anyFailed) {
    await supabase
      .from('agent_goals')
      .update({ status: 'partially_failed' })
      .eq('id', goalId);
    console.log(`⚠️ [Goal] ${goalId} partially failed`);
  }
}

// Create a new goal
async function createGoal(supabase: any, body: any) {
  const { goal_type, goal_description, input_data, priority = 5, org_id } = body;

  if (!goal_type || !goal_description || !input_data) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: goal_type, goal_description, input_data' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate goal type
  if (!GOAL_CONFIGS[goal_type]) {
    return new Response(
      JSON.stringify({ 
        error: `Unknown goal type: ${goal_type}`,
        available_types: Object.keys(GOAL_CONFIGS)
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: goal, error } = await supabase
    .from('agent_goals')
    .insert({
      org_id: org_id || '550e8400-e29b-41d4-a716-446655440000',
      goal_type,
      goal_description,
      input_data,
      priority,
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ [Create Goal] Created goal ${goal.id} of type ${goal_type}`);

  return new Response(
    JSON.stringify({ success: true, goal }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
