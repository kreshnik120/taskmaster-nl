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
    console.warn('⚠️ DEPRECATED: backfill-embeddings is replaced by generate-embedding. Use generate-embedding instead.');
    
    const { batch_size = 10, offset = 0, direction = 'desc' } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Step 1: Fetch a window of knowledge items (with offset support)
    const windowSize = Math.max(batch_size * 20, 1000);
    const orderAscending = direction === 'asc';
    console.log(`📦 Candidate selection: windowSize=${windowSize}, offset=${offset}, direction=${direction}...`);

    const { data: recentItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, org_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: orderAscending })
      .range(offset, offset + windowSize - 1);

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
          message: 'No items in knowledge base',
          reason: 'no_missing_embeddings'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Filter out items that already have embeddings
    const ids = recentItems.map(r => r.id);
    const { data: existingEmbeddings } = await supabase
      .from('knowledge_embeddings')
      .select('knowledge_id')
      .in('knowledge_id', ids);

    const existingSet = new Set((existingEmbeddings || []).map(e => e.knowledge_id));
    const knowledgeItems = recentItems.filter(it => !existingSet.has(it.id)).slice(0, batch_size);

    // Calculate total missing embeddings for UI
    const { count: totalKb } = await supabase
      .from('ai_knowledge_base')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);
    
    const { count: withEmb } = await supabase
      .from('knowledge_embeddings')
      .select('*', { count: 'exact', head: true });
    
    const total_missing = Math.max((totalKb || 0) - (withEmb || 0), 0);

    if (knowledgeItems.length === 0) {
      if (total_missing > 0) {
        console.log('⚠️ No candidates in current window, but items still missing embeddings');
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: 0,
            total_missing,
            total_in_batch: 0,
            message: 'No candidates in this window',
            reason: 'window_empty_but_missing' // Signal orchestrator to move offset
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('✅ All items have embeddings');
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: 0,
            total_missing: 0,
            message: 'All items have embeddings',
            reason: 'no_missing_embeddings'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`✅ Found ${knowledgeItems.length} candidates without embeddings`);

    console.log(`📦 Processing batch of ${knowledgeItems.length} items`);

    // Note: Status tracking is handled by auto-backfill-orchestrator

    // Genereer embeddings voor elk item
    const results = {
      processed: 0,
      errors: [] as string[]
    };

    let processedCount = 0;
    for (const item of knowledgeItems) {
      try {
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`📊 Progress: ${processedCount}/${knowledgeItems.length} items`);
        }

        // Creëer embedding text
        const embeddingText = `${item.category}: ${item.key}\n${JSON.stringify(item.value)}`;

        // Genereer embedding via Gemini (GRATIS via Lovable AI Gateway)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
          console.log(`🔄 Requesting Gemini embedding for ${item.id}...`);
          
          const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
          if (!lovableApiKey) {
            throw new Error('LOVABLE_API_KEY not configured');
          }

          const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-004', // Gemini embedding model
              input: embeddingText
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            
            // Handle 402 AI credits exhausted error
            if (geminiResponse.status === 402) {
              console.error(`💳 AI credits exhausted - stopping backfill`);
              results.errors.push(`${item.id}: AI credits exhausted (402)`);
              
              // Return early with special error to signal orchestrator
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'AI credits exhausted. Please add funds to continue.',
                  error_code: 402,
                  processed: results.processed,
                  total_missing,
                  total_in_batch: knowledgeItems.length,
                  errors: results.errors
                }),
                { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            console.error(`❌ Gemini API error for ${item.id}:`, errorText);
            results.errors.push(`${item.id}: Gemini API error - ${geminiResponse.status}`);
            continue;
          }

          const geminiData = await geminiResponse.json();
          const embedding = geminiData.data[0].embedding;

          // Validate and log embedding dimensions
          console.log(`✅ Processed ${item.id}: ${embedding.length} dimensions`);
          if (embedding.length !== 768) {
            const error = `Invalid embedding size: ${embedding.length}, expected 768`;
            console.error(error);
            results.errors.push(`${item.id}: ${error}`);
            continue;
          }

          // Insert embedding (use upsert to handle race conditions)
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
          console.log(`✅ Successfully processed ${item.id} (${results.processed}/${knowledgeItems.length})`);

          // Rate limiting: wacht 150ms tussen requests (verhoogd voor stabiliteit)
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            console.error(`⏱️ Timeout (10s) for item ${item.id} - skipping`);
            results.errors.push(`${item.id}: API timeout`);
            continue; // Skip dit item
          }
          console.error(`Error processing item ${item.id}:`, error);
          results.errors.push(`${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } catch (outerError) {
        console.error(`Error processing item ${item.id}:`, outerError);
        results.errors.push(`${item.id}: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`);
      }
    }

    console.log(`✅ Batch complete: ${results.processed}/${knowledgeItems.length} processed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.processed,
        total_missing,
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
