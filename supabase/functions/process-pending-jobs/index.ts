import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

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
      return jsonResponse({ message: 'No pending jobs', processed: 0 });
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

    return jsonResponse({
      processed: pendingJobs.length,
      successful,
      failed,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'rejected' })
    });

  } catch (error: any) {
    console.error('Error processing pending jobs:', error);
    return errorResponse(error.message, 500);
  }
});
