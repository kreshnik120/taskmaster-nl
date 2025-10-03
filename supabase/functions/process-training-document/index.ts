import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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
    const isExcel = fileName.toLowerCase().match(/\.(xlsx?|xls)$/i);

    // For large files, process in background
    if (isLargeFile) {
      console.log(`[PROCESS-DOC] Large file detected, processing in background`);
      
      // Start background processing with appropriate method
      if (isPdf || isDocx) {
        processLargeFileWithVisionInBackground(supabase, filePath, fileName, fileBlob, docData.user_id, docData.org_id);
      } else if (isExcel) {
        processExcelInBackground(supabase, filePath, fileName, fileBlob, docData.user_id, docData.org_id);
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
    } else if (isExcel) {
      await processExcelFile(supabase, filePath, fileName, fileBlob, docData.user_id, docData.org_id);
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

async function processExcelFile(
  supabase: any,
  filePath: string,
  fileName: string,
  fileBlob: ArrayBuffer,
  userId: string,
  orgId: string
): Promise<any[]> {
  console.log(`[EXCEL] Processing Excel file: ${fileName}`);
  
  // Parse workbook
  const workbook = XLSX.read(new Uint8Array(fileBlob), { type: 'array' });
  
  // Convert alle sheets naar text
  let fullText = `Excel bestand: ${fileName}\n\n`;
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    
    // Convert naar CSV met pipe separator voor betere AI parsing
    const csv = XLSX.utils.sheet_to_csv(sheet, { 
      FS: ' | ', // Pipe separator
      RS: '\n'
    });
    
    fullText += `=== Sheet: "${sheetName}" ===\n${csv}\n\n`;
  });
  
  console.log(`[EXCEL] Extracted ${fullText.length} characters from ${workbook.SheetNames.length} sheets`);
  
  // Process met text-based AI (efficiënt en goedkoop)
  return await processWithText(
    supabase, 
    filePath, 
    fileName, 
    fullText, 
    userId, 
    orgId, 
    0
  );
}

