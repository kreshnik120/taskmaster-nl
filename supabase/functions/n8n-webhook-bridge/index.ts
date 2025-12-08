import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * n8n Webhook Bridge - Centrale Dispatcher Routing
 * 
 * Alle requests gaan naar de basis N8N_WEBHOOK_URL met gestandaardiseerd payload formaat.
 * n8n "My workflow" routeert intern op basis van action_type.
 * 
 * Ondersteunde action types:
 * - send_followup_question: Follow-up vragen voor incomplete intake
 * - send_interview_email: Interview uitnodigingen
 * - send_document_request: Documenten opvragen (VOG, diploma, CV)
 * - send_general_email: Algemene emails
 * - create_calendar_event: Calendar events aanmaken
 * - send_reminder: Herinneringen via email/WhatsApp
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    const body = await req.json().catch(() => ({}));

    console.log(`[n8n Bridge] Path: ${path}, Method: ${req.method}, Action: ${body.action || body.action_type}`);

    // Route: /trigger - Send action to n8n via central dispatcher
    if (path === 'trigger' || body.action === 'trigger') {
      return await triggerN8nWorkflow(supabase, body);
    }

    // Route: /callback - Receive callback from n8n
    if (path === 'callback' || body.action === 'callback') {
      return await handleN8nCallback(supabase, body);
    }

    // Route: /workflows - List available action types
    if (path === 'workflows' || body.action === 'list_workflows') {
      return await listAvailableActions();
    }

    // Route: /test - Test n8n connection
    if (path === 'test' || body.action === 'test') {
      return await testN8nConnection();
    }

    // Default response
    return new Response(
      JSON.stringify({
        message: 'n8n Webhook Bridge - Centrale Dispatcher',
        available_actions: ['trigger', 'callback', 'list_workflows', 'test'],
        supported_action_types: [
          'send_followup_question',
          'send_interview_email', 
          'send_document_request',
          'send_general_email',
          'create_calendar_event',
          'send_reminder'
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[n8n Bridge] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Trigger n8n workflow via centrale dispatcher
 * Alle requests gaan naar dezelfde basis URL met action_type in de body
 */
async function triggerN8nWorkflow(supabase: any, body: any) {
  const { action_id, action_type, input_data, org_id, organization } = body;

  const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_URL');
  
  if (!n8nBaseUrl) {
    console.log('[n8n Bridge] N8N_WEBHOOK_URL not configured');
    return new Response(
      JSON.stringify({ 
        status: 'not_configured',
        message: 'n8n webhook URL not configured. Set N8N_WEBHOOK_URL secret.',
        simulated: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update action status to executing
  if (action_id) {
    await supabase
      .from('agent_actions')
      .update({
        status: 'executing',
        started_at: new Date().toISOString(),
        webhook_url: n8nBaseUrl
      })
      .eq('id', action_id);
  }

  // Get org_id from action if not provided
  let effectiveOrgId = org_id;
  if (!effectiveOrgId && action_id) {
    const { data: action } = await supabase
      .from('agent_actions')
      .select('agent_goals(org_id)')
      .eq('id', action_id)
      .single();
    effectiveOrgId = action?.agent_goals?.org_id;
  }

  // Determine organization for n8n routing (lowercase for n8n Switch node)
  let effectiveOrganization = organization;
  if (!effectiveOrganization && effectiveOrgId) {
    // Map org_id to organization name for n8n routing
    if (effectiveOrgId === '550e8400-e29b-41d4-a716-446655440000') {
      effectiveOrganization = 'abczorg';
    } else {
      effectiveOrganization = 'citozorg'; // default
    }
  } else if (effectiveOrganization) {
    // Normalize to lowercase for n8n
    effectiveOrganization = effectiveOrganization.toLowerCase();
  }

  // Build standardized payload for n8n central dispatcher
  // Format matches what n8n "My workflow" expects
  const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/n8n-webhook-bridge`;
  
  const n8nPayload = {
    // action_data wrapper for n8n Switch node routing
    action_data: {
      action_type: action_type
    },
    
    // Input data with all fields
    input_data: input_data || {},
    
    // Organization for routing (lowercase for n8n)
    organization: effectiveOrganization || 'citozorg',
    
    // Additional metadata for callbacks
    action_id: action_id,
    org_id: effectiveOrgId,
    callback_url: callbackUrl,
    timestamp: new Date().toISOString(),
    
    // Also spread common fields for easy n8n access
    ...(input_data || {})
  };

  console.log(`[n8n Bridge] Sending to central dispatcher: ${action_type}`);
  console.log(`[n8n Bridge] Payload:`, JSON.stringify(n8nPayload, null, 2));

  try {
    // Send to central n8n dispatcher (no path suffix!)
    const response = await fetch(n8nBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Action-ID': action_id || '',
        'X-Action-Type': action_type || '',
        'X-Org-ID': effectiveOrgId || ''
      },
      body: JSON.stringify(n8nPayload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log(`[n8n Bridge] Response status: ${response.status}`);

    if (response.ok) {
      // Update action with external ID if provided
      if (action_id && responseData.execution_id) {
        await supabase
          .from('agent_actions')
          .update({ external_id: responseData.execution_id })
          .eq('id', action_id);
      }

      return new Response(
        JSON.stringify({
          status: 'triggered',
          action_type: action_type,
          dispatcher: 'central',
          n8n_response: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(`n8n returned ${response.status}: ${responseText}`);
    }

  } catch (error: unknown) {
    console.error('[n8n Bridge] Trigger failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (action_id) {
      await supabase
        .from('agent_actions')
        .update({
          status: 'failed',
          error_message: errorMessage
        })
        .eq('id', action_id);
    }

    return new Response(
      JSON.stringify({
        status: 'error',
        error: errorMessage,
        action_type: action_type
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle callback from n8n
 */
async function handleN8nCallback(supabase: any, body: any) {
  const { action_id, status, result, error } = body;

  console.log(`[n8n Bridge] Callback received for action ${action_id}: ${status}`);

  if (!action_id) {
    return new Response(
      JSON.stringify({ error: 'action_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: action, error: fetchError } = await supabase
    .from('agent_actions')
    .select('*, agent_goals(*)')
    .eq('id', action_id)
    .single();

  if (fetchError || !action) {
    return new Response(
      JSON.stringify({ error: 'Action not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const updateData: any = {
    callback_received: true,
    updated_at: new Date().toISOString()
  };

  if (status === 'success' || status === 'completed') {
    updateData.status = 'completed';
    updateData.completed_at = new Date().toISOString();
    updateData.output_data = result || {};
  } else if (status === 'failed' || status === 'error') {
    updateData.status = 'failed';
    updateData.error_message = error || 'Unknown error from n8n';
    updateData.retry_count = (action.retry_count || 0) + 1;

    if (updateData.retry_count < (action.max_retries || 3)) {
      updateData.status = 'pending';
    }
  }

  await supabase
    .from('agent_actions')
    .update(updateData)
    .eq('id', action_id);

  if (updateData.status === 'completed') {
    await checkGoalCompletion(supabase, action.goal_id);
  }

  // Log learning event
  await supabase.from('ai_learning_events').insert({
    org_id: action.agent_goals?.org_id,
    event_type: 'agent_action_completed',
    context: {
      action_id,
      action_type: action.action_type,
      goal_type: action.agent_goals?.goal_type,
      status: updateData.status,
      executed_via: 'n8n_central_dispatcher'
    },
    outcome: updateData.status === 'completed' ? 'success' : 'failure'
  });

  return new Response(
    JSON.stringify({
      status: 'callback_processed',
      action_status: updateData.status
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Check if all actions for a goal are complete
 */
async function checkGoalCompletion(supabase: any, goalId: string) {
  const { data: actions } = await supabase
    .from('agent_actions')
    .select('status')
    .eq('goal_id', goalId);

  const allComplete = actions?.every((a: any) => 
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

    console.log(`[n8n Bridge] Goal ${goalId} marked as completed`);
  }
}

/**
 * List available action types for n8n central dispatcher
 */
async function listAvailableActions() {
  return new Response(
    JSON.stringify({
      dispatcher: 'central',
      description: 'Alle requests gaan naar één n8n webhook. n8n routeert intern op action_type.',
      action_types: [
        {
          type: 'send_followup_question',
          description: 'Stuur AI-gegenereerde follow-up vragen voor incomplete intake',
          required_fields: ['to_email', 'candidate_name', 'missing_fields'],
          optional_fields: ['subject', 'questions']
        },
        {
          type: 'send_interview_email',
          description: 'Stuur interview uitnodiging naar kandidaat',
          required_fields: ['to_email', 'candidate_name', 'interview_datetime', 'location'],
          optional_fields: ['interviewer_name', 'notes', 'meeting_link']
        },
        {
          type: 'send_document_request',
          description: 'Vraag documenten op (VOG, diploma, CV)',
          required_fields: ['to_email', 'candidate_name', 'documents'],
          optional_fields: ['deadline', 'instructions']
        },
        {
          type: 'send_general_email',
          description: 'Stuur algemene email',
          required_fields: ['to_email', 'subject', 'body'],
          optional_fields: ['cc', 'attachments']
        },
        {
          type: 'create_calendar_event',
          description: 'Maak calendar event aan (met optionele Teams meeting)',
          required_fields: ['title', 'start_datetime', 'end_datetime'],
          optional_fields: ['attendees', 'location', 'description', 'create_teams_meeting']
        },
        {
          type: 'send_reminder',
          description: 'Stuur herinnering via email of WhatsApp',
          required_fields: ['to', 'message', 'channel'],
          optional_fields: ['scheduled_at']
        }
      ],
      payload_format: {
        action_type: 'string (required)',
        action_id: 'uuid (required)',
        org_id: 'uuid (optional)',
        callback_url: 'string (auto-generated)',
        input_data: 'object with action-specific fields'
      },
      callback_format: {
        action: 'callback',
        action_id: 'uuid',
        status: 'success | failed',
        result: 'object (optional)',
        error: 'string (if failed)'
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Test n8n connection
 */
async function testN8nConnection() {
  const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');
  
  if (!n8nWebhookUrl) {
    return new Response(
      JSON.stringify({
        status: 'not_configured',
        message: 'N8N_WEBHOOK_URL secret is not set',
        instructions: [
          '1. Ga naar je n8n instance',
          '2. Kopieer de webhook URL van je centrale "My workflow"',
          '3. Voeg N8N_WEBHOOK_URL secret toe in Lovable',
          '4. De URL moet zijn: https://citozorg.app.n8n.cloud/webhook'
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_data: {
          action_type: 'test'
        },
        input_data: {},
        organization: 'citozorg',
        action_id: 'test-connection',
        timestamp: new Date().toISOString(),
        source: 'lovable-ai-agent'
      })
    });

    return new Response(
      JSON.stringify({
        status: 'connected',
        dispatcher: 'central',
        webhook_url: n8nWebhookUrl.substring(0, 50) + '...',
        response_status: response.status,
        response_ok: response.ok
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        status: 'connection_failed',
        error: errorMessage,
        webhook_url: n8nWebhookUrl.substring(0, 50) + '...'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
