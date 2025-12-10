import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    console.log('🔍 [AUTONOMOUS-AI] Checking for paused backfill runs AND missing embeddings...');

    // LAAG 3.3: Check voor items zonder embeddings (prioriteer nieuwe items)
    const { data: kbItems } = await supabase
      .from('ai_knowledge_base')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (kbItems && kbItems.length > 0) {
      const { data: existingEmb } = await supabase
        .from('knowledge_embeddings')
        .select('knowledge_id')
        .in('knowledge_id', kbItems.map(k => k.id));
      
      const existingSet = new Set(existingEmb?.map(e => e.knowledge_id) || []);
      const missingIds = kbItems.filter(k => !existingSet.has(k.id)).map(k => k.id);
      
      if (missingIds.length > 0) {
        console.log(`🔄 [AUTONOMOUS-AI] Found ${missingIds.length} missing embeddings, triggering batch generation...`);
        
        await supabase.functions.invoke('generate-embedding', {
          body: { knowledge_ids: missingIds }
        });
        
        console.log(`✅ [AUTONOMOUS-AI] Queued ${missingIds.length} items for embedding generation`);
      } else {
        console.log(`✅ [AUTONOMOUS-AI] All checked items have embeddings`);
      }
    }

    // Find paused OR running with stale heartbeat (>5 min)
    const { data: allRuns, error: queryError } = await supabase
      .from('orchestrator_state')
      .select('*')
      .in('status', ['paused', 'running'])
      .contains('metadata', { component: 'auto-backfill-orchestrator' })
      .order('created_at', { ascending: false })
      .limit(10);

    if (queryError) {
      throw queryError;
    }

    // Filter runs that need restart: paused OR stale heartbeat
    const pausedRuns = allRuns?.filter(run => {
      if (run.status === 'paused') return true;
      
      const lastHeartbeat = run.metadata?.last_heartbeat;
      if (run.status === 'running' && lastHeartbeat) {
        const isStale = (Date.now() - new Date(lastHeartbeat).getTime()) > 5 * 60 * 1000;
        if (isStale) {
          console.log(`⚠️ Stale heartbeat detected for run ${run.id}: ${lastHeartbeat}`);
          return true;
        }
      }
      return false;
    }) || [];

    if (pausedRuns.length === 0) {
      console.log('✅ No paused runs found');
      return jsonResponse({ 
        success: true, 
        message: 'No paused runs to restart',
        checked_at: new Date().toISOString()
      });
    }

    console.log(`📊 Found ${pausedRuns.length} run(s) needing restart`);

    const startTime = Date.now();
    const results = [];
    
    for (const run of pausedRuns) {
      try {
        const org_id = run.org_id;
        const metadata = run.metadata || {};
        const isStaleHeartbeat = run.status === 'running';
        
        if (isStaleHeartbeat) {
          console.log(`⚠️ Stale heartbeat detected, forcing reset for run ${run.id}`);
          await supabase
            .from('orchestrator_state')
            .update({
              status: 'error',
              metadata: {
                ...metadata,
                error: 'Heartbeat timeout - auto-recovered by cron',
                stalled_at: new Date().toISOString(),
                last_heartbeat: metadata.last_heartbeat
              }
            })
            .eq('id', run.id);
        }
        
        console.log(`🔄 Restarting auto-backfill for org ${org_id} (status was: ${run.status})...`);

        // Generate HMAC signature for internal call
        const message = `${org_id}:auto-backfill`;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const messageData = encoder.encode(message);
        
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        
        const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const signature = Array.from(new Uint8Array(signatureBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        console.log(`🔐 Generated HMAC signature for org ${org_id}`);

        const { data: restartData, error: restartError } = await supabase.functions.invoke(
          'auto-backfill-orchestrator',
          {
            body: { 
              batch_size: metadata.batch_size || 25,
              force_restart: false
            },
            headers: {
              'x-org-id': org_id,
              'x-internal-signature': signature
            }
          }
        );

        if (restartError) {
          throw restartError;
        }

        results.push({
          org_id,
          status: 'restarted',
          message: restartData?.message || 'Restarted successfully',
          checkpoint: {
            batch: metadata.checkpoint_batch,
            processed: metadata.checkpoint_processed
          }
        });

        console.log(`✅ Auto-backfill restarted for org ${org_id}`);
      } catch (err) {
        console.error(`❌ Failed to restart for org ${run.org_id}:`, err);
        results.push({
          org_id: run.org_id,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    // Log to function_call_logs for visibility
    const executionTime = Date.now() - startTime;
    try {
      await supabase.from('function_call_logs').insert({
        function_name: 'auto-restart-backfill',
        success: true,
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '00000000-0000-0000-0000-000000000000',
        execution_time_ms: executionTime,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        model_used: 'system',
        estimated_cost_eur: 0
      });
    } catch (logError) {
      console.error('Failed to log to function_call_logs:', logError);
    }

    return jsonResponse({ 
      success: true, 
      message: `Processed ${results.length} paused run(s)`,
      results,
      checked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Auto-restart error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      { checked_at: new Date().toISOString() }
    );
  }
});