async function processExcelInBackground(
  supabase: any,
  filePath: string,
  fileName: string,
  fileBlob: ArrayBuffer,
  userId: string,
  orgId: string
) {
  try {
    console.log(`[EXCEL] Processing large Excel file in background: ${fileName}`);
    
    // Parse workbook
    const workbook = XLSX.read(new Uint8Array(fileBlob), { type: 'array' });
    
    // Convert alle sheets naar text
    let fullText = `Excel bestand: ${fileName}\n\n`;
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { 
        FS: ' | ',
        RS: '\n'
      });
      fullText += `=== Sheet: "${sheetName}" ===\n${csv}\n\n`;
    });
    
    console.log(`[EXCEL] Extracted ${fullText.length} characters, processing with text chunking`);
    
    // Use text chunking for large Excel files
    await processLargeFileInBackground(supabase, filePath, fileName, fullText, userId, orgId);
    
  } catch (error: any) {
    console.error(`[EXCEL] Background processing failed:`, error);
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "excel"
      })
      .eq("file_path", filePath);
  }
}

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

  // Convert to base64 with chunked encoding to prevent call stack overflow
  const base64 = arrayBufferToBase64(fileBlob);
  
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
  
  // Auto-detect conflicts for newly uploaded content
  await autoDetectConflictsAfterUpload(supabase, fileName);
  
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
    
    // Auto-detect conflicts for newly uploaded content
    await autoDetectConflictsAfterUpload(supabase, fileName);
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
      needs_review: false,
      last_validation_error: null,
    },
  ];

  // SPRINT 2: Enhanced duplicate detection with semantic analysis
  const itemsToInsert = [];
  
  for (const newItem of knowledgeItems) {
    const simplifiedKey = newItem.key.replace(/_\d+$/, '');
    
    // STEP 1: Basic key-based pre-filter (fast initial check)
    const { data: candidateItems } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('category', newItem.category)
      .eq('org_id', orgId)
      .is('deleted_at', null);
    
    let shouldInsert = true;
    
    // STEP 2: Semantic duplicate check (if candidates found and API key available)
    if (candidateItems && candidateItems.length > 0 && LOVABLE_API_KEY) {
      console.log(`[SEMANTIC] Checking ${candidateItems.length} candidates for: ${newItem.key}`);
      
      const semanticDuplicates = await findSemanticDuplicates(
        newItem,
        candidateItems,
        LOVABLE_API_KEY
      );
      
      if (semanticDuplicates.length > 0) {
        const topMatch = semanticDuplicates[0];
        console.log(`🔍 Semantic duplicate found: ${(topMatch.similarity * 100).toFixed(0)}% similarity with item ${topMatch.id}`);
        
        // >90% similarity → very likely exact duplicate → skip
        if (topMatch.similarity > 0.90) {
          console.log(`⏭️ Skipping insert (high similarity duplicate)`);
          
          // BOOST confidence of existing item instead
          const existingItem = candidateItems.find((c: any) => c.id === topMatch.id);
          if (existingItem) {
            await supabase
              .from('ai_knowledge_base')
              .update({
                confidence_score: Math.min(1.0, (existingItem.confidence_score || 0.5) + 0.1),
                usage_count: (existingItem.usage_count || 0) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('id', topMatch.id);
          }
          
          shouldInsert = false;
          continue;
        }
        
        // 85-90% → possible variant → insert but mark as needs review
        if (topMatch.similarity > 0.85) {
          console.log(`⚠️ Possible variant detected (${(topMatch.similarity * 100).toFixed(0)}%), inserting with needs_review flag`);
          (newItem as any).needs_review = true;
          (newItem as any).last_validation_error = `Mogelijke variant van item ${topMatch.id}: ${topMatch.reason}`;
        }
      }
    } else if (candidateItems && candidateItems.length > 0) {
      // FALLBACK: Basic exact value matching (if no API key)
      for (const existing of candidateItems) {
        const isSameValue = JSON.stringify(existing.value) === JSON.stringify(newItem.value);
        
        if (isSameValue) {
          console.log(`✅ Exact match found, boosting confidence: ${existing.key}`);
          await supabase
            .from('ai_knowledge_base')
            .update({
              confidence_score: Math.min(1.0, (existing.confidence_score || 0.5) + 0.1),
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
          
          shouldInsert = false;
          break;
        }
      }
    }
    
    if (shouldInsert) {
      itemsToInsert.push(newItem);
    }
  }

  // Insert only non-duplicate items
  if (itemsToInsert.length > 0) {
    await supabase.from("ai_knowledge_base").insert(itemsToInsert);
  }

  // Update status for small files only
  if (currentProgress === 0) {
    // Detect if this is Excel processing
    const isExcel = fileName.toLowerCase().match(/\.(xlsx?|xls)$/i);
    
    await supabase
      .from("training_documents")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        extracted_knowledge_count: knowledgeItems.length,
        processing_progress: 100,
        processing_method: isExcel ? "excel" : "text"
      })
      .eq("file_path", filePath);
    
    // Auto-detect conflicts for newly uploaded content
    await autoDetectConflictsAfterUpload(supabase, fileName);
  }

  return knowledgeItems;
}

// SPRINT 2: Semantic duplicate detection function
async function findSemanticDuplicates(
  newItem: { key: string; value: any; category: string },
  existingItems: any[],
  lovableApiKey: string
): Promise<Array<{ id: string; similarity: number; reason: string }>> {
  const sameCategoryItems = existingItems.filter(item => item.category === newItem.category);
  
  if (sameCategoryItems.length === 0) return [];
  
  const semanticMatches: Array<{ id: string; similarity: number; reason: string }> = [];
  
  // Check top 5 most relevant existing items (performance optimization)
  const topItems = sameCategoryItems.slice(0, 5);
  
  for (const existingItem of topItems) {
    const prompt = `Vergelijk deze twee knowledge items semantisch:

NIEUW ITEM:
Key: ${newItem.key}
Value: ${JSON.stringify(newItem.value, null, 2)}

BESTAAND ITEM:
Key: ${existingItem.key}
Value: ${JSON.stringify(existingItem.value, null, 2)}

Analyseer:
1. Betekenen ze hetzelfde?
2. Is het dezelfde informatie in andere woorden?
3. Overlappen ze qua context?

Return ALLEEN een JSON object:
{
  "similarity": 0.0-1.0,
  "reason": "kort waarom wel/niet duplicate"
}`;

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.similarity >= 0.85) {
          semanticMatches.push({
            id: existingItem.id,
            similarity: parsed.similarity,
            reason: parsed.reason || "Semantisch vergelijkbaar"
          });
        }
      }
    } catch (error) {
      console.error(`[SEMANTIC] Error comparing items:`, error);
    }
  }
  
  return semanticMatches.sort((a, b) => b.similarity - a.similarity);
}

