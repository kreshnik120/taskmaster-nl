import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * n8n Webhook Bridge
 * 
 * This function serves as the bridge between the AI Agent and n8n workflows.
 * It can:
 * 1. Receive triggers from the AI Agent and forward to n8n
 * 2. Receive callbacks from n8n and update action status
 * 3. List available n8n workflows
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

    // Parse body
    const body = await req.json().catch(() => ({}));

    console.log(`[n8n Bridge] Path: ${path}, Method: ${req.method}`);

    // Route: /trigger - Send action to n8n
    if (path === 'trigger' || body.action === 'trigger') {
      return await triggerN8nWorkflow(supabase, body);
    }

    // Route: /callback - Receive callback from n8n
    if (path === 'callback' || body.action === 'callback') {
      return await handleN8nCallback(supabase, body);
    }

    // Route: /workflows - List available n8n workflows
    if (path === 'workflows' || body.action === 'list_workflows') {
      return await listN8nWorkflows();
    }

    // Route: /test - Test n8n connection
    if (path === 'test' || body.action === 'test') {
      return await testN8nConnection();
    }

    // Default: Show available routes
    return new Response(
      JSON.stringify({
        message: 'n8n Webhook Bridge',
        available_actions: ['trigger', 'callback', 'list_workflows', 'test'],
        usage: {
          trigger: 'Forward an agent action to n8n',
          callback: 'Receive callback from n8n after action completion',
          list_workflows: 'List available n8n workflows',
          test: 'Test n8n connection'
        }
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

// Trigger an n8n workflow
async function triggerN8nWorkflow(supabase: any, body: any) {
  const { action_id, action_type, workflow_id, input_data } = body;

  // Get n8n configuration
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

  // Update action status
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

  // Map action types to n8n workflow IDs/paths
  const workflowMapping: Record<string, string> = {
    'send_reminder': 'interview-reminder',
    'send_welcome': 'welcome-message',
    'send_whatsapp': 'whatsapp-message',
    'send_email': 'email-sender',
    'send_interview_email': 'interview-email', // NEW: Interview confirmation email
    'slack_notification': 'slack-notify'
  };

  const targetWorkflow = workflow_id || workflowMapping[action_type] || 'default-webhook';
  const webhookUrl = n8nBaseUrl.includes('?') 
    ? n8nBaseUrl 
    : `${n8nBaseUrl}/${targetWorkflow}`;

  try {
    // Call n8n webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Action-ID': action_id || '',
        'X-Action-Type': action_type || ''
      },
      body: JSON.stringify({
        action_id,
        action_type,
        callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/n8n-webhook-bridge`,
        timestamp: new Date().toISOString(),
        ...input_data
      })
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

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
          workflow: targetWorkflow,
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

    // Update action status on failure
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
        workflow: targetWorkflow
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Handle callback from n8n
async function handleN8nCallback(supabase: any, body: any) {
  const { action_id, status, result, error } = body;

  console.log(`[n8n Bridge] Callback received for action ${action_id}: ${status}`);

  if (!action_id) {
    return new Response(
      JSON.stringify({ error: 'action_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get the action
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

  // Update action based on callback
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

    // Check if we should retry
    if (updateData.retry_count < action.max_retries) {
      updateData.status = 'pending'; // Will be retried
    }
  }

  await supabase
    .from('agent_actions')
    .update(updateData)
    .eq('id', action_id);

  // Check if goal is complete
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
      executed_via: 'n8n'
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

// Check if all actions for a goal are complete
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

// List available n8n workflows (via MCP if available)
async function listN8nWorkflows() {
  // This would integrate with n8n MCP to list workflows
  // For now, return a list of expected workflow types
  
  return new Response(
    JSON.stringify({
      workflows: [
        {
          id: 'interview-reminder',
          name: 'Interview Reminder',
          description: 'Sends interview reminder via WhatsApp/Email',
          triggers: ['send_reminder'],
          status: 'template'
        },
        {
          id: 'welcome-message',
          name: 'Welcome Message',
          description: 'Sends welcome message to new professionals',
          triggers: ['send_welcome'],
          status: 'template'
        },
        {
          id: 'whatsapp-message',
          name: 'WhatsApp Message',
          description: 'Generic WhatsApp message sender',
          triggers: ['send_whatsapp'],
          status: 'template'
        },
        {
          id: 'email-sender',
          name: 'Email Sender',
          description: 'Generic email sender',
          triggers: ['send_email'],
          status: 'template'
        }
      ],
      note: 'Connect your n8n instance and create these workflows to enable full automation'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Test n8n connection
async function testN8nConnection() {
  const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');
  
  if (!n8nWebhookUrl) {
    return new Response(
      JSON.stringify({
        status: 'not_configured',
        message: 'N8N_WEBHOOK_URL secret is not set',
        instructions: [
          '1. Go to your n8n instance',
          '2. Create a webhook workflow',
          '3. Copy the webhook URL',
          '4. Add N8N_WEBHOOK_URL secret in Lovable'
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
        test: true,
        timestamp: new Date().toISOString(),
        source: 'lovable-ai-agent'
      })
    });

    return new Response(
      JSON.stringify({
        status: 'connected',
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
