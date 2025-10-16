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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔍 Checking for paused or stale auto-backfill runs...');

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
      
      // Check for stale heartbeat (>5 min)
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
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No paused runs to restart',
          checked_at: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${pausedRuns.length} run(s) needing restart`);

    const results = [];
    
    for (const run of pausedRuns) {
      try {
        const org_id = run.org_id;
        const metadata = run.metadata || {};
        const isStaleHeartbeat = run.status === 'running';
        
        // If stale heartbeat: force reset to error first
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

        // Call the auto-backfill-orchestrator to resume with HMAC authentication
        const { data: restartData, error: restartError } = await supabase.functions.invoke(
          'auto-backfill-orchestrator',
          {
            body: { 
              batch_size: metadata.batch_size || 25,
              force_restart: false // Resume from checkpoint, don't force restart
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${results.length} paused run(s)`,
        results,
        checked_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Auto-restart error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        checked_at: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
