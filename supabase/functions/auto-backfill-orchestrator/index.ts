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
    const { batch_size = 50 } = await req.json();
    
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

    // Preflight: Check if already running
    const { data: existingRun } = await supabase
      .from('orchestrator_state')
      .select('*')
      .eq('org_id', org_id)
      .eq('status', 'running')
      .contains('metadata', { component: 'auto-backfill-orchestrator' })
      .maybeSingle();

    if (existingRun) {
      console.log('⚠️ Auto-backfill already running');
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
          batch_size,
          total_missing: missingCount
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
      let totalProcessed = 0;
      let batchNumber = 0;
      let hasMore = true;
      let currentMissingCount = missingCount;

      console.log('📦 Starting background batches...');

      while (hasMore) {
        batchNumber++;
        
        try {
          const { data, error } = await supabase.functions.invoke('backfill-embeddings', {
            body: { batch_size }
          });

          if (error) throw error;

          totalProcessed += data.processed || 0;
          currentMissingCount = data.total_missing || 0;

          // Update state by id
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
                total_missing: currentMissingCount,
                batch_size
              }
            })
            .eq('id', stateId);

          console.log(`✅ Batch ${batchNumber}: ${data.processed} processed, ${currentMissingCount} remaining`);

          // Check if done
          if (data.reason === 'no_missing_embeddings' || data.processed === 0) {
            hasMore = false;
          }

          // Rate limiting
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          console.error(`❌ Batch ${batchNumber} failed:`, err);
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
                batch_size
              }
            })
            .eq('id', stateId);
          break;
        }
      }

      // Mark as completed
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
            batch_size
          }
        })
        .eq('id', stateId);
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
