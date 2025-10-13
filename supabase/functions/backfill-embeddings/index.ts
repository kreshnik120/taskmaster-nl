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

    console.log(`📦 Fetching candidates (batch_size: ${batch_size})...`);

    // STAP A: Haal kandidaat knowledge items op (ruim iets meer dan batch_size)
    const { data: candidates, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, org_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(batch_size * 3);

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

    if (!candidates || candidates.length === 0) {
      console.log('✅ No knowledge items found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          message: 'No knowledge items in database'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${candidates.length} candidate items`);

    // STAP B: Haal bestaande embeddings op voor deze kandidaten
    const candidateIds = candidates.map(c => c.id);
    const { data: existingEmbeddings, error: embeddingsError } = await supabase
      .from('knowledge_embeddings')
      .select('knowledge_id')
      .in('knowledge_id', candidateIds);

    if (embeddingsError) {
      console.error('❌ Error fetching existing embeddings:', embeddingsError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to check existing embeddings',
          stage: 'fetch_existing',
          details: embeddingsError
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STAP C: Filter client-side voor items zonder embedding
    const existingSet = new Set(existingEmbeddings?.map(e => e.knowledge_id) || []);
    const knowledgeItems = candidates
      .filter(c => !existingSet.has(c.id))
      .slice(0, batch_size);

    console.log(`✅ Filtered to ${knowledgeItems.length} items without embeddings`);

    if (knowledgeItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          message: 'No items missing embeddings',
          reason: 'no_missing_embeddings'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Processing batch of ${knowledgeItems.length} items`);

    // Track progress in orchestrator_state
    if (knowledgeItems.length > 0 && knowledgeItems[0].org_id) {
      await supabase
        .from('orchestrator_state')
        .upsert({
          org_id: knowledgeItems[0].org_id,
          component: 'backfill-embeddings',
          status: 'running',
          current_batch: 0,
          metadata: {
            batch_size,
            started_at: new Date().toISOString()
          }
        });
    }

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
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: embeddingText,
            dimensions: 768
          })
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error(`❌ OpenAI API error for ${item.id}:`, errorText);
          results.errors.push(`${item.id}: OpenAI API error - ${openaiResponse.status}`);
          continue;
        }

        const { data: [embeddingData] } = await openaiResponse.json();
        const embedding = embeddingData.embedding;

        // Validate and log embedding dimensions
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
        results.errors.push(`${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`✅ Batch complete: ${results.processed}/${knowledgeItems.length} processed`);

    // Update progress to completed
    if (knowledgeItems.length > 0 && knowledgeItems[0].org_id) {
      await supabase
        .from('orchestrator_state')
        .upsert({
          org_id: knowledgeItems[0].org_id,
          component: 'backfill-embeddings',
          status: 'idle',
          total_items_processed: results.processed,
          metadata: {
            completed_at: new Date().toISOString(),
            errors: results.errors.length
          }
        });
    }

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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
