import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-org-id, x-internal-signature',
};

// HMAC verification helper for internal calls
async function verifyHMAC(orgId: string, signature: string): Promise<boolean> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const message = `${orgId}:auto-backfill`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return expectedSignature === signature;
}

// Helper functie: Haal knowledge IDs op die nog geen embeddings hebben
async function getKnowledgeIdsWithoutEmbeddings(
  supabase: any, 
  batchSize: number, 
  offset: number
): Promise<string[]> {
  // Fetch knowledge items zonder embeddings (prioriteer OUDSTE items)
  const { data: kbItems } = await supabase
    .from('ai_knowledge_base')
    .select('id')
    .is('deleted_at', null)
    .order('created_at', { ascending: true }) // 🔧 FIX: Oudste items eerst (voorkomt infinite loop)
    .range(offset, offset + batchSize * 20 - 1); // Window voor filtering
  
  if (!kbItems || kbItems.length === 0) return [];
  
  // Filter items die al embeddings hebben
  const { data: existingEmb } = await supabase
    .from('knowledge_embeddings')
    .select('knowledge_id')
    .in('knowledge_id', kbItems.map((k: any) => k.id));
  
  const existingSet = new Set(existingEmb?.map((e: any) => e.knowledge_id) || []);
  const missingIds = kbItems
    .filter((k: any) => !existingSet.has(k.id))
    .map((k: any) => k.id)
    .slice(0, batchSize); // Neem alleen batch_size items
  
  return missingIds;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batch_size = 25, force_restart = false } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fixed org_id voor autonomous AI (CRON heeft geen user context)
    const org_id = '550e8400-e29b-41d4-a716-446655440000';
    console.log(`🤖 [CRON] Auto-backfill orchestrator started for org: ${org_id}`);

    // Check for existing runs (running or paused)
    const { data: existingRun } = await supabase
      .from('orchestrator_state')
      .select('*')
      .eq('org_id', org_id)
      .in('status', ['running', 'paused'])
      .contains('metadata', { component: 'auto-backfill-orchestrator' })
      .maybeSingle();
    
    let stateId: string = '';
    let shouldSkipInsert = false;
    
    if (existingRun) {
      // Resume from paused state
      if (existingRun.status === 'paused') {
        console.log('🔄 Resuming from paused state - updating existing record (no new INSERT)');
        const metadata = existingRun.metadata || {};
        const checkpoint = {
          batch: metadata.checkpoint_batch || 0,
          processed: metadata.checkpoint_processed || 0,
          offset: metadata.checkpoint_offset || 0
        };
        console.log(`📍 Checkpoint: batch=${checkpoint.batch}, processed=${checkpoint.processed}, offset=${checkpoint.offset}`);
        
        // Update status to running and continue from checkpoint
        await supabase
          .from('orchestrator_state')
          .update({ 
            status: 'running',
            metadata: {
              ...metadata,
              resumed_at: new Date().toISOString(),
              last_heartbeat: new Date().toISOString()
            }
          })
          .eq('id', existingRun.id);
        
        stateId = existingRun.id;
        shouldSkipInsert = true;
      } else {
        // Existing running state - check heartbeat
        const lastHeartbeat = existingRun.metadata?.last_heartbeat;
        const timeSinceHeartbeat = lastHeartbeat 
          ? Date.now() - new Date(lastHeartbeat).getTime()
          : Infinity;
        const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minuten
        
        // Force restart if requested
        if (force_restart) {
          console.log('🔄 Force restart requested, marking existing run as timeout');
          await supabase
            .from('orchestrator_state')
            .update({ 
              status: 'timeout',
              metadata: {
                ...existingRun.metadata,
                error: 'Force restart requested',
                force_restarted_at: new Date().toISOString()
              }
            })
            .eq('id', existingRun.id);
        } else if (timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS) {
          // Fresh heartbeat: orchestrator is still running
          console.log(`⏸️ Auto-backfill already running with fresh heartbeat (${Math.round(timeSinceHeartbeat/1000)}s ago)`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: 'Auto-backfill is already running',
              status: 'running',
              progress: {
                batch: existingRun.current_batch,
                processed: existingRun.total_items_processed,
                total: existingRun.metadata?.total_missing || 0
              },
              heartbeat_age_seconds: Math.round(timeSinceHeartbeat / 1000)
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // Stale heartbeat: mark as timeout and start new run
          console.log(`⚠️ Heartbeat timeout detected (${Math.round(timeSinceHeartbeat/1000)}s since last heartbeat), marking as timeout`);
          await supabase
            .from('orchestrator_state')
            .update({ 
              status: 'timeout',
              metadata: {
                ...existingRun.metadata,
                error: `Heartbeat timeout (${Math.round(timeSinceHeartbeat/1000)}s since last update)`,
                timeout_at: new Date().toISOString()
              }
            })
            .eq('id', existingRun.id);
          
          console.log('✅ Old run marked as timeout, starting new run');
        }
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

    // Initialize state with metadata.component (only if not resuming)
    let stateRecord: any;
    
    if (!shouldSkipInsert) {
      const { data, error: stateError } = await supabase
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

      if (stateError || !data) {
        throw new Error(`Failed to create state record: ${stateError?.message}`);
      }
      
      stateRecord = data;
      stateId = data.id;
      console.log('📝 Created new orchestrator state record');
    } else {
      // Fetch existing record for metadata
      const { data } = await supabase
        .from('orchestrator_state')
        .select('*')
        .eq('id', stateId)
        .single();
      stateRecord = data;
      console.log('♻️ Reusing existing orchestrator state record');
    }

    // Start background task
    const backgroundTask = async () => {
      const MAX_BATCHES_PER_RUN = 999; // Increased to allow continuous backfill until complete
      const BATCH_SIZE = 5; // Reduced from 50 to 5 to prevent token limit errors (5 items * 1500 tokens = safe)
      const MAX_PARALLEL_BATCHES = 2; // Verlaagd naar 2 voor meer stabiliteit
      
      // Resume from checkpoint if available
      let totalProcessed = existingRun?.total_items_processed || 0;
      let batchNumber = existingRun?.current_batch || 0;
      let currentOffset = existingRun?.metadata?.checkpoint_offset || 0;
      let batchesThisRun = 0;
      let hasMore = true;
      let currentMissingCount = missingCount;
      let currentBatchSize = BATCH_SIZE;
      const startTime = Date.now();

      if (existingRun?.status === 'paused') {
        console.log(`🔄 Resuming from checkpoint: batch=${batchNumber}, processed=${totalProcessed}, offset=${currentOffset}`);
      } else {
        console.log('📦 Starting background batches...');
      }

      try {
        while (hasMore) {
          // Check if run was paused/stopped externally
          const { data: currentStateCheck } = await supabase
            .from('orchestrator_state')
            .select('status, metadata')
            .eq('id', stateId)
            .single();
          
          if (currentStateCheck && currentStateCheck.status !== 'running') {
            console.log(`⏸️ Run status changed to '${currentStateCheck.status}' - exiting loop`);
            hasMore = false;
            break;
          }
          
          batchNumber++;
          batchesThisRun++;
          const batchStartTime = Date.now();
          
          // Check if we've hit the per-run batch limit
          if (batchesThisRun >= MAX_BATCHES_PER_RUN) {
            const pauseTimestamp = new Date().toISOString();
            console.log(`⏸️ Pausing after ${batchesThisRun} batches (processed ${totalProcessed} items) at ${pauseTimestamp}`);
            
            const { error: pauseError } = await supabase
              .from('orchestrator_state')
              .update({
                status: 'paused',
                current_batch: batchNumber,
                total_items_processed: totalProcessed,
                metadata: {
                  component: 'auto-backfill-orchestrator',
                  started_at: stateRecord.metadata?.started_at || new Date().toISOString(),
                  paused_at: pauseTimestamp,
                  pause_reason: `Auto-pause after ${MAX_BATCHES_PER_RUN} batches to avoid runtime limits`,
                  checkpoint_batch: batchNumber,
                  checkpoint_processed: totalProcessed,
                  checkpoint_offset: currentOffset,
                  total_missing: currentMissingCount,
                  batch_size: currentBatchSize,
                  last_heartbeat: pauseTimestamp
                }
              })
              .eq('id', stateId);
            
            if (pauseError) {
              console.error('❌ Failed to set paused status:', pauseError);
            } else {
              console.log('✅ Successfully set status to paused');
            }
            
            // Return with should_restart flag
            return { should_restart: true, processed: totalProcessed, status: 'paused' };
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

            // Haal knowledge IDs zonder embeddings op
            const knowledgeIds = await getKnowledgeIdsWithoutEmbeddings(
              supabase,
              currentBatchSize,
              currentOffset
            );

            if (knowledgeIds.length === 0) {
              console.log('✅ No more items without embeddings');
              hasMore = false;
              break;
            }

            console.log(`📦 Processing ${knowledgeIds.length} items via generate-embedding`);

            // Gebruik generate-embedding (Gemini) in plaats van backfill-embeddings
            const { data, error } = await supabase.functions.invoke('generate-embedding', {
              body: { knowledge_ids: knowledgeIds }
            });

            if (error) {
              console.error(`❌ Error in batch ${batchNumber}:`, error);
              
              // Check embedding_failures to see which items have failed before
              const { data: failures } = await supabase
                .from('embedding_failures')
                .select('knowledge_id, retry_count')
                .in('knowledge_id', knowledgeIds);
              
              // Skip items that have already failed 3+ times
              const failedItems = new Set(
                failures?.filter(f => (f.retry_count || 0) >= 3).map(f => f.knowledge_id) || []
              );
              
              if (failedItems.size > 0) {
                console.log(`⏭️ Skipping ${failedItems.size} items that failed 3+ times`);
                totalProcessed += failedItems.size;
              }
              
              // Check for token limit error (400/500) - log and skip
              if (error.message?.includes('400') || error.message?.includes('500') || error.message?.toLowerCase().includes('token') || error.message?.toLowerCase().includes('context length')) {
                console.error(`❌ Token limit error for batch ${batchNumber} - logging failures and continuing`);
                
                // Log failures to embedding_failures table (increment retry_count)
                for (const kid of knowledgeIds) {
                  if (failedItems.has(kid)) continue; // Skip already failed 3+ times
                  
                  const existingFailure = failures?.find(f => f.knowledge_id === kid);
                  const retryCount = (existingFailure?.retry_count || 0) + 1;
                  
                  await supabase.from('embedding_failures').upsert({
                    knowledge_id: kid,
                    error_type: error.message?.includes('500') ? 'openai_500_error' : 'token_limit',
                    error_message: error.message?.substring(0, 500),
                    attempted_at: new Date().toISOString(),
                    retry_count: retryCount
                  }, { onConflict: 'knowledge_id' });
                }
                
                // Als batch_size > 10, probeer met kleinere batch
                if (currentBatchSize > 10) {
                  currentBatchSize = 10;
                  console.log(`🔄 Reducing batch size to ${currentBatchSize} and retrying...`);
                  batchNumber--; // Retry this batch with smaller size
                  continue;
                }
                
                // Skip to next batch
                console.log(`⏭️ Skipping failed items, moving to next batch`);
                currentOffset += knowledgeIds.length;
                continue;
              }
              
              // Check for AI credits exhausted (402)
              if (error.message?.includes('402') || error.message?.toLowerCase().includes('credits exhausted')) {
                console.error('💳 AI credits exhausted - pausing backfill');
                const pauseTimestamp = new Date().toISOString();
                
                await supabase
                  .from('orchestrator_state')
                  .update({
                    status: 'paused',
                    current_batch: batchNumber,
                    total_items_processed: totalProcessed,
                    metadata: {
                      component: 'auto-backfill-orchestrator',
                      started_at: stateRecord.metadata?.started_at || new Date().toISOString(),
                      paused_at: pauseTimestamp,
                      pause_reason: 'AI credits exhausted (402) - please add funds',
                      error: 'AI credits exhausted',
                      checkpoint_batch: batchNumber,
                      checkpoint_processed: totalProcessed,
                      checkpoint_offset: currentOffset,
                      total_missing: currentMissingCount,
                      batch_size: currentBatchSize,
                      last_heartbeat: pauseTimestamp
                    }
                  })
                  .eq('id', stateId);
                
                return { should_restart: false, processed: totalProcessed, status: 'paused', error: 'AI credits exhausted' };
              }
              
              // Check if it's a rate limit error (429)
              if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
                const waitTimes = [2000, 5000, 10000, 30000];
                const waitTime = waitTimes[Math.min(batchNumber % 4, 3)];
                console.log(`⏳ Rate limit hit, waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                batchNumber--; // Retry this batch
                continue;
              }
              
              // Unknown error - log to embedding_failures and continue
              console.error(`⚠️ Unknown error, logging and continuing:`, error);
              for (const kid of knowledgeIds) {
                if (failedItems.has(kid)) continue;
                
                const existingFailure = failures?.find(f => f.knowledge_id === kid);
                const retryCount = (existingFailure?.retry_count || 0) + 1;
                
                await supabase.from('embedding_failures').upsert({
                  knowledge_id: kid,
                  error_type: 'unknown_error',
                  error_message: error.message?.substring(0, 500) || 'Unknown error',
                  attempted_at: new Date().toISOString(),
                  retry_count: retryCount
                }, { onConflict: 'knowledge_id' });
              }
              
              currentOffset += knowledgeIds.length;
              continue;
            }

            const batchDuration = Date.now() - batchStartTime;
            const processedInBatch = data.processed || 0;
            totalProcessed += processedInBatch;
            
            // Herbereken missing count
            const { count: currentTotal } = await supabase
              .from('ai_knowledge_base')
              .select('*', { count: 'exact', head: true })
              .is('deleted_at', null);
            
            const { count: currentEmbeddings } = await supabase
              .from('knowledge_embeddings')
              .select('*', { count: 'exact', head: true });
            
            currentMissingCount = Math.max((currentTotal || 0) - (currentEmbeddings || 0), 0);
            
            // Update offset (niet meer nodig met nieuwe flow, maar behouden voor tracking)
            currentOffset += processedInBatch;

            console.log(`✅ Batch ${batchNumber}: processed=${processedInBatch}, remaining=${currentMissingCount}, offset=${currentOffset}, duration=${batchDuration}ms`);

            // Stop if no more missing
            if (currentMissingCount === 0) {
              console.log('✅ All embeddings complete!');
              hasMore = false;
              break;
            }

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

    // No beforeunload handler - we pause gracefully instead

    // Start background processing using EdgeRuntime.waitUntil
    const taskResult = EdgeRuntime.waitUntil(backgroundTask());

    // Check if we need to signal for restart
    const result = await taskResult;
    
    // Return immediately with restart signal if needed
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: existingRun?.status === 'paused' ? 'Auto-backfill resumed from checkpoint' : 'Auto-backfill started in background',
        status: result?.status || 'running',
        should_restart: result?.should_restart || false,
        processed: result?.processed || 0
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
