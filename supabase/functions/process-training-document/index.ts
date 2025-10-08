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
              text: `Analyseer dit bedrijfsdocument (${fileName}) en extraheer belangrijke kennis zoals:
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
              type: "input_image",
              input_image: {
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
    console.error(`[VISION] ❌ Vision processing failed for ${fileName} (${aiResponse.status}):`, errorText);
    
    // ❌ STRICT FAIL: Mark document as failed without fallback to prevent worthless knowledge items
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "vision_failed",
        last_validation_error: `Vision API error (${aiResponse.status}): ${errorText.substring(0, 500)}`
      })
      .eq("file_path", filePath);
    
    throw new Error(`Vision processing failed for ${fileName}: ${errorText}`);
  }

  const aiData = await aiResponse.json();
  let extractedInfo = aiData.choices?.[0]?.message?.content || "";

  // 🔧 ROBUST JSON PARSING: Try to extract JSON from markdown code blocks
  let knowledgeItems: any[] = [];
  try {
    knowledgeItems = JSON.parse(extractedInfo);
  } catch (parseError) {
    console.error('[VISION-PARSE-ERROR] Failed to parse AI response:', parseError);
    console.log('[VISION-RAW] First 1000 chars:', extractedInfo.substring(0, 1000));
    
    // Try to extract JSON from markdown code blocks
    const jsonMatch = extractedInfo.match(/```json\s*(\[.*?\])\s*```/s);
    if (jsonMatch) {
      try {
        knowledgeItems = JSON.parse(jsonMatch[1]);
        console.log('[VISION-RECOVER] Successfully extracted JSON from markdown');
      } catch {
        console.error('[VISION] Could not recover JSON from markdown');
        await supabase
          .from("training_documents")
          .update({ 
            status: "failed",
            processing_method: "vision",
            last_validation_error: `Could not parse AI response. Raw: ${extractedInfo.substring(0, 200)}...`
          })
          .eq("file_path", filePath);
        return [];
      }
    } else {
      console.error('[VISION] No JSON found in response');
      await supabase
        .from("training_documents")
        .update({ 
          status: "failed",
          processing_method: "vision",
          last_validation_error: `AI response was not valid JSON. Raw: ${extractedInfo.substring(0, 200)}...`
        })
        .eq("file_path", filePath);
      return [];
    }
  }

  if (!knowledgeItems || knowledgeItems.length === 0) {
    console.log(`[VISION] No content extracted from document`);
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "vision",
        last_validation_error: "No knowledge items extracted from document"
      })
      .eq("file_path", filePath);
    return [];
  }

  // 🧹 COMPREHENSIVE QUALITY FILTER
  const apologeticPhrases = [
    // Nederlands
    'kan niet', 'kan geen', 'kan de', 'kan het',
    'niet lezen', 'niet openen', 'niet verwerken',
    'geen inhoud', 'geen tekst', 'geen data',
    'foutmelding', 'mislukt', 'failed',
    'helaas', 'sorry', 'excuses',
    'als je de tekst', 'plak de tekst',
    'ik heb de inhoud nodig',
    'aangezien het een pdf',
    'bestand niet lezen',
    'niet mogelijk om',
    'ik kan geen',
    
    // English
    'cannot read', 'cannot open', 'cannot process',
    'no content', 'no text', 'no data',
    'error message', 'failed', 'unfortunately',
    'as a language model', 'i apologize', 'i cannot',
    'unable to', 'failed to',
    'please provide the text',
    'i need the content',
    'since this is a pdf'
  ];

  const usefulItems = knowledgeItems.filter((item: any) => {
    const itemText = JSON.stringify(item).toLowerCase();
    const hasApologetic = apologeticPhrases.some(phrase => itemText.includes(phrase));
    
    if (hasApologetic) {
      console.log(`[QUALITY-FILTER] Blocked apologetic item: ${item.key}`);
      return false;
    }
    
    // Block if value is too short (< 3 chars) or just whitespace
    const valueText = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
    if (valueText.trim().length < 3) {
      console.log(`[QUALITY-FILTER] Blocked empty/short item: ${item.key}`);
      return false;
    }
    
    return true;
  });

  // Als ALLE items geblokkeerd zijn, fail het document
  if (usefulItems.length === 0 && knowledgeItems.length > 0) {
    console.error(`[QUALITY-FILTER] All ${knowledgeItems.length} items were apologetic/useless`);
    await supabase
      .from("training_documents")
      .update({ 
        status: "failed",
        processing_method: "vision",
        last_validation_error: "AI kon geen bruikbare informatie uit het document halen. Mogelijk is het document niet leesbaar of bevat het geen tekst."
      })
      .eq("file_path", filePath);
    return [];
  }

  // Use filtered items
  const finalKnowledgeItems = usefulItems.length > 0 ? usefulItems : knowledgeItems;
  console.log(`[VISION-QUALITY] ✅ ${finalKnowledgeItems.length} useful items (filtered ${knowledgeItems.length - finalKnowledgeItems.length})`);
    },
  ];

  // ✅ FASE 2: Extract customer entities for better retrieval
  const customerEntities = await extractCustomerEntities(
    extractedInfo,
    fileName,
    userId,
    orgId,
    LOVABLE_API_KEY
  );
  
  if (customerEntities.length > 0) {
    console.log(`[ENTITY-EXTRACT] Found ${customerEntities.length} customer entities in vision document`);
    knowledgeItems.push(...customerEntities);
  }

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

// ✅ FASE 2: Extract customer/client entities from document text
async function extractCustomerEntities(
  text: string,
  fileName: string,
  userId: string,
  orgId: string,
  lovableApiKey: string
): Promise<any[]> {
  console.log(`[ENTITY-EXTRACT] Analyzing text for customer entities (${text.length} chars)`);
  
  const prompt = `Analyseer deze tekst uit "${fileName}" en zoek naar klant/organisatie vermeldingen.

