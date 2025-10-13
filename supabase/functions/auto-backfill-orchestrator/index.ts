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

    // Get org_id from auth
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    const { data: orgData } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user?.id)
      .single();
    
    const org_id = orgData?.org_id;

    if (!org_id) {
      throw new Error('User organization not found');
    }

    console.log(`🚀 Starting auto-backfill orchestrator for org: ${org_id}`);

    // Initialize state
    await supabase
      .from('orchestrator_state')
      .upsert({
        org_id,
        component: 'auto-backfill-orchestrator',
        status: 'running',
        current_batch: 0,
        total_items_processed: 0,
        metadata: {
          started_at: new Date().toISOString(),
          batch_size
        }
      });

    // Start background task
    const backgroundTask = async () => {
      let totalProcessed = 0;
      let batchNumber = 0;
      let hasMore = true;

      console.log('📦 Starting background batches...');

      while (hasMore) {
        batchNumber++;
        
        try {
          const { data, error } = await supabase.functions.invoke('backfill-embeddings', {
            body: { batch_size }
          });

          if (error) throw error;

          totalProcessed += data.processed || 0;

          // Update state
          await supabase
            .from('orchestrator_state')
            .upsert({
              org_id,
              component: 'auto-backfill-orchestrator',
              status: 'running',
              current_batch: batchNumber,
              total_items_processed: totalProcessed,
              metadata: {
                last_batch_at: new Date().toISOString(),
                total_missing: data.total_missing || 0,
                batch_size
              }
            });

          console.log(`✅ Batch ${batchNumber}: ${data.processed} processed, ${data.total_missing} remaining`);

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
            .upsert({
              org_id,
              component: 'auto-backfill-orchestrator',
              status: 'error',
              current_batch: batchNumber,
              total_items_processed: totalProcessed,
              metadata: {
                error: err instanceof Error ? err.message : 'Unknown error',
                failed_at: new Date().toISOString(),
                failed_at_batch: batchNumber
              }
            });
          break;
        }
      }

      // Mark as completed
      console.log(`🎉 Backfill completed! Total processed: ${totalProcessed} across ${batchNumber} batches`);
      await supabase
        .from('orchestrator_state')
        .upsert({
          org_id,
          component: 'auto-backfill-orchestrator',
          status: 'idle',
          current_batch: batchNumber,
          total_items_processed: totalProcessed,
          metadata: {
            completed_at: new Date().toISOString(),
            total_batches: batchNumber
          }
        });
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
