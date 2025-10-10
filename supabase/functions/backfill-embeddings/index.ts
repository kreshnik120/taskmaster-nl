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
    const { batch_size = 10 } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Haal knowledge items op zonder embeddings
    const { data: knowledgeItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value')
      .is('deleted_at', null)
      .not('id', 'in', supabase
        .from('knowledge_embeddings')
        .select('knowledge_id')
      )
      .limit(batch_size);

    if (fetchError) {
      console.error('Error fetching knowledge items:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch knowledge items' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!knowledgeItems || knowledgeItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          message: 'No items to process'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Processing batch of ${knowledgeItems.length} items`);

    // Genereer embeddings voor elk item
    const results = {
      processed: 0,
      errors: [] as string[]
    };

    for (const item of knowledgeItems) {
      try {
        // Creëer embedding text
        const embeddingText = `${item.category}: ${item.key}\n${JSON.stringify(item.value)}`;

        // Genereer embedding via OpenAI
        const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: embeddingText,
            dimensions: 1536
          })
        });

        if (!openaiResponse.ok) {
          const error = await openaiResponse.text();
          console.error(`OpenAI API error for item ${item.id}:`, error);
          results.errors.push(`${item.id}: OpenAI API error`);
          continue;
        }

        const { data: [embeddingData] } = await openaiResponse.json();
        const embedding = embeddingData.embedding;

        // Insert embedding
        const { error: insertError } = await supabase
          .from('knowledge_embeddings')
          .insert({ knowledge_id: item.id, embedding });

        if (insertError) {
          console.error(`Error inserting embedding for ${item.id}:`, insertError);
          results.errors.push(`${item.id}: Insert error`);
          continue;
        }

        results.processed++;
        console.log(`✅ Processed ${item.id}`);

        // Rate limiting: wacht 100ms tussen requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
        results.errors.push(`${item.id}: ${error.message}`);
      }
    }

    console.log(`✅ Batch complete: ${results.processed}/${knowledgeItems.length} processed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.processed,
        total_in_batch: knowledgeItems.length,
        errors: results.errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in backfill-embeddings function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