TEKST:
${text.substring(0, 10000)} ${text.length > 10000 ? '...(afgekort)' : ''}

ZOEK NAAR:
1. Klant/client namen: "Kwintes", "Prisma", "SWZ", "CitoZorg", "ABCzorg", etc.
2. Relaties met organisaties: "ABCzorg levert bij Kwintes"
3. Contract/facturatie vermeldingen met klant namen
4. Tabel vermeldingen: "Client: Kwintes | Contact: ..."

LET OP:
- Alleen EXPLICIETE vermeldingen van klant namen
- Geen afleidingen of aannames
- Focus op zakelijke relaties

Return JSON array (leeg [] als geen matches):
[{
  "customer_name": "Kwintes",
  "organization": "ABCzorg",
  "relationship_type": "active_customer",
  "context": "Korte omschrijving waar/hoe gevonden",
  "confidence": 0.92
}]`;

  try {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResponse.ok) {
      console.error(`[ENTITY-EXTRACT] AI error: ${aiResponse.status}`);
      return [];
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`[ENTITY-EXTRACT] No customer entities found in ${fileName}`);
      return [];
    }

    const entities = JSON.parse(jsonMatch[0]);
    console.log(`[ENTITY-EXTRACT] Found ${entities.length} potential customer entities`);

    const knowledgeItems = [];
    
    for (const entity of entities) {
      if (entity.confidence < 0.7) {
        console.log(`[ENTITY-EXTRACT] Skipping low confidence (${entity.confidence}): ${entity.customer_name}`);
        continue;
      }

      const key = `client_${entity.organization.toLowerCase().replace(/\s+/g, '_')}_${entity.customer_name.toLowerCase().replace(/\s+/g, '_')}`;
      
      knowledgeItems.push({
        user_id: userId,
        org_id: orgId,
        category: "client_relationship",
        key: key,
        value: {
          client: entity.organization,
          customer: entity.customer_name,
          relationship_type: entity.relationship_type,
          context: entity.context,
          extracted_from: fileName
        },
        source: `document:${fileName}`,
        confidence_score: entity.confidence,
        needs_review: entity.confidence < 0.85,
      });
      
      console.log(`[ENTITY-EXTRACT] ✅ Created entity: ${entity.customer_name} (confidence: ${entity.confidence})`);
    }

    return knowledgeItems;

  } catch (error: any) {
    console.error(`[ENTITY-EXTRACT] Error extracting entities:`, error.message);
    return [];
  }
}

// Helper: Detect professional-client relationships from knowledge items
async function detectProfessionalClientRelationships(
  supabase: any,
  knowledgeItems: any[],
  fileName: string,
  userId: string,
  orgId: string,
  lovableApiKey: string
): Promise<void> {
  console.log(`[DETECT] Analyzing ${knowledgeItems.length} items for professional-client relationships`);
  
  const context = knowledgeItems.map(item => ({
    key: item.key,
    value: item.value,
    category: item.category
  }));
  
  const prompt = `Analyseer deze kennis items uit "${fileName}" en zoek naar relaties tussen professionals en clients.