// ============= AUTO CONFLICT DETECTION =============
async function autoDetectConflictsAfterUpload(
  supabaseClient: any,
  documentName: string
): Promise<void> {
  console.log(`[AUTO-DETECT] Starting conflict detection for: ${documentName}`);
  
  try {
    // Get all items from this document upload
    const { data: newItems, error: fetchError } = await supabaseClient
      .from('ai_knowledge_base')
      .select('*')
      .eq('source', documentName)
      .is('soft_deleted_at', null);

    if (fetchError || !newItems || newItems.length === 0) {
      console.log(`[AUTO-DETECT] No new items found for ${documentName}`);
      return;
    }

    console.log(`[AUTO-DETECT] Found ${newItems.length} new items to analyze`);

    // Run conflict detection for each new item
    for (const item of newItems) {
      await detectConflictsForItem(supabaseClient, item);
    }

    console.log(`[AUTO-DETECT] Completed conflict detection for ${documentName}`);
  } catch (error) {
    console.error(`[AUTO-DETECT] Error in auto-detection:`, error);
  }
}

async function detectConflictsForItem(supabaseClient: any, item: any): Promise<void> {
  try {
    // Find potentially conflicting items (excluding the item itself)
    const { data: allItems, error } = await supabaseClient
      .from('ai_knowledge_base')
      .select('*')
      .neq('id', item.id)
      .is('soft_deleted_at', null);

    if (error || !allItems) return;

    // Look for semantic conflicts
    const conflicts: any[] = [];
    
    for (const other of allItems) {
      // Quick category/keyword filter
      const hasOverlap = 
        item.category === other.category ||
        item.keywords?.some((k: string) => other.keywords?.includes(k));
      
      if (!hasOverlap) continue;

      // Check semantic similarity
      const similarity = await checkSemanticSimilarity(item, other);
      
      if (similarity >= 0.70) {
        conflicts.push({ item: other, similarity });
      }
    }

    if (conflicts.length === 0) return;

    // Analyze conflicts using AI
    const analysis = await deepConflictAnalysisForUpload(
      supabaseClient,
      item,
      conflicts
    );

    // Handle based on confidence tier
    if (analysis.confidence >= 0.95) {
      // Tier 1: Auto-resolve
      await handleTier1AutoResolve(supabaseClient, item, analysis);
    } else if (analysis.confidence >= 0.70) {
      // Tier 2: Create AI suggestion
      await handleTier2Suggestion(supabaseClient, item, analysis);
    } else {
      // Tier 3: Mark for review
      await handleTier3Review(supabaseClient, item, analysis);
    }

  } catch (error) {
    console.error(`[AUTO-DETECT] Error detecting conflicts for item ${item.id}:`, error);
  }
}

