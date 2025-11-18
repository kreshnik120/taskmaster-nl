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
        // Process PDF with Vision API
        result = await processPDFChunk(fileData, job.chunk_index, supabase, job.org_id, job.user_id, job.file_name);
        extractedItems = result.itemsExtracted || 0;
      } else if (job.file_type === 'excel') {
        result = await processExcelChunk(fileData, job.chunk_index, supabase, job.org_id, job.user_id, job.file_name);
        extractedItems = result.itemsExtracted || 0;
      } else if (job.file_type === 'text') {
        result = await processTextChunk(fileData, job.chunk_index, supabase, job.org_id, job.user_id, job.file_name);
        extractedItems = result.itemsExtracted || 0;
      }

      // Calculate progress
      const progressPct = Math.round(((job.chunk_index + 1) / job.total_chunks) * 100);
      const isLastChunk = (job.chunk_index + 1) === job.total_chunks;

      // Update job with success (each chunk finishes as 'done')
      await supabase
        .from('processing_jobs')
        .update({
          status: 'done',
          progress_pct: progressPct,
          items_processed: extractedItems,
          completed_at: new Date().toISOString(),
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

// Helper function: Convert ArrayBuffer to base64 in chunks to prevent call stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192; // 8KB chunks
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}

async function processPDFChunk(fileData: Blob, chunkIndex: number, supabase: any, orgId: string, userId: string, fileName: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY niet geconfigureerd");
  }

  console.log(`[PDF-CHUNK] Processing chunk ${chunkIndex} with Vision API`);

  // Convert to base64
  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  // Call Vision API with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Analyseer dit bedrijfsdocument (${fileName}, chunk ${chunkIndex}) en extraheer belangrijke kennis in gestructureerd formaat.` },
              { type: "input_image", input_image: { url: `data:application/pdf;base64,${base64}` } }
            ]
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_knowledge_items",
            description: "Save extracted knowledge items from the document",
            parameters: {
              type: "object",
              properties: { items: { type: "array", description: "Array of knowledge items extracted from the document", items: { type: "object", properties: { category: { type: "string", enum: ["bedrijfsprocessen", "klantinformatie", "tarieven", "contractvoorwaarden", "regels", "facturatie"], description: "De categorie van het kennis item" }, key: { type: "string", description: "Korte identificerende sleutel voor dit item (snake_case)" }, value: { type: "string", description: "De eigenlijke kennis waarde in helder Nederlands" } }, required: ["category", "key", "value"] } } }, required: ["items"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "save_knowledge_items" } }
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('Vision API timeout na 5 minuten');
    }
    throw e;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[PDF-CHUNK] Vision API error: ${response.status} - ${errorText.substring(0, 200)}`);
    throw new Error(`Vision API error: ${response.status}`);
  }

  const aiData = await response.json();

  // Extract knowledge items from tool calling
  let knowledgeItems: any[] = [];
  const toolCalls = aiData.choices?.[0]?.message?.tool_calls;
  
  if (toolCalls && toolCalls.length > 0) {
    const functionArgs = JSON.parse(toolCalls[0].function.arguments);
    knowledgeItems = functionArgs.items || [];
    console.log(`[PDF-CHUNK] ✅ Extracted ${knowledgeItems.length} items via Vision API`);
  }

  // Insert into ai_knowledge_base
  let itemsExtracted = 0;
  for (const item of knowledgeItems) {
    try {
      await supabase.from('ai_knowledge_base').insert({
        org_id: orgId,
        user_id: userId,
        category: item.category,
        key: item.key,
        value: item.value,
        confidence_score: 0.85,
        source: `${fileName} (chunk ${chunkIndex})`,
        valid_from: new Date().toISOString().split('T')[0],
        valid_to: null,
        jurisdiction: 'NL',
        confidentiality: 'intern',
        role_tags: [],
        acl: []
      });
      itemsExtracted++;
    } catch (insertError) {
      console.error(`[PDF-CHUNK] Failed to insert item ${item.key}:`, insertError);
    }
  }

  console.log(`[PDF-CHUNK] ✅ Inserted ${itemsExtracted} items from chunk ${chunkIndex}`);
  return { itemsExtracted, chunkIndex };
}

async function processExcelChunk(fileData: Blob, chunkIndex: number, supabase: any, orgId: string, userId: string, fileName: string) {
  console.log(`[EXCEL-CHUNK] Processing Excel file with XLSX library`);
  
  // Lazy load XLSX library
  const XLSX = await import("https://esm.sh/xlsx@0.18.5");
  
  const arrayBuffer = await fileData.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  
  // Convert all sheets to text
  let fullText = `Excel bestand: ${fileName}\n\n`;
  
  workbook.SheetNames.forEach((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { 
      FS: ' | ',
      RS: '\n'
    });
    fullText += `=== Sheet: "${sheetName}" ===\n${csv}\n\n`;
  });
  
  console.log(`[EXCEL-CHUNK] Extracted ${fullText.length} characters from ${workbook.SheetNames.length} sheets`);
  
  // Process with text-based AI
  const result = await processTextChunk(fileData, chunkIndex, supabase, orgId, userId, fileName);
  
  return result;
}

async function processTextChunk(fileData: Blob, chunkIndex: number, supabase: any, orgId: string, userId: string, fileName: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY niet geconfigureerd");
  }

  const text = await fileData.text();
  console.log(`[TEXT-CHUNK] Processing ${text.length} characters with AI`);

  // Call Lovable AI for structured extraction with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: `Analyseer deze tekst uit "${fileName}" (chunk ${chunkIndex}) en extraheer belangrijke kennis:\n\n${text.substring(0, 10000)}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_knowledge_items",
            description: "Save extracted knowledge items",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string", enum: ["bedrijfsprocessen", "klantinformatie", "tarieven", "contractvoorwaarden", "regels", "facturatie"] },
                      key: { type: "string" },
                      value: { type: "string" }
                    },
                    required: ["category", "key", "value"]
                  }
                }
              },
              required: ["items"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "save_knowledge_items" } }
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('AI timeout na 5 minuten');
    }
    throw e;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    console.error(`[TEXT-CHUNK] AI error: ${response.status}`);
    throw new Error(`AI error: ${response.status}`);
  }

  const aiData = await response.json();
  let knowledgeItems: any[] = [];
  
  const toolCalls = aiData.choices?.[0]?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const functionArgs = JSON.parse(toolCalls[0].function.arguments);
    knowledgeItems = functionArgs.items || [];
  }

  // Insert items
  let itemsExtracted = 0;
  for (const item of knowledgeItems) {
    try {
      await supabase.from('ai_knowledge_base').insert({
        org_id: orgId,
        user_id: userId,
        category: item.category,
        key: item.key,
        value: item.value,
        confidence_score: 0.80,
        source: `${fileName} (chunk ${chunkIndex})`,
        valid_from: new Date().toISOString().split('T')[0],
        jurisdiction: 'NL',
        confidentiality: 'intern'
      });
      itemsExtracted++;
    } catch (err) {
      console.error(`[TEXT-CHUNK] Insert failed:`, err);
    }
  }

  console.log(`[TEXT-CHUNK] ✅ Inserted ${itemsExtracted} items`);
  return { itemsExtracted, chunkIndex };
}