CONTEXT:
${JSON.stringify(context, null, 2)}

ZOEK NAAR PATRONEN ZOALS:
1. "Ali Budak werkt bij SWZ als VP4"
2. Tabel rijen: "Ali Budak | SWZ | VP4 | vanaf 01-01-2025"
3. Excel kolommen: "Naam | Client | Functie"
4. Contract vermeldingen: "Professional: Jan de Vries, Client: Prisma"
5. Facturatie: "Ali Budak - SWZ - uur declaratie"

LET OP VARIATIES:
- Client namen: "SWZ", "Stichting SWZ", "CitoZorg", "Prisma", "ABC Zorg", etc.
- Functieniveaus: "VP4", "VIG", "begeleider", "verpleegkundige"
- Namen: Voor- en achternaam variaties

Return JSON array (leeg [] als geen matches):
[{
  "professional_name": "Ali Budak",
  "client_name": "SWZ",
  "functie_niveau": "VP4",
  "start_date": "2025-01-01",
  "confidence": 0.92,
  "reasoning": "Duidelijk vermeld in tabel kolom"
}]

ALLEEN professionals die EXPLICIET gekoppeld zijn aan een client!`;

  try {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResponse.ok) {
      console.error(`[DETECT] AI error: ${aiResponse.status}`);
      return;
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`[DETECT] No relationships found in ${fileName}`);
      return;
    }

    const detectedRelationships = JSON.parse(jsonMatch[0]);
    console.log(`[DETECT] Found ${detectedRelationships.length} potential relationships`);

    for (const rel of detectedRelationships) {
      if (rel.confidence < 0.7) {
        console.log(`[DETECT] Skipping low confidence (${rel.confidence}): ${rel.professional_name} - ${rel.client_name}`);
        continue;
      }

      const { data: professionals } = await supabase
        .from('professionals')
        .select('id, full_name, functie_niveau')
        .eq('org_id', orgId)
        .ilike('full_name', `%${rel.professional_name}%`);

      if (!professionals || professionals.length === 0) {
        console.log(`[DETECT] Professional not found: ${rel.professional_name}`);
        continue;
      }

      const professional = professionals[0];

      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('org_id', orgId)
        .or(`name.ilike.%${rel.client_name}%,company.ilike.%${rel.client_name}%`);

      if (!clients || clients.length === 0) {
        console.log(`[DETECT] Client not found: ${rel.client_name}`);
        continue;
      }

      const client = clients[0];

      const { data: existing } = await supabase
        .from('professional_clients')
        .select('id')
        .eq('professional_id', professional.id)
        .eq('client_id', client.id)
        .eq('is_active', true);

      if (existing && existing.length > 0) {
        console.log(`[DETECT] Relationship already exists: ${professional.full_name} - ${client.name}`);
        continue;
      }

      const insertData = {
        professional_id: professional.id,
        client_id: client.id,
        start_date: rel.start_date || new Date().toISOString().split('T')[0],
        notes: `Auto-detected from ${fileName} (confidence: ${rel.confidence.toFixed(2)}) - ${rel.reasoning}${rel.confidence < 0.85 ? ' [NEEDS REVIEW]' : ''}`,
        is_active: true
      };

      await supabase.from('professional_clients').insert(insertData);
      console.log(`[DETECT] ${rel.confidence >= 0.85 ? '✅ Auto-approved' : '⏳ Needs review'}: ${professional.full_name} - ${client.name}`);

      await supabase.from('ai_learning_events').insert({
        user_id: userId,
        org_id: orgId,
        event_type: 'professional_client_detected',
        context: {
          professional_name: professional.full_name,
          client_name: client.name,
          source_file: fileName,
          confidence: rel.confidence,
          reasoning: rel.reasoning
        },
        outcome: 'pending_verification'
      });
    }

  } catch (error: any) {
    console.error(`[DETECT] Error processing relationships:`, error.message);
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
          content: `Je bent een kennisextractie expert voor bedrijfsdocumenten. 

