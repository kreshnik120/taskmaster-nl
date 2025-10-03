import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LARGE_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const CHUNK_SIZE = 50000; // 50k characters per chunk

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { filePath, fileName } = await req.json();

    // Get file size first
    const { data: docData } = await supabase
      .from("training_documents")
      .select("file_size, user_id, org_id")
      .eq("file_path", filePath)
      .single();

    if (!docData) throw new Error("Document not found in database");

    const fileSize = docData.file_size;
    const isLargeFile = fileSize > LARGE_FILE_SIZE;

    console.log(`[PROCESS-DOC] File: ${fileName}, Size: ${(fileSize / 1024 / 1024).toFixed(2)}MB, Large: ${isLargeFile}`);

    // Download file as binary
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("training-documents")
      .download(filePath);

    if (downloadError) throw downloadError;

    const fileBlob = await fileData.arrayBuffer();

    // Detect file type for routing
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const isDocx = fileName.toLowerCase().endsWith('.docx');

    // For large files, process in background
    if (isLargeFile) {
      console.log(`[PROCESS-DOC] Large file detected, processing in background`);
      
      // Start background processing with appropriate method
      if (isPdf || isDocx) {
        processLargeFileWithVisionInBackground(supabase, filePath, fileName, fileBlob, docData.user_id, docData.org_id);
      } else {
        const text = new TextDecoder().decode(fileBlob);
        processLargeFileInBackground(supabase, filePath, fileName, text, docData.user_id, docData.org_id);
      }
      
      // Return immediate response
      return new Response(
        JSON.stringify({ success: true, message: "Processing in background" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Small files: process immediately with appropriate method
    if (isPdf || isDocx) {
      await processWithVision(supabase, filePath, fileName, fileBlob, docData.user_id, docData.org_id);
    } else {
      const text = new TextDecoder().decode(fileBlob);
      await processWithText(supabase, filePath, fileName, text, docData.user_id, docData.org_id, 0);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[PROCESS-DOC] Error:", error);

    // Update status to failed
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const { filePath } = await req.json();
      await supabase
        .from("training_documents")
        .update({ status: "failed" })
        .eq("file_path", filePath);
    } catch {}

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processWithVision(
  supabase: any,
  filePath: string,
  fileName: string,
  fileBlob: ArrayBuffer,
  userId: string,
  orgId: string
): Promise<any[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY niet geconfigureerd");
  }

  console.log(`[PROCESS-DOC] Processing with Vision API: ${fileName}`);

  // Convert to base64
  const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBlob)));
  
  // Detect MIME type
  const mimeType = fileName.toLowerCase().endsWith('.pdf') 
    ? 'application/pdf' 
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            {
              type: "text",
              content: `Analyseer dit bedrijfsdocument (${fileName}) en extraheer belangrijke kennis zoals:
- Bedrijfsprocessen en workflows
- Standaard procedures en protocollen
- Klantinformatie (namen, adressen, contactgegevens)
- Tarieven en prijsafspraken
- Contractvoorwaarden
- Regels en richtlijnen
- Facturatie details

Geef je antwoord als gestructureerde kennis items in helder Nederlands.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`
              }
            }
          ]
        }
      ]
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error(`[VISION] AI error (${aiResponse.status}):`, errorText);
    
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "vision"
      })
      .eq("file_path", filePath);
    
    throw new Error(`Vision API mislukt: ${errorText}`);
  }

  const aiData = await aiResponse.json();
  const extractedInfo = aiData.choices?.[0]?.message?.content || "";

  if (!extractedInfo) {
    console.log(`[VISION] No content extracted from document`);
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "vision"
      })
      .eq("file_path", filePath);
    return [];
  }

  const knowledgeItems = [
    {
      user_id: userId,
      org_id: orgId,
      category: "documenten",
      key: `document_${fileName}_${Date.now()}`,
      value: { content: extractedInfo, source_file: fileName },
      source: `document:${fileName}`,
      confidence_score: 0.95,
    },
  ];

  await supabase.from("ai_knowledge_base").insert(knowledgeItems);

  await supabase
    .from("training_documents")
    .update({
      status: "completed",
      processed_at: new Date().toISOString(),
      extracted_knowledge_count: knowledgeItems.length,
      processing_progress: 100,
      processing_method: "vision"
    })
    .eq("file_path", filePath);

  console.log(`[VISION] Successfully processed: ${knowledgeItems.length} knowledge items`);
  return knowledgeItems;
}

