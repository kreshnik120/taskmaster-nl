import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

    const { job_id } = await req.json();

    // Get job
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      throw new Error('Job not found');
    }

    // Update status to processing
    await supabase
      .from('processing_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', job_id);

    try {
      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('training-documents')
        .download(job.file_path);

      if (downloadError) {
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      // Process based on file type
      let extractedItems = 0;
      let result: any = {};

      if (job.file_type === 'pdf') {
        // For PDF, we'll use a simplified extraction for now
        // In production, this would call Vision API
        result = await processPDFChunk(fileData, job.chunk_index, supabase, job.org_id, job.user_id);
        extractedItems = result.itemsExtracted || 0;
      } else if (job.file_type === 'excel') {
        result = await processExcelChunk(fileData, job.chunk_index, supabase, job.org_id, job.user_id);
        extractedItems = result.itemsExtracted || 0;
      } else if (job.file_type === 'text') {
        result = await processTextChunk(fileData, job.chunk_index, supabase, job.org_id, job.user_id);
        extractedItems = result.itemsExtracted || 0;
      }

      // Calculate progress
      const progressPct = Math.round(((job.chunk_index + 1) / job.total_chunks) * 100);
      const isLastChunk = (job.chunk_index + 1) === job.total_chunks;

      // Update job with success
      await supabase
        .from('processing_jobs')
        .update({
          status: isLastChunk ? 'done' : 'processing',
          progress_pct: progressPct,
          items_processed: extractedItems,
          completed_at: isLastChunk ? new Date().toISOString() : null,
          result: result
        })
        .eq('id', job_id);

      return new Response(
        JSON.stringify({
          success: true,
          job_id: job_id,
          items_extracted: extractedItems,
          progress: progressPct,
          status: isLastChunk ? 'done' : 'processing'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError: any) {
      console.error('Processing error:', processingError);
      
      // Handle retry logic
      const newRetryCount = (job.retry_count || 0) + 1;
      const shouldRetry = newRetryCount < 3;

      await supabase
        .from('processing_jobs')
        .update({
          status: shouldRetry ? 'pending' : 'failed',
          retry_count: newRetryCount,
          error_message: processingError.message
        })
        .eq('id', job_id);

      throw processingError;
    }

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function processPDFChunk(fileData: Blob, chunkIndex: number, supabase: any, orgId: string, userId: string) {
  // Simplified PDF processing - in production this would use Vision API
  // For now, we'll extract basic metadata
  const arrayBuffer = await fileData.arrayBuffer();
  const text = new TextDecoder().decode(arrayBuffer);
  
  // Extract simple key-value pairs (placeholder logic)
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  let itemsExtracted = 0;

  // Store a sample item to demonstrate the flow
  if (lines.length > 0) {
    await supabase.from('ai_knowledge_base').insert({
      org_id: orgId,
      user_id: userId,
      category: 'document_upload',
      key: `pdf_chunk_${chunkIndex}`,
      value: { content: lines.slice(0, 10).join('\n'), type: 'pdf_extract' },
      confidence_score: 0.7,
      source: `PDF chunk ${chunkIndex}`
    });
    itemsExtracted = 1;
  }

  return { itemsExtracted, chunkIndex };
}

async function processExcelChunk(fileData: Blob, chunkIndex: number, supabase: any, orgId: string, userId: string) {
  // Simplified Excel processing
  const arrayBuffer = await fileData.arrayBuffer();
  const text = new TextDecoder().decode(arrayBuffer);
  
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  let itemsExtracted = 0;

  if (lines.length > 0) {
    await supabase.from('ai_knowledge_base').insert({
      org_id: orgId,
      user_id: userId,
      category: 'document_upload',
      key: `excel_chunk_${chunkIndex}`,
      value: { content: lines.slice(0, 10).join('\n'), type: 'excel_extract' },
      confidence_score: 0.7,
      source: `Excel chunk ${chunkIndex}`
    });
    itemsExtracted = 1;
  }

  return { itemsExtracted, chunkIndex };
}

async function processTextChunk(fileData: Blob, chunkIndex: number, supabase: any, orgId: string, userId: string) {
  const text = await fileData.text();
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  let itemsExtracted = 0;

  if (lines.length > 0) {
    await supabase.from('ai_knowledge_base').insert({
      org_id: orgId,
      user_id: userId,
      category: 'document_upload',
      key: `text_chunk_${chunkIndex}`,
      value: { content: lines.join('\n'), type: 'text_extract' },
      confidence_score: 0.8,
      source: `Text chunk ${chunkIndex}`
    });
    itemsExtracted = 1;
  }

  return { itemsExtracted, chunkIndex };
}