VOOR EXCEL/CSV BESTANDEN (met pipe separators |):
1. **Detecteer tabelstructuur**: Eerste rij = headers, volgende rijen = data
2. **Extraheer per rij**: Maak voor ELKE datarij een apart knowledge item
3. **Bewaar details**: Alle kolommen → gestructureerde value object
4. **Categoriseer slim**: 
   - Organisatie namen → "organisatie_intel"
   - Professionals → "professional_info"
   - Financieel → "markt_financieel"
   - Compliance → "compliance"

VOOR GEWONE DOCUMENTEN:
- Extraheer key facts als aparte items
- Categoriseer logisch

OUTPUT FORMAT voor Excel/CSV (JSON array):
[
  {
    "category": "organisatie_intel",
    "key": "organisatie_kwintes_details",
    "value": {
      "organisatie": "Kwintes",
      "regio": "Zuid-Holland",
      "aantal_locaties": 12,
      "afdelingen": ["Zorg", "Ondersteuning"],
      "details": "..."
    },
    "confidence": 0.95
  }
]

ALLEEN facts die EXPLICIET in de data staan!`,
        },
        { 
          role: "user", 
          content: `GEËXTRAHEERDE TEKST uit document: ${fileName}

${text.includes('|') ? 'DIT IS TABELLAIRE DATA (Excel/CSV met pipe separators). Verwerk ELKE datarij als apart knowledge item.' : 'Dit is de volledige tekstuele inhoud van het document. Extraheer alle belangrijke feiten, procedures, regels en processen.'}

=== BEGIN TEKST ===
${text}
=== EINDE TEKST ===

