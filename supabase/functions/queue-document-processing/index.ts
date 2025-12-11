import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's org (handle multiple orgs)
    const { data: userOrgs, error: orgError } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1);

    const userOrg = userOrgs?.[0];
    if (orgError || !userOrg) {
      throw new Error('Organization not found');
    }

    const { filePath, fileName, trainingDocumentId } = await req.json();

    // Detect file type
    const extension = fileName.toLowerCase().split('.').pop();
    let fileType = 'text';
    let totalChunks = 1;

    if (extension === 'pdf') {
      fileType = 'pdf';
      // Get file metadata to estimate pages
      const { data: fileData } = await supabase.storage
        .from('training-documents')
        .download(filePath);
      
      if (fileData) {
        const sizeInMB = fileData.size / (1024 * 1024);
        // Estimate: ~1 page = 100KB, 10 pages per chunk
        const estimatedPages = Math.max(1, Math.floor(sizeInMB * 10));
        totalChunks = Math.ceil(estimatedPages / 10);
      }
    } else if (['xls', 'xlsx'].includes(extension!)) {
      fileType = 'excel';
      totalChunks = 1; // Will be determined during processing
    } else if (extension === 'docx') {
      fileType = 'docx';
      totalChunks = 1;
    } else {
      fileType = 'text';
      totalChunks = 1;
    }

    // Create jobs for each chunk
    const jobs = [];
    for (let i = 0; i < totalChunks; i++) {
      const { data: job, error: jobError } = await supabase
        .from('processing_jobs')
        .insert({
          org_id: userOrg.org_id,
          user_id: user.id,
          file_path: filePath,
          file_name: fileName,
          file_type: fileType,
          chunk_index: i,
          total_chunks: totalChunks,
          status: 'pending',
          priority: 5,
          metadata: { 
            extension,
            training_document_id: trainingDocumentId // ✅ Pass for traceability
          }
        })
        .select()
        .single();

      if (jobError) {
        console.error('Error creating job:', jobError);
      } else {
        jobs.push(job);
      }
    }

    const estimatedMinutes = Math.ceil(totalChunks * 0.5); // ~30 sec per chunk

    return jsonResponse({
      success: true,
      queued: jobs.length,
      job_ids: jobs.map(j => j.id),
      estimated_time: `${estimatedMinutes} min`,
      file_type: fileType,
      total_chunks: totalChunks
    });

  } catch (error: any) {
    console.error('Error:', error);
    return errorResponse(error.message, 400);
  }
});