async function processLargeFileWithVisionInBackground(
  supabase: any,
  filePath: string,
  fileName: string,
  fileBlob: ArrayBuffer,
  userId: string,
  orgId: string
) {
  try {
    console.log(`[PROCESS-DOC] Processing large document with Vision: ${fileName}`);
    
    // For large PDFs, process as a single vision request
    // (Vision API handles the entire document at once)
    const knowledgeItems = await processWithVision(
      supabase,
      filePath,
      fileName,
      fileBlob,
      userId,
      orgId
    );

    console.log(`[PROCESS-DOC] Large file completed: ${knowledgeItems.length} knowledge items extracted`);
  } catch (error: any) {
    console.error(`[PROCESS-DOC] Background vision processing failed:`, error);
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "vision"
      })
      .eq("file_path", filePath);
  }
}

async function processLargeFileInBackground(
  supabase: any,
  filePath: string,
  fileName: string,
  text: string,
  userId: string,
  orgId: string
) {
  try {
    const chunks = Math.ceil(text.length / CHUNK_SIZE);
    console.log(`[PROCESS-DOC] Processing ${chunks} text chunks for ${fileName}`);

    let allKnowledgeItems: any[] = [];

    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min((i + 1) * CHUNK_SIZE, text.length);
      const chunk = text.slice(start, end);
      
      console.log(`[PROCESS-DOC] Processing chunk ${i + 1}/${chunks} (${chunk.length} chars)`);

      const progress = Math.round(((i + 1) / chunks) * 100);
      
      const knowledgeItems = await processWithText(
        supabase,
        filePath,
        fileName,
        chunk,
        userId,
        orgId,
        progress
      );
      
      allKnowledgeItems = allKnowledgeItems.concat(knowledgeItems);
      
      // Update progress
      await supabase
        .from("training_documents")
        .update({ processing_progress: progress })
        .eq("file_path", filePath);
    }

    // Mark as completed
    await supabase
      .from("training_documents")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        extracted_knowledge_count: allKnowledgeItems.length,
        processing_progress: 100,
        processing_method: "text"
      })
      .eq("file_path", filePath);

    console.log(`[PROCESS-DOC] Completed: ${allKnowledgeItems.length} knowledge items extracted`);
  } catch (error: any) {
    console.error(`[PROCESS-DOC] Background processing failed:`, error);
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "text"
      })
      .eq("file_path", filePath);
  }
}

async function processWithText(
  supabase: any,
  filePath: string,
  fileName: string,
  text: string,
  userId: string,
  orgId: string,
  currentProgress: number
): Promise<any[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY niet geconfigureerd");
  }

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Analyseer dit bedrijfsdocument en extraheer belangrijke kennis zoals:
- Bedrijfsprocessen
- Standaard procedures
- Klantinformatie
- Regels en richtlijnen
- Workflow stappen

Geef je antwoord als gestructureerde kennis items.`,
        },
        { role: "user", content: `Document: ${fileName}\n\n${text}` },
      ],
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    throw new Error(`AI verwerking mislukt: ${errorText}`);
  }

  const aiData = await aiResponse.json();
  const extractedInfo = aiData.choices?.[0]?.message?.content || "";

  if (!extractedInfo) {
    console.log(`[PROCESS-DOC] No content extracted from chunk`);
    return [];
  }

  const knowledgeItems = [
    {
      user_id: userId,
      org_id: orgId,
      category: "documenten",
      key: `document_${fileName}_${Date.now()}`,
      value: { content: extractedInfo, source_file: fileName },
      source: `document:${fileName}`,
      confidence_score: 0.9,
    },
  ];

  await supabase.from("ai_knowledge_base").insert(knowledgeItems);

  // Update status for small files only
  if (currentProgress === 0) {
    await supabase
      .from("training_documents")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        extracted_knowledge_count: knowledgeItems.length,
        processing_progress: 100,
        processing_method: "text"
      })
      .eq("file_path", filePath);
  }

  return knowledgeItems;
}