BELANGRIJK: 
- Dit is NIET een bestandsnaam om te openen
- Dit is de VOLLEDIGE GEËXTRAHEERDE TEKST uit het document
- Analyseer deze tekst DIRECT en extraheer alle relevante kennis
- Return een JSON array met knowledge items zoals beschreven in het system prompt` 
        },
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

  // Parse AI response - expect structured JSON array for Excel files
  let knowledgeItems = [];

  try {
    // Try to parse as JSON array first (for Excel files)
    const jsonMatch = extractedInfo.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedItems = JSON.parse(jsonMatch[0]);
      
      // Transform AI output to database format
      knowledgeItems = parsedItems.map((item: any, index: number) => ({
        user_id: userId,
        org_id: orgId,
        category: item.category || "documenten",
        key: item.key || `document_${fileName}_${Date.now()}_${index}`,
        value: item.value || { content: extractedInfo, source_file: fileName },
        source: `document:${fileName}`,
        confidence_score: item.confidence || 0.9,
        needs_review: false,
        last_validation_error: null,
      }));
      
      console.log(`[EXCEL-PARSE] Extracted ${knowledgeItems.length} structured items from AI response`);
    } else {
      // Fallback: treat as single generic item
      knowledgeItems = [{
        user_id: userId,
        org_id: orgId,
        category: "documenten",
        key: `document_${fileName}_${Date.now()}`,
        value: { content: extractedInfo, source_file: fileName },
        source: `document:${fileName}`,
        confidence_score: 0.9,
        needs_review: false,
        last_validation_error: null,
      }];
      
      console.log(`[EXCEL-PARSE] Using fallback format (no JSON structure found)`);
    }
  } catch (parseError) {
    console.error(`[EXCEL-PARSE] JSON parse failed, using fallback:`, parseError);
    
    // Absolute fallback
    knowledgeItems = [{
      user_id: userId,
      org_id: orgId,
      category: "documenten",
      key: `document_${fileName}_${Date.now()}`,
      value: { content: extractedInfo, source_file: fileName },
      source: `document:${fileName}`,
      confidence_score: 0.9,
      needs_review: false,
      last_validation_error: null,
    }];
  }

  // ✅ FASE 2: Extract customer entities for better retrieval
  const customerEntities = await extractCustomerEntities(
    extractedInfo,
    fileName,
    userId,
    orgId,
    LOVABLE_API_KEY
  );
  
  if (customerEntities.length > 0) {
    console.log(`[ENTITY-EXTRACT] Found ${customerEntities.length} customer entities in text document`);
    knowledgeItems.push(...customerEntities);
  }

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

  // Quality filter: Block apologetic/worthless knowledge items
  const qualityFilteredItems = itemsToInsert.filter((item: any) => {
    const textToCheck = (
      item.key + ' ' + 
      JSON.stringify(item.value)
    ).toLowerCase();
    
    // Dutch apologetic patterns
    const dutchPatterns = [
      'kan niet openen',
      'kan het bestand niet',
      'kan het document niet',
      'geen inhoud',
      'foutmelding',
      'mislukt',
      'bestand niet lezen',
      'niet mogelijk om',
      'aangezien het een',
      'ik kan geen'
    ];
    
    // English apologetic patterns
    const englishPatterns = [
      'cannot open',
      'cannot read',
      'no content',
      'as a language model',
      'i cannot',
      'unable to',
      'failed to'
    ];
    
    const allPatterns = [...dutchPatterns, ...englishPatterns];
    const isApologetic = allPatterns.some(pattern => textToCheck.includes(pattern));
    
    if (isApologetic) {
      console.log(`[QUALITY-FILTER] ❌ Blocked apologetic item: ${item.key}`);
      return false;
    }
    
    return true;
  });
  
  // Insert only quality-filtered, non-duplicate items
  if (qualityFilteredItems.length > 0) {
    await supabase.from("ai_knowledge_base").insert(qualityFilteredItems);
    console.log(`[QUALITY-FILTER] ✅ Inserted ${qualityFilteredItems.length} quality items (${itemsToInsert.length - qualityFilteredItems.length} filtered out)`);
  } else if (itemsToInsert.length > 0) {
    console.log(`[QUALITY-FILTER] ⚠️ All ${itemsToInsert.length} items were filtered out as low quality`);
    
    // Update document status with validation error
    await supabase
      .from("training_documents")
      .update({
        status: "failed",
        last_validation_error: "Alle geëxtraheerde items werden gefilterd als waardeloze/apologetic content"
      })
      .eq("file_path", filePath);
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
    
    // NIEUW: Detect professional-client relationships
    if (LOVABLE_API_KEY && knowledgeItems.length > 0) {
      await detectProfessionalClientRelationships(
        supabase,
        knowledgeItems,
        fileName,
        userId,
        orgId,
        LOVABLE_API_KEY
      );
    }
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
      .eq('source', `document:${documentName}`)
      .is('deleted_at', null);

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
      .is('deleted_at', null);

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
        deleted_at: new Date().toISOString(),
        deleted_by: 'ai_auto_cleanup',
        deletion_reason: { auto_resolved: analysis.reasoning }
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
