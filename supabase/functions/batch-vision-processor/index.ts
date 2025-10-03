import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRITICAL: Auto-disable after free period
    if (new Date() > CUTOFF_DATE) {
      console.log('⛔ Batch Vision Processor DISABLED: Free period ended');
      return new Response(JSON.stringify({ 
        stopped: true, 
        reason: 'Vision processor disabled after free period to prevent costs'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Always use SERVICE_ROLE_KEY for autonomous operation
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get first organization for autonomous mode
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (orgsError || !orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    
    const { data: orgUser } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('org_id', orgId)
      .limit(1)
      .single();
    
    const userId = orgUser?.user_id || orgId;
    console.log('🤖 Batch Vision Processor running for org:', orgId);

    // Fetch all "processing" documents from training_documents bucket
    const { data: files, error: filesError } = await supabase
      .storage
      .from('training-documents')
      .list();

    if (filesError) {
      console.error('Error listing files:', filesError);
      return new Response(JSON.stringify({ error: 'Failed to list files' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!files || files.length === 0) {
      console.log('📄 No documents found to process');
      return new Response(JSON.stringify({ 
        success: true, 
        documents_processed: 0,
        message: 'No documents found in storage'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📄 Found ${files.length} documents to process`);

    const processedDocuments = [];
    const newKnowledge = [];
    let totalTokens = 0;

    for (const file of files.slice(0, 10)) { // Process max 10 docs per run to avoid timeout
      try {
        console.log(`🔍 Processing: ${file.name}`);

        // Download file
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('training-documents')
          .download(file.name);

        if (downloadError) {
          console.error(`Error downloading ${file.name}:`, downloadError);
          continue;
        }

        // Convert to base64
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        // Detect document type from filename
        const fileName = file.name.toLowerCase();
        let documentType = 'general';
        let categoryPrefix = 'document_data';
        
        if (fileName.includes('cv') || fileName.includes('resume')) {
          documentType = 'cv';
          categoryPrefix = 'professional_skills';
        } else if (fileName.includes('contract') || fileName.includes('overeenkomst')) {
          documentType = 'contract';
          categoryPrefix = 'contract_terms';
        } else if (fileName.includes('rooster') || fileName.includes('planning') || fileName.includes('schedule')) {
          documentType = 'schedule';
          categoryPrefix = 'shift_patterns';
        } else if (fileName.includes('factuur') || fileName.includes('invoice')) {
          documentType = 'invoice';
          categoryPrefix = 'billing_data';
        }

        // Determine appropriate prompt based on document type
        let extractionPrompt = '';
        switch (documentType) {
          case 'cv':
            extractionPrompt = `Extract from this CV/Resume:
- Full name and contact info
- Education and certifications (especially healthcare: BIG, LRZa, VOG, etc.)
- Work experience (years, roles, organizations)
- Skills and specializations
- Languages
- Availability preferences
- Desired hourly rate (if mentioned)

Return ONLY valid JSON:
{
  "name": "full name",
  "phone": "phone number",
  "email": "email",
  "certifications": ["BIG", "LRZa", etc],
  "experience_years": 5,
  "roles": ["Verpleegkundige niveau 4", etc],
  "skills": ["skill1", "skill2"],
  "languages": ["Dutch", "English"],
  "availability": "full-time/part-time/zzp",
  "hourly_rate": 35.50,
  "confidence": 0.8
}`;
            break;
          case 'contract':
            extractionPrompt = `Extract from this contract:
- Client/organization name
- Professional name
- Start date and end date
- Hourly rate and billing structure
- Working hours per week
- Special conditions and allowances
- Notice period
- Payment terms

Return ONLY valid JSON:
{
  "client_name": "organization",
  "professional_name": "name",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "hourly_rate": 42.50,
  "hours_per_week": 32,
  "conditions": ["condition1", "condition2"],
  "allowances": {"ORT": 1.50, "weekend": 2.00},
  "payment_terms": "monthly",
  "confidence": 0.8
}`;
            break;
          case 'schedule':
            extractionPrompt = `Extract from this schedule/planning:
- Week number or date range
- Professional names and their shifts
- Shift times (start-end)
- Client/location names
- Break times
- Special notes (e.g., sick leave, vacation)

Return ONLY valid JSON:
{
  "week": "2025-W15",
  "shifts": [
    {
      "professional": "Name",
      "date": "YYYY-MM-DD",
      "start_time": "08:00",
      "end_time": "16:00",
      "client": "Client X",
      "break_minutes": 30
    }
  ],
  "notes": ["note1"],
  "confidence": 0.8
}`;
            break;
          case 'invoice':
            extractionPrompt = `Extract from this invoice:
- Invoice number
- Client name
- Professional name
- Invoice date
- Hours worked
- Hourly rate
- Total amount
- Payment due date
- Services/activities description

Return ONLY valid JSON:
{
  "invoice_number": "INV-2025-001",
  "client": "Client X",
  "professional": "Name",
  "date": "YYYY-MM-DD",
  "hours": 160,
  "rate": 42.50,
  "total": 6800.00,
  "due_date": "YYYY-MM-DD",
  "services": ["Verpleegkundige diensten"],
  "confidence": 0.8
}`;
            break;
          default:
            extractionPrompt = `Extract key information from this document:
- Document type
- Key dates
- Names (people, organizations)
- Numbers (amounts, quantities, rates)
- Important terms or conditions

Return ONLY valid JSON with extracted data and confidence score.`;
        }

        // Call Vision API
        const visionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-pro',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: extractionPrompt
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${fileData.type};base64,${base64}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 2000,
          }),
        });

        if (!visionResponse.ok) {
          console.error(`Vision API error for ${file.name}:`, visionResponse.status);
          continue;
        }

        const visionData = await visionResponse.json();
        const extractedContent = visionData.choices[0].message.content;
        totalTokens += visionData.usage?.total_tokens || 0;

        // Parse extracted JSON
        let extractedData;
        try {
          const jsonMatch = extractedContent.match(/\{[\s\S]*\}/);
          extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(extractedContent);
        } catch {
          console.error(`Failed to parse JSON for ${file.name}`);
          continue;
        }

        // Store extracted data as knowledge items
        const confidence = extractedData.confidence || 0.7;
        delete extractedData.confidence;

        newKnowledge.push({
          org_id: orgId,
          user_id: userId,
          category: `${categoryPrefix}_vision`,
          key: `${documentType}_${file.name}_${Date.now()}`,
          value: {
            document_name: file.name,
            document_type: documentType,
            extracted_data: extractedData,
            processed_at: new Date().toISOString(),
            file_size: file.metadata?.size || 0
          },
          confidence_score: confidence,
          source: `vision-processor:${file.name}`,
          last_used_at: new Date().toISOString()
        });

        processedDocuments.push({
          name: file.name,
          type: documentType,
          success: true
        });

        console.log(`✅ Processed ${file.name} (${documentType})`);

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        processedDocuments.push({
          name: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Store all extracted knowledge
    if (newKnowledge.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_knowledge_base')
        .insert(newKnowledge);

      if (insertError) {
        console.error('Error storing knowledge:', insertError);
      } else {
        console.log(`📚 Stored ${newKnowledge.length} knowledge items from documents`);
      }
    }

    // Log function call
    await supabase
      .from('function_call_logs')
      .insert({
        org_id: orgId,
        user_id: userId,
        function_name: 'batch-vision-processor',
        success: true,
        total_tokens: totalTokens,
        model_used: 'gemini-2.5-pro',
        estimated_cost_eur: totalTokens * 0.000001 * 0.15
      });

    return new Response(JSON.stringify({
      success: true,
      documents_found: files.length,
      documents_processed: processedDocuments.length,
      knowledge_items_created: newKnowledge.length,
      total_tokens: totalTokens,
      processed_documents: processedDocuments,
      warning: 'This function will be auto-disabled after October 6th'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Batch Vision Processor error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
