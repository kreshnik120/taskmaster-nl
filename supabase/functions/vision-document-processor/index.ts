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
    if (new Date() > CUTOFF_DATE) {
      return new Response(JSON.stringify({ 
        stopped: true, 
        reason: 'Free period ended',
        message: 'Vision processing available on-demand only after free period'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    const { document_url, document_type, storage_path } = await req.json();

    console.log(`👁️ Vision Document Processor analyzing ${document_type}...`);

    // Fetch document from storage if storage_path provided
    let documentData = null;
    if (storage_path) {
      const { data, error } = await supabase.storage
        .from(storage_path.split('/')[0])
        .download(storage_path.split('/').slice(1).join('/'));

      if (error) throw error;

      // Convert to base64 for Vision API
      const buffer = await data.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      documentData = base64;
    }

    // Determine prompt based on document type
    let visionPrompt = '';
    let expectedOutput = {};

    switch (document_type) {
      case 'cv':
        visionPrompt = `Analyseer deze CV/curriculum vitae en extract ALLE relevante informatie.

Output ALLEEN valid JSON:
{
  "personal_info": {"name": "...", "email": "...", "phone": "...", "address": "..."},
  "work_experience": [{"company": "...", "role": "...", "period": "...", "description": "..."}],
  "education": [{"institution": "...", "degree": "...", "period": "..."}],
  "skills": ["skill1", "skill2"],
  "certifications": [{"name": "...", "issuer": "...", "date": "..."}],
  "languages": [{"language": "...", "level": "..."}],
  "summary": "kort overzicht van profiel"
}`;
        break;

      case 'contract':
        visionPrompt = `Analyseer dit contract document en extract ALLE belangrijke informatie.

Output ALLEEN valid JSON:
{
  "contract_type": "arbeidsovereenkomst/ZZP/etc",
  "parties": [{"name": "...", "role": "opdrachtgever/opdrachtnemer"}],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "hourly_rate": 0.00,
  "weekly_hours": 0,
  "special_conditions": ["conditie1", "conditie2"],
  "termination_terms": "...",
  "payment_terms": "...",
  "cao_mentioned": true/false,
  "key_clauses": [{"clause": "...", "importance": "high/medium/low"}]
}`;
        break;

      case 'invoice':
        visionPrompt = `Analyseer deze factuur en extract ALLE gegevens.

Output ALLEEN valid JSON:
{
  "invoice_number": "...",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "supplier": {"name": "...", "kvk": "...", "address": "..."},
  "customer": {"name": "...", "address": "..."},
  "line_items": [{"description": "...", "quantity": 0, "unit_price": 0.00, "total": 0.00}],
  "subtotal": 0.00,
  "vat_amount": 0.00,
  "total_amount": 0.00,
  "payment_status": "paid/unpaid/overdue"
}`;
        break;

      default:
        visionPrompt = `Analyseer dit document en extract ALLE tekstuele informatie en structuur.

Output ALLEEN valid JSON:
{
  "document_type": "detected_type",
  "main_content": "...",
  "key_information": {"key1": "value1", "key2": "value2"},
  "tables": [{"headers": [...], "rows": [[...]]}],
  "metadata": {"dates": [...], "people": [...], "organizations": [...]}
}`;
    }

    // Call Gemini 2.5 Pro Vision
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
              { type: 'text', text: visionPrompt },
              document_url 
                ? { type: 'image_url', image_url: { url: document_url } }
                : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${documentData}` } }
            ]
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!visionResponse.ok) {
      if (visionResponse.status === 429) throw new Error('Rate limit exceeded');
      if (visionResponse.status === 402) throw new Error('AI credits exhausted');
      throw new Error(`Vision API error: ${visionResponse.status}`);
    }

    const visionData = await visionResponse.json();
    const visionContent = visionData.choices[0].message.content;

    let extractedData;
    try {
      const jsonMatch = visionContent.match(/\{[\s\S]*\}/);
      extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(visionContent);
    } catch {
      extractedData = { error: 'Failed to parse document', raw_content: visionContent };
    }

    // Store extracted data as knowledge
    const knowledgeItems = [];

    if (document_type === 'cv' && extractedData.personal_info) {
      knowledgeItems.push({
        org_id: userOrg!.org_id,
        user_id: user.id,
        category: 'professionals_extracted',
        key: `cv_${extractedData.personal_info.name?.toLowerCase().replace(/\s+/g, '_')}`,
        value: extractedData,
        confidence_score: 0.85,
        source: `vision-processor:${document_type}`
      });
    } else if (document_type === 'contract' && extractedData.contract_type) {
      knowledgeItems.push({
        org_id: userOrg!.org_id,
        user_id: user.id,
        category: 'contracten_extracted',
        key: `contract_${extractedData.parties?.[0]?.name?.toLowerCase().replace(/\s+/g, '_')}`,
        value: extractedData,
        confidence_score: 0.9,
        source: `vision-processor:${document_type}`
      });
    } else {
      knowledgeItems.push({
        org_id: userOrg!.org_id,
        user_id: user.id,
        category: `${document_type}_extracted`,
        key: `doc_${Date.now()}`,
        value: extractedData,
        confidence_score: 0.8,
        source: `vision-processor:${document_type}`
      });
    }

    // Store in database
    const { data: insertedKnowledge, error: insertError } = await supabase
      .from('ai_knowledge_base')
      .insert(knowledgeItems)
      .select();

    if (insertError) {
      console.error('Failed to store extracted knowledge:', insertError);
    }

    console.log(`✅ Document processed and ${insertedKnowledge?.length || 0} knowledge items stored`);

    return new Response(JSON.stringify({
      success: true,
      document_type: document_type,
      extracted_data: extractedData,
      knowledge_items_stored: insertedKnowledge?.length || 0,
      model_used: 'gemini-2.5-pro-vision'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Vision Document Processor error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});