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

    console.log('🔍 Checking for paused auto-backfill runs...');

    // Find paused auto-backfill orchestrator runs
    const { data: pausedRuns, error: queryError } = await supabase
      .from('orchestrator_state')
      .select('*')
      .eq('status', 'paused')
      .contains('metadata', { component: 'auto-backfill-orchestrator' })
      .order('created_at', { ascending: false })
      .limit(10);

    if (queryError) {
      throw queryError;
    }

    if (!pausedRuns || pausedRuns.length === 0) {
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

    console.log(`📊 Found ${pausedRuns.length} paused run(s)`);

    const results = [];
    
    for (const run of pausedRuns) {
      try {
        const org_id = run.org_id;
        const metadata = run.metadata || {};
        
        // Check if this run was paused recently (within last 10 minutes)
        const pausedAt = metadata.paused_at;
        const isPausedRecently = pausedAt 
          ? (Date.now() - new Date(pausedAt).getTime()) < 10 * 60 * 1000
          : false;

        if (!isPausedRecently) {
          console.log(`⏭️ Skipping old paused run from ${pausedAt}`);
          continue;
        }

        console.log(`🔄 Restarting auto-backfill for org ${org_id}...`);

        // Call the auto-backfill-orchestrator to resume
        const { data: restartData, error: restartError } = await supabase.functions.invoke(
          'auto-backfill-orchestrator',
          {
            body: { 
              batch_size: metadata.batch_size || 25,
              force_restart: false // Resume from checkpoint, don't force restart
            },
            headers: {
              'x-org-id': org_id // Pass org context
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
