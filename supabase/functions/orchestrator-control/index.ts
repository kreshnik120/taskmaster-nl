import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 🔒 SECURITY: Validate input with Zod schema
    const OrchestratorControlSchema = z.object({
      action: z.enum(['pause', 'resume', 'stop']),
      reason: z.string().min(1).max(500).optional()
    });

    const rawBody = await req.json();
    const validation = OrchestratorControlSchema.safeParse(rawBody);
    
    if (!validation.success) {
      const errors = validation.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.error('❌ Validation failed:', errors);
      return errorResponse(`Validation failed: ${errors}`, 400);
    }
    
    const { action, reason } = validation.data;

    const supabase = createAdminClient();

    // Get user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('Authorization required', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('❌ User authentication failed:', userError);
      return errorResponse('Unauthorized', 401);
    }

    // 🔒 SECURITY: Admin-only access control
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      console.error('❌ Non-admin user attempted orchestrator control:', user.id);
      return errorResponse('Forbidden: Admin access required', 403);
    }

    console.log(`🔓 Admin access verified: ${user.id}`);

    // Get org_id
    const { data: orgData } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    if (!orgData?.org_id) {
      return errorResponse('No organization found', 404);
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
      return errorResponse('No orchestrator run found', 404);
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

    return jsonResponse({ 
      success: true, 
      action,
      status: updatedState.status,
      metadata: updatedState.metadata
    });

  } catch (error) {
    console.error('❌ Error in orchestrator-control:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
