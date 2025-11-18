import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Processing pending jobs...');

    // Fetch max 10 pending jobs (highest priority first)
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('✅ No pending jobs');
      return new Response(
        JSON.stringify({ message: 'No pending jobs', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${pendingJobs.length} pending jobs`);

    // Process each job asynchronously
    const results = await Promise.allSettled(
      pendingJobs.map(async (job) => {
        try {
          console.log(`⚡ Processing job ${job.id} (${job.file_type})`);
          
          const { data, error } = await supabase.functions.invoke('process-job-chunk', {
            body: { job_id: job.id }
          });

          if (error) {
            console.error(`❌ Job ${job.id} failed:`, error);
            return { success: false, job_id: job.id, error: error.message };
          }

          console.log(`✅ Job ${job.id} completed`);
          return { success: true, job_id: job.id, data };
        } catch (err: any) {
          console.error(`❌ Job ${job.id} error:`, err);
          return { success: false, job_id: job.id, error: err.message };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Processed: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({
        processed: pendingJobs.length,
        successful,
        failed,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'rejected' })
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error processing pending jobs:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
