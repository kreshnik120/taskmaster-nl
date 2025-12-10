import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    console.warn('⚠️ DEPRECATED: backfill-embeddings is replaced by generate-embedding. Use generate-embedding instead.');
    
    const { batch_size = 10, offset = 0, direction = 'desc' } = await req.json();

    const supabase = createAdminClient();

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
      return errorResponse('Failed to fetch knowledge items', 500, { stage: 'fetch_candidates', details: fetchError });
    }

    if (!recentItems || recentItems.length === 0) {
      console.log('✅ No items in knowledge base');
      return jsonResponse({ 
        success: true, 
        processed: 0,
        total_missing: 0,
        message: 'No items in knowledge base',
        reason: 'no_missing_embeddings'
      });
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
        return jsonResponse({ 
          success: true, 
          processed: 0,
          total_missing,
          total_in_batch: 0,
          message: 'No candidates in this window',
          reason: 'window_empty_but_missing'
        });
      } else {
        console.log('✅ All items have embeddings');
        return jsonResponse({ 
          success: true, 
          processed: 0,
          total_missing: 0,
          message: 'All items have embeddings',
          reason: 'no_missing_embeddings'
        });
      }
    }

    console.log(`✅ Found ${knowledgeItems.length} candidates without embeddings`);
    console.log(`📦 Processing batch of ${knowledgeItems.length} items`);

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

        const embeddingText = `${item.category}: ${item.key}\n${JSON.stringify(item.value)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          console.log(`🔄 Requesting OpenAI embedding for ${item.id}...`);
          
          const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
          if (!openaiApiKey) {
            throw new Error('OPENAI_API_KEY not configured');
          }

          const geminiResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: embeddingText
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            
            if (geminiResponse.status === 402) {
              console.error(`💳 AI credits exhausted - stopping backfill`);
              results.errors.push(`${item.id}: AI credits exhausted (402)`);
              
              return jsonResponse({
                success: false,
                error: 'AI credits exhausted. Please add funds to continue.',
                error_code: 402,
                processed: results.processed,
                total_missing,
                total_in_batch: knowledgeItems.length,
                errors: results.errors
              }, 402);
            }
            
            console.error(`❌ OpenAI API error for ${item.id}:`, errorText);
            results.errors.push(`${item.id}: OpenAI API error - ${geminiResponse.status}`);
            continue;
          }

          const geminiData = await geminiResponse.json();
          const embedding = geminiData.data[0].embedding;

          console.log(`✅ Processed ${item.id}: ${embedding.length} dimensions`);
          if (embedding.length !== 1536) {
            const error = `Invalid embedding size: ${embedding.length}, expected 1536`;
            console.error(error);
            results.errors.push(`${item.id}: ${error}`);
            continue;
          }

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

          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            console.error(`⏱️ Timeout (10s) for item ${item.id} - skipping`);
            results.errors.push(`${item.id}: API timeout`);
            continue;
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

    return jsonResponse({
      success: true,
      processed: results.processed,
      total_missing,
      total_in_batch: knowledgeItems.length,
      errors: results.errors
    });

  } catch (error) {
    console.error('Error in backfill-embeddings function:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
