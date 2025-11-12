import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, reason } = await req.json();
    
    if (!['pause', 'resume', 'stop'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be pause, resume, or stop' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('❌ User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔒 SECURITY: Admin-only access control
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      console.error('❌ Non-admin user attempted orchestrator control:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔓 Admin access verified: ${user.id}`);

    // Get org_id
    const { data: orgData } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    if (!orgData?.org_id) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const org_id = orgData.org_id;
    console.log(`🎛️ Control action '${action}' for org: ${org_id}`);

    // Find current orchestrator state
    const { data: currentState } = await supabase
      .from('orchestrator_state')
      .select('*')
      .eq('org_id', org_id)
      .contains('metadata', { component: 'auto-backfill-orchestrator' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentState) {
      return new Response(
        JSON.stringify({ error: 'No orchestrator run found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const metadata = currentState.metadata || {};
    const now = new Date().toISOString();

    // Perform action
    let updateData: any = {};
    
    if (action === 'pause') {
      updateData = {
        status: 'paused',
        metadata: {
          ...metadata,
          pause_reason: reason || 'user_pause',
          paused_at: now,
          last_heartbeat: now,
          checkpoint_batch: currentState.current_batch,
          checkpoint_processed: currentState.total_items_processed,
          checkpoint_offset: metadata.current_offset || 0
        }
      };
      console.log('⏸️ Pausing orchestrator run');
    } else if (action === 'stop') {
      updateData = {
        status: 'idle',
        metadata: {
          ...metadata,
          archived_reason: reason || 'user_stop',
          stopped_at: now,
          last_heartbeat: now
        }
      };
      console.log('🛑 Stopping orchestrator run');
    } else if (action === 'resume') {
      updateData = {
        status: 'running',
        metadata: {
          ...metadata,
          resumed_at: now,
          last_heartbeat: now
        }
      };
      console.log('▶️ Resuming orchestrator run');
    }

    // Update state
    const { data: updatedState, error: updateError } = await supabase
      .from('orchestrator_state')
      .update(updateData)
      .eq('id', currentState.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    console.log(`✅ Action '${action}' completed successfully`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        action,
        status: updatedState.status,
        metadata: updatedState.metadata
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in orchestrator-control:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
