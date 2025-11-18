import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    // 1) Fail stuck processing jobs (older than 10 min)
    const { data: stuckJobs } = await supabase
      .from('processing_jobs')
      .select('id, file_path')
      .eq('status', 'processing')
      .is('completed_at', null)
      .lt('started_at', tenMinAgo);

    let failedJobs = 0;
    let affectedFiles = new Set<string>();

    if (stuckJobs && stuckJobs.length > 0) {
      const { error: failErr } = await supabase
        .from('processing_jobs')
        .update({
          status: 'failed',
          error_message: 'Timeout: verwerking duurde langer dan 10 minuten',
          completed_at: new Date().toISOString()
        })
        .in('id', stuckJobs.map(j => j.id));

      if (failErr) throw failErr;
      failedJobs = stuckJobs.length;
      stuckJobs.forEach(j => affectedFiles.add(j.file_path));
    }

    // 2) Mark zombie documents (processing without jobs) as failed
    const { data: processingDocs } = await supabase
      .from('training_documents')
      .select('file_path')
      .eq('status', 'processing')
      .is('processed_at', null)
      .lt('created_at', fifteenMinAgo);

    let zombieDocs = 0;

    if (processingDocs && processingDocs.length > 0) {
      // For each, check if jobs exist
      for (const doc of processingDocs) {
        const { data: jobsForDoc } = await supabase
          .from('processing_jobs')
          .select('id')
          .eq('file_path', doc.file_path)
          .limit(1);

        if (!jobsForDoc || jobsForDoc.length === 0) {
          const { error: updErr } = await supabase
            .from('training_documents')
            .update({
              status: 'failed',
              error_message: 'Geen verwerkingsjobs gevonden (zombie-document)',
              processed_at: new Date().toISOString(),
              processing_progress: 100
            })
            .eq('file_path', doc.file_path);
          if (updErr) throw updErr;
          zombieDocs++;
        }
      }
    }

    // 3) For all affected files, if no pending/processing jobs remain, sync training_documents
    const filesToSync = Array.from(affectedFiles);
    let syncedDocs = 0;

    for (const filePath of filesToSync) {
      const { data: remaining } = await supabase
        .from('processing_jobs')
        .select('status')
        .eq('file_path', filePath)
        .in('status', ['pending', 'processing']);

      if (!remaining || remaining.length === 0) {
        // Sum items and determine final status
        const { data: doneJobs } = await supabase
          .from('processing_jobs')
          .select('items_processed, status')
          .eq('file_path', filePath);

        const anyDone = (doneJobs || []).some(j => j.status === 'done');
        const totalItems = (doneJobs || [])
          .filter(j => j.status === 'done')
          .reduce((sum, j) => sum + (j.items_processed || 0), 0);

        const { error: syncErr } = await supabase
          .from('training_documents')
          .update({
            status: anyDone ? 'completed' : 'failed',
            processed_at: new Date().toISOString(),
            extracted_knowledge_count: totalItems,
            processing_progress: 100
          })
          .eq('file_path', filePath);
        if (syncErr) throw syncErr;
        syncedDocs++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, failedJobs, zombieDocs, syncedDocs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[CLEANUP] Error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});