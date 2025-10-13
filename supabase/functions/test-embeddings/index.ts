import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ✅ Check OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'OPENAI_API_KEY not configured',
          stage: 'config_check'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // TEST MODE: Only process 10 items
    console.log(`📦 TEST MODE: Fetching 10 items without embeddings...`);

    const { data: recentItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, org_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (fetchError) {
      console.error('❌ Error fetching knowledge items:', fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch knowledge items',
          stage: 'fetch_candidates',
          details: fetchError
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recentItems || recentItems.length === 0) {
      console.log('✅ No items in knowledge base');
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          total_missing: 0,
          message: 'No items in knowledge base'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter out items that already have embeddings
    const ids = recentItems.map(r => r.id);
    const { data: existingEmbeddings } = await supabase
      .from('knowledge_embeddings')
      .select('knowledge_id')
      .in('knowledge_id', ids);

    const existingSet = new Set((existingEmbeddings || []).map(e => e.knowledge_id));
    const knowledgeItems = recentItems.filter(it => !existingSet.has(it.id)).slice(0, 10); // TEST: 10 items

    if (knowledgeItems.length === 0) {
      console.log('✅ All items already have embeddings');
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          total_missing: 0,
          message: 'All items have embeddings'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ TEST MODE: Found ${knowledgeItems.length} items to process`);

    const results = {
      processed: 0,
      errors: [] as string[]
    };

    for (const item of knowledgeItems) {
      try {
        // Creëer embedding text
        const embeddingText = `${item.category}: ${item.key}\n${JSON.stringify(item.value)}`;

        // Genereer embedding via OpenAI met 10s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        try {
          const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: embeddingText,
              dimensions: 768
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error(`❌ OpenAI API error for ${item.id}:`, errorText);
            results.errors.push(`${item.id}: OpenAI API error - ${openaiResponse.status}`);
            continue;
          }

          const { data: [embeddingData] } = await openaiResponse.json();
          const embedding = embeddingData.embedding;

          console.log(`✅ Processed ${item.id}: ${embedding.length} dimensions`);
          if (embedding.length !== 768) {
            const error = `Invalid embedding size: ${embedding.length}, expected 768`;
            console.error(error);
            results.errors.push(`${item.id}: ${error}`);
            continue;
          }

          // Insert embedding
          const { error: insertError } = await supabase
            .from('knowledge_embeddings')
            .upsert(
              { knowledge_id: item.id, embedding },
              { onConflict: 'knowledge_id', ignoreDuplicates: true }
            );

          if (insertError) {
            console.error(`Error inserting embedding for ${item.id}:`, insertError);
            results.errors.push(`${item.id}: Insert error`);
            continue;
          }

          results.processed++;
          console.log(`✅ TEST: Processed ${item.id}`);

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            console.error(`⏱️ Timeout (10s) for item ${item.id} - skipping`);
            results.errors.push(`${item.id}: API timeout`);
            continue;
          }
          throw error;
        }

      } catch (outerError) {
        console.error(`Error processing item ${item.id}:`, outerError);
        results.errors.push(`${item.id}: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`);
      }
    }

    console.log(`✅ TEST complete: ${results.processed}/${knowledgeItems.length} processed`);

    return new Response(
      JSON.stringify({
        success: true,
        test_mode: true,
        processed: results.processed,
        total_in_batch: knowledgeItems.length,
        errors: results.errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-embeddings function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