async function checkSemanticSimilarity(item1: any, item2: any): Promise<number> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return 0;

  try {
    const prompt = `Compare these two knowledge items and rate their semantic similarity (0-1):

Item 1: ${item1.content}
Item 2: ${item2.content}

Return ONLY a JSON object: {"similarity": 0.X}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return 0;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.similarity || 0;
    }
  } catch (error) {
    console.error(`[SIMILARITY] Error:`, error);
  }
  
  return 0;
}

async function deepConflictAnalysisForUpload(
  supabaseClient: any,
  newItem: any,
  conflicts: any[]
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { confidence: 0.5, action: "preserve_all", reasoning: "No API key" };
  }

  try {
    const prompt = `Analyze this knowledge conflict:

NEW ITEM (just uploaded):
- Content: ${newItem.content}
- Category: ${newItem.category}
- Source: ${newItem.source}

CONFLICTING ITEMS (${conflicts.length}):
${conflicts.map((c, i) => `${i + 1}. Content: ${c.item.content}\n   Similarity: ${(c.similarity * 100).toFixed(1)}%\n   Confidence: ${c.item.confidence_score}`).join('\n')}

Determine:
1. Is this a true conflict or complementary information?
2. Which item(s) should be kept?
3. Should any be soft-deleted?

Return JSON:
{
  "confidence": 0.XX (0-1, how certain you are),
  "action": "keep_new" | "keep_existing" | "preserve_all",
  "items_to_delete": [item_ids],
  "reasoning": "explanation"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return { confidence: 0.5, action: "preserve_all", reasoning: "API error" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error(`[DEEP-ANALYSIS] Error:`, error);
  }

  return { confidence: 0.5, action: "preserve_all", reasoning: "Analysis failed" };
}

async function handleTier1AutoResolve(
  supabaseClient: any,
  item: any,
  analysis: any
): Promise<void> {
  console.log(`[TIER-1] Auto-resolving conflict for item ${item.id} (confidence: ${analysis.confidence})`);
  
  const idsToDelete = analysis.items_to_delete || [];
  
  for (const id of idsToDelete) {
    await supabaseClient
      .from('ai_knowledge_base')
      .update({
        soft_deleted_at: new Date().toISOString(),
        soft_deleted_by: 'ai_auto_cleanup',
        soft_delete_reason: `Auto-resolved: ${analysis.reasoning}`
      })
      .eq('id', id);
  }

  // Log to business_intelligence
  await supabaseClient
    .from('business_intelligence')
    .insert({
      type: 'auto_cleanup',
      confidence_score: analysis.confidence,
      ai_reasoning: analysis.reasoning,
      affected_item_ids: idsToDelete,
      metadata: { trigger: 'document_upload', item_id: item.id }
    });
}

async function handleTier2Suggestion(
  supabaseClient: any,
  item: any,
  analysis: any
): Promise<void> {
  console.log(`[TIER-2] Creating AI suggestion for item ${item.id} (confidence: ${analysis.confidence})`);
  
  await supabaseClient
    .from('business_intelligence')
    .insert({
      type: 'ai_suggestion',
      confidence_score: analysis.confidence,
      ai_reasoning: analysis.reasoning,
      recommended_action: analysis.action,
      affected_item_ids: analysis.items_to_delete || [],
      metadata: { trigger: 'document_upload', item_id: item.id }
    });
}

async function handleTier3Review(
  supabaseClient: any,
  item: any,
  analysis: any
): Promise<void> {
  console.log(`[TIER-3] Marking for review: item ${item.id} (confidence: ${analysis.confidence})`);
  
  await supabaseClient
    .from('ai_knowledge_base')
    .update({ needs_review: true })
    .eq('id', item.id);

  await supabaseClient
    .from('business_intelligence')
    .insert({
      type: 'data_quality',
      confidence_score: analysis.confidence,
      ai_reasoning: `Low confidence conflict - needs human review: ${analysis.reasoning}`,
      affected_item_ids: [item.id],
      metadata: { trigger: 'document_upload' }
    });
}
