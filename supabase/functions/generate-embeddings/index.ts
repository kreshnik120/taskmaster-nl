import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50; // Process 50 items per run

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Starting embedding generation batch...');

    // STEP 1: Find knowledge items without embeddings
    const { data: allItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value')
      .is('deleted_at', null)
      .limit(500); // Fetch larger batch for client-side filtering

    if (fetchError) {
      throw fetchError;
    }

    // Fetch existing embedding IDs
    const { data: existingEmbeddings, error: embError } = await supabase
      .from('knowledge_embeddings')
      .select('knowledge_id');

    if (embError) {
      throw embError;
    }

    // Create Set for O(1) lookup
    const existingIds = new Set(existingEmbeddings?.map(e => e.knowledge_id) || []);

    // Filter client-side and take first BATCH_SIZE
    const itemsWithoutEmbeddings = allItems
      ?.filter(item => !existingIds.has(item.id))
      .slice(0, BATCH_SIZE);


    if (!itemsWithoutEmbeddings || itemsWithoutEmbeddings.length === 0) {
      console.log('✅ No items need embeddings');
      return new Response(JSON.stringify({ 
        message: 'All knowledge items have embeddings',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Found ${itemsWithoutEmbeddings.length} items without embeddings`);

    // STEP 2: Generate embeddings in batch
    const textsToEmbed = itemsWithoutEmbeddings.map(item => {
      // Combine category, key, and value for better semantic understanding
      const valueStr = typeof item.value === 'object' 
        ? JSON.stringify(item.value) 
        : String(item.value);
      return `${item.category}: ${item.key} - ${valueStr}`;
    });

    console.log('🤖 Generating embeddings via Lovable AI...');

    const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: textsToEmbed,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('Embedding API error:', errorText);
      throw new Error(`Embedding generation failed: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embeddings = embeddingData.data;

    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // STEP 3: Store embeddings in database
    const embeddingsToInsert = itemsWithoutEmbeddings.map((item, index) => ({
      knowledge_id: item.id,
      embedding: embeddings[index].embedding,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('knowledge_embeddings')
      .insert(embeddingsToInsert);

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    const executionTime = Date.now() - startTime;

    console.log(`✅ Successfully stored ${embeddingsToInsert.length} embeddings in ${executionTime}ms`);

    // Log to function_call_logs
    await supabase.from('function_call_logs').insert({
      function_name: 'generate-embeddings',
      org_id: '550e8400-e29b-41d4-a716-446655440000', // Default org for system tasks
      user_id: '00000000-0000-0000-0000-000000000000', // System user
      success: true,
      execution_time_ms: executionTime,
      input_tokens: embeddingData.usage?.total_tokens || 0,
      output_tokens: 0,
      total_tokens: embeddingData.usage?.total_tokens || 0,
      estimated_cost_eur: (embeddingData.usage?.total_tokens || 0) * 0.00000013, // text-embedding-3-small pricing
      model_used: 'text-embedding-3-small'
    });

    return new Response(JSON.stringify({ 
      message: `Generated ${embeddingsToInsert.length} embeddings`,
      processed: embeddingsToInsert.length,
      execution_time_ms: executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error generating embeddings:', error);
    
    const executionTime = Date.now() - startTime;

    // Log failure
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from('function_call_logs').insert({
        function_name: 'generate-embeddings',
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '00000000-0000-0000-0000-000000000000',
        success: false,
        execution_time_ms: executionTime,
        error_message: error instanceof Error ? error.message : String(error),
        model_used: 'text-embedding-3-small'
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});