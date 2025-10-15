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
    const { batch_size = 25 } = await req.json(); // Verhoogde default voor snellere processing
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Preflight: Get org_id from auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: orgData, error: orgError } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    const org_id = orgData?.org_id;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Starting auto-backfill orchestrator for org: ${org_id}`);

    // Preflight: Check if already running (allow restart if heartbeat is stale)
    const { data: existingRun } = await supabase
      .from('orchestrator_state')
      .select('*')
      .eq('org_id', org_id)
      .eq('status', 'running')
      .contains('metadata', { component: 'auto-backfill-orchestrator' })
      .maybeSingle();
    
    // Check if heartbeat is stale (>5 min old) - if so, allow restart
    if (existingRun) {
      const lastHeartbeat = existingRun.metadata?.last_heartbeat;
      const isStale = lastHeartbeat 
        ? (Date.now() - new Date(lastHeartbeat).getTime()) > 5 * 60 * 1000
        : true;
      
      if (!isStale) {
        console.log('⚠️ Auto-backfill already running with fresh heartbeat');
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Auto-backfill is already running',
            status: 'running',
            progress: {
              batch: existingRun.current_batch,
              processed: existingRun.total_items_processed,
              total: existingRun.metadata?.total_missing || 0
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`⚠️ Stale heartbeat detected (${lastHeartbeat}), allowing restart`);
        // Reset the stale run
        await supabase
          .from('orchestrator_state')
          .update({ 
            status: 'error',
            metadata: {
              ...existingRun.metadata,
              error: 'Heartbeat timeout - restarted by user',
              stalled_at: new Date().toISOString()
            }
          })
          .eq('id', existingRun.id);
      }
    }


    // Preflight: Check if there are missing embeddings
    const { count: totalKnowledge } = await supabase
      .from('ai_knowledge_base')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    const { count: totalEmbeddings } = await supabase
      .from('knowledge_embeddings')
      .select('*', { count: 'exact', head: true });

    const missingCount = (totalKnowledge || 0) - (totalEmbeddings || 0);

    if (missingCount <= 0) {
      console.log('✅ No missing embeddings');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'All embeddings are up to date',
          status: 'idle',
          total_knowledge: totalKnowledge,
          total_embeddings: totalEmbeddings
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Missing embeddings: ${missingCount}`);

    // Initialize state with metadata.component
    const { data: stateRecord, error: stateError } = await supabase
      .from('orchestrator_state')
      .insert({
        org_id,
        status: 'running',
        current_batch: 0,
        total_items_processed: 0,
        metadata: {
          component: 'auto-backfill-orchestrator',
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          batch_size,
          total_missing: missingCount,
          current_offset: 0,
          max_runtime_minutes: 45
        }
      })
      .select()
      .single();

    if (stateError || !stateRecord) {
      throw new Error(`Failed to create state record: ${stateError?.message}`);
    }

    const stateId = stateRecord.id;

    // Start background task
    const backgroundTask = async () => {
      const BATCH_SIZE = batch_size; // Use requested batch size (default 10)
      let totalProcessed = 0;
      let batchNumber = 0;
      let hasMore = true;
      let currentMissingCount = missingCount;
      let currentBatchSize = BATCH_SIZE;
      let currentOffset = 0;
      const startTime = Date.now();
      const maxRuntimeMs = 45 * 60 * 1000; // 45 minutes

      console.log('📦 Starting background batches...');

      try {
        while (hasMore) {
          batchNumber++;
          const batchStartTime = Date.now();
          
          // Check max runtime
          if (Date.now() - startTime > maxRuntimeMs) {
            console.log(`⏱️ Max runtime (45 min) reached, pausing gracefully`);
            await supabase
              .from('orchestrator_state')
              .update({
                status: 'paused',
                current_batch: batchNumber,
                total_items_processed: totalProcessed,
                metadata: {
                  component: 'auto-backfill-orchestrator',
                  started_at: stateRecord.metadata?.started_at,
                  paused_at: new Date().toISOString(),
                  pause_reason: 'Max runtime reached (45 min)',
                  current_offset: currentOffset,
                  total_missing: currentMissingCount,
                  batch_size: currentBatchSize,
                  last_heartbeat: new Date().toISOString()
                }
              })
              .eq('id', stateId);
            break;
          }
          
          try {
            // Update heartbeat before batch
            await supabase
              .from('orchestrator_state')
              .update({
                metadata: {
                  component: 'auto-backfill-orchestrator',
                  started_at: stateRecord.metadata?.started_at,
                  last_heartbeat: new Date().toISOString(),
                  current_offset: currentOffset,
                  total_missing: currentMissingCount,
                  batch_size: currentBatchSize,
                  current_batch: batchNumber
                }
              })
              .eq('id', stateId);

            const { data, error } = await supabase.functions.invoke('backfill-embeddings', {
              body: { batch_size: currentBatchSize }
            });

            if (error) {
              // Check if it's a rate limit error (429)
              if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
                const waitTimes = [2000, 5000, 10000, 30000];
                const waitTime = waitTimes[Math.min(batchNumber % 4, 3)];
                console.log(`⏳ Rate limit hit, waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                batchNumber--; // Retry this batch
                continue;
              }
              throw error;
            }

            const batchDuration = Date.now() - batchStartTime;
            totalProcessed += data.processed || 0;
            currentMissingCount = data.total_missing || 0;
            currentOffset += data.processed || 0;

            // Adjust batch size based on performance
            if (batchDuration > 60000 && currentBatchSize > 25) {
              currentBatchSize = 25;
              console.log(`⚡ Batch took ${batchDuration}ms, reducing batch size to 25`);
            } else if (batchDuration > 30000 && currentBatchSize > 10) {
              currentBatchSize = Math.max(10, Math.floor(currentBatchSize / 2));
              console.log(`⚡ Batch took ${batchDuration}ms, reducing batch size to ${currentBatchSize}`);
            }

            // Update state with all progress info
            await supabase
              .from('orchestrator_state')
              .update({
                status: 'running',
                current_batch: batchNumber,
                total_items_processed: totalProcessed,
                last_run_at: new Date().toISOString(),
                metadata: {
                  component: 'auto-backfill-orchestrator',
                  started_at: stateRecord.metadata?.started_at,
                  last_batch_at: new Date().toISOString(),
                  last_heartbeat: new Date().toISOString(),
                  total_missing: currentMissingCount,
                  batch_size: currentBatchSize,
                  current_offset: currentOffset,
                  avg_batch_duration_ms: batchDuration,
                  max_runtime_minutes: 45
                }
              })
              .eq('id', stateId);

            console.log(`✅ Batch ${batchNumber}: ${data.processed} processed, ${currentMissingCount} remaining (${batchDuration}ms)`);

            // Check if done
            if (data.reason === 'no_missing_embeddings' || data.processed === 0) {
              hasMore = false;
            }

            // Rate limiting between batches
            if (hasMore) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (err) {
            console.error(`❌ Batch ${batchNumber} failed:`, err);
            
            // Reduce batch size and retry on failure
            if (currentBatchSize > 10) {
              currentBatchSize = 10;
              console.log(`🔄 Reducing batch size to 10 and retrying...`);
              batchNumber--; // Retry this batch
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }
            
            // If batch size is already minimal, log error and continue
            await supabase
              .from('orchestrator_state')
              .update({
                status: 'error',
                current_batch: batchNumber,
                total_items_processed: totalProcessed,
                metadata: {
                  component: 'auto-backfill-orchestrator',
                  error: err instanceof Error ? err.message : 'Unknown error',
                  failed_at: new Date().toISOString(),
                  failed_at_batch: batchNumber,
                  batch_size: currentBatchSize,
                  current_offset: currentOffset,
                  last_heartbeat: new Date().toISOString()
                }
              })
              .eq('id', stateId);
            break;
          }
        }
      } catch (outerErr) {
        console.error('❌ Background task crashed:', outerErr);
        await supabase
          .from('orchestrator_state')
          .update({
            status: 'error',
            metadata: {
              component: 'auto-backfill-orchestrator',
              error: outerErr instanceof Error ? outerErr.message : 'Background task crashed',
              crashed_at: new Date().toISOString(),
              batch_size: currentBatchSize,
              current_offset: currentOffset,
              last_heartbeat: new Date().toISOString()
            }
          })
          .eq('id', stateId);
        return;
      }

      // Mark as completed
      if (hasMore === false) {
        console.log(`🎉 Backfill completed! Total processed: ${totalProcessed} across ${batchNumber} batches`);
        await supabase
          .from('orchestrator_state')
          .update({
            status: 'idle',
            current_batch: batchNumber,
            total_items_processed: totalProcessed,
            metadata: {
              component: 'auto-backfill-orchestrator',
              completed_at: new Date().toISOString(),
              total_batches: batchNumber,
              batch_size: currentBatchSize,
              total_duration_minutes: Math.round((Date.now() - startTime) / 60000),
              last_heartbeat: new Date().toISOString()
            }
          })
          .eq('id', stateId);
      }
    };

    // Start background processing using EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(backgroundTask());

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Auto-backfill started in background',
        status: 'running'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error starting auto-backfill:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
