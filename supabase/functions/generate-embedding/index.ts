import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

// Maximum characters to prevent token limit errors
// Reduced to 6000 chars (~1500 tokens) to safely handle 5-item batches
// 5 items * 1500 tokens = 7500 tokens + 692 buffer = well under 8192 limit
const MAX_CHARS = 6000;
const FALLBACK_CHARS = 4000;

// Retry helper met exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const isTimeout = error instanceof Error && 
        (error.message.includes('408') || error.message.includes('504'));
      
      if (!isTimeout || attempt === maxRetries - 1) {
        throw error;
      }
      
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(`⏳ Retry ${attempt + 1}/${maxRetries} na ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const body = await req.json().catch(() => ({}));
    const { knowledge_id, knowledge_ids, batch_mode, batch_size = 50 } = body;
    
    const supabase = createAdminClient();

    let ids: string[] = [];

    // AUTO MODE: automatisch items zonder embedding ophalen
    if (batch_mode === 'auto') {
      console.log('🤖 Auto-mode: fetching items without embeddings using FIXED query...');
      
      // Count totals first for accurate remaining calculation
      const { count: totalKnowledge } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      
      const { count: totalEmbeddings } = await supabase
        .from('knowledge_embeddings')
        .select('*', { count: 'exact', head: true });
      
      const remainingCount = Math.max(0, (totalKnowledge || 0) - (totalEmbeddings || 0));
      console.log(`📊 Database status: ${totalKnowledge} items, ${totalEmbeddings} embeddings, ${remainingCount} remaining`);
      
      if (remainingCount === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: 0, 
            remaining: 0,
            message: '✅ All knowledge items have embeddings!' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // FIXED QUERY: Get ALL existing embedding IDs with PAGINATED fetch (fix for 1000-row limit)
      // This fixes the bug where Supabase's default 1000 limit caused infinite loop
      const embeddingIdSet = new Set<string>();
      let embOffset = 0;
      const embPageSize = 1000;
      
      while (true) {
        const { data: embPage, error: embError } = await supabase
          .from('knowledge_embeddings')
          .select('knowledge_id')
          .range(embOffset, embOffset + embPageSize - 1);
        
        if (embError) {
          console.error(`❌ Error fetching embeddings page at offset ${embOffset}:`, embError);
          break;
        }
        
        if (!embPage || embPage.length === 0) break;
        
        embPage.forEach((e: any) => embeddingIdSet.add(e.knowledge_id));
        
        if (embPage.length < embPageSize) break; // Laatste pagina
        embOffset += embPageSize;
      }
      
      console.log(`📋 Loaded ${embeddingIdSet.size} existing embeddings (paginated, ${Math.ceil(embOffset / embPageSize) + 1} pages)`);
      
      // Get knowledge items, we'll filter client-side for those without embeddings
      const { data: allKnowledge, error: queryError } = await supabase
        .from('ai_knowledge_base')
        .select('id, confidence_score, source_type')
        .is('deleted_at', null)
        .order('confidence_score', { ascending: false, nullsFirst: false })
        .limit(batch_size * 10); // Get enough to find items without embeddings

      if (queryError) {
        console.error('❌ Query error:', queryError);
        throw new Error(`Failed to fetch items: ${queryError.message}`);
      }

      if (!allKnowledge || allKnowledge.length === 0) {
        return new Response(
          JSON.stringify({ success: true, processed: 0, remaining: remainingCount, message: 'No knowledge items found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Filter out items that already have embeddings
      const needsEmbedding = allKnowledge
        .filter(k => !embeddingIdSet.has(k.id))
        .sort((a, b) => {
          // Prioritize gemini_deep_research items
          if (a.source_type === 'gemini_deep_research' && b.source_type !== 'gemini_deep_research') return -1;
          if (b.source_type === 'gemini_deep_research' && a.source_type !== 'gemini_deep_research') return 1;
          return (b.confidence_score || 0) - (a.confidence_score || 0);
        })
        .slice(0, batch_size);

      console.log(`🔍 Query returned ${allKnowledge.length} items, ${needsEmbedding.length} need embeddings`);

      if (needsEmbedding.length === 0) {
        // If still 0 but remainingCount > 0, there might be items beyond our query limit
        if (remainingCount > 0) {
          console.log(`⚠️ No items found in top ${batch_size * 10}, but ${remainingCount} still need embeddings. Trying random selection...`);
          
          // Get a random sample of items and check if they need embeddings
          const { data: randomItems } = await supabase
            .from('ai_knowledge_base')
            .select('id, confidence_score, source_type')
            .is('deleted_at', null)
            .limit(batch_size * 20);
          
          const randomNeeds = (randomItems || [])
            .filter(k => !embeddingIdSet.has(k.id))
            .slice(0, batch_size);
          
          if (randomNeeds.length > 0) {
            ids = randomNeeds.map(k => k.id);
            console.log(`✅ Random selection found ${ids.length} items to process`);
          } else {
            return new Response(
              JSON.stringify({ 
                success: true, 
                processed: 0, 
                remaining: remainingCount,
                message: 'Unable to find items without embeddings - may need manual check' 
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          return new Response(
            JSON.stringify({ 
              success: true, 
              processed: 0, 
              remaining: 0,
              message: '✅ All items have embeddings!' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        ids = needsEmbedding.map(k => k.id);
        console.log(`✅ Auto-mode found ${ids.length} items to process (${remainingCount} remaining total)`);
      }
    } else {
      // MANUAL MODE: use provided IDs
      ids = knowledge_ids || (knowledge_id ? [knowledge_id] : []);
      
      if (ids.length === 0) {
        return new Response(
          JSON.stringify({ error: 'knowledge_id, knowledge_ids, or batch_mode:auto is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('🔍 generate-embedding invoked', {
      mode: batch_mode || 'manual',
      batch_size: ids.length,
      timestamp: new Date().toISOString()
    });

    // Haal alle knowledge items op in 1 query
    const { data: knowledgeItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, source')
      .in('id', ids);

    if (fetchError || !knowledgeItems || knowledgeItems.length === 0) {
      console.error('Error fetching knowledge:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Knowledge items not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];
    let processedCount = 0;

    // Process in batches van 5 (reduced from 50 to prevent token limit errors)
    // With 1500 tokens per item, 5 items = 7500 tokens (safe under 8192 limit)
    const BATCH_SIZE = 5;
    for (let i = 0; i < knowledgeItems.length; i += BATCH_SIZE) {
      const batch = knowledgeItems.slice(i, i + BATCH_SIZE);
      
      // Creëer embedding texts met truncation om token limit te voorkomen
      const embeddingInputs = batch.map(k => {
        const fullText = `${k.category}: ${k.key}\n${JSON.stringify(k.value)}`;
        if (fullText.length > MAX_CHARS) {
          console.warn(`⚠️ Truncating content for ${k.id}: ${fullText.length} chars → ${MAX_CHARS} chars`);
          return fullText.substring(0, MAX_CHARS) + '...[truncated]';
        }
        return fullText;
      });

      // Generate embeddings with OpenAI text-embedding-3-small with fallback for token limits
      let embeddingData;
      let usedFallback = false;
      
      try {
        embeddingData = await retryWithBackoff(async () => {
          const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
          if (!openaiApiKey) {
            throw new Error('OPENAI_API_KEY not configured');
          }

          const inputsToUse = usedFallback 
            ? embeddingInputs.map(text => text.substring(0, FALLBACK_CHARS) + '...[fallback truncated]')
            : embeddingInputs;

          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              dimensions: 1536,
              input: inputsToUse
            })
          });

          if (!response.ok) {
            const error = await response.text();
            console.error('OpenAI Embedding API error:', error);
            
            // Check if it's a token limit error
            const isTokenError = error.includes('token') || error.includes('maximum context length');
            
            if (isTokenError && !usedFallback) {
              console.warn(`🔄 Token limit hit, retrying with ${FALLBACK_CHARS} chars fallback...`);
              usedFallback = true;
              throw new Error('TOKEN_LIMIT_RETRY'); // Trigger retry with fallback
            }
            
            // Log failures for this batch
            for (const knowledge of batch) {
              const inputText = usedFallback 
                ? embeddingInputs[batch.indexOf(knowledge)].substring(0, FALLBACK_CHARS)
                : embeddingInputs[batch.indexOf(knowledge)];
              
              await supabase.from('embedding_failures').upsert({
                knowledge_id: knowledge.id,
                error_type: isTokenError ? 'token_limit_exceeded' : (response.status === 500 ? 'openai_500_error' : 'openai_api_error'),
                error_message: `OpenAI API ${response.status}: ${error.substring(0, 500)}${usedFallback ? ' (even after fallback truncation)' : ''}`,
                token_count: Math.floor(inputText.length / 4),
                attempted_at: new Date().toISOString(),
                retry_count: 1
              }, {
                onConflict: 'knowledge_id',
                ignoreDuplicates: false
              });
            }
            
            throw new Error(`OpenAI API error: ${response.status}`);
          }

          return await response.json();
        });
      } catch (batchError) {
        // If TOKEN_LIMIT_RETRY error, retry once more with fallback
        if (batchError instanceof Error && batchError.message === 'TOKEN_LIMIT_RETRY' && !usedFallback) {
          usedFallback = true;
          try {
            embeddingData = await retryWithBackoff(async () => {
              const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
              const inputsToUse = embeddingInputs.map(text => text.substring(0, FALLBACK_CHARS) + '...[fallback truncated]');
              
              const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openaiApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'text-embedding-3-small',
                  dimensions: 1536,
                  input: inputsToUse
                })
              });

              if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API error after fallback: ${response.status}`);
              }

              return await response.json();
            });
          } catch (fallbackError) {
            console.error(`❌ Fallback embedding generation also failed:`, fallbackError);
            
            // Mark all items as unable to embed even with fallback
            for (const knowledge of batch) {
              results.push({ 
                knowledge_id: knowledge.id, 
                success: false, 
                error: 'Unable to embed even with fallback truncation' 
              });
            }
            
            continue; // Skip to next batch
          }
        } else {
          console.error(`❌ Batch embedding generation failed:`, batchError);
          
          // Mark all items in batch as failed
          for (const knowledge of batch) {
            results.push({ 
              knowledge_id: knowledge.id, 
              success: false, 
              error: batchError instanceof Error ? batchError.message : 'Batch generation failed' 
            });
          }
          
          continue; // Skip to next batch
        }
      }

      // Store embeddings with better error handling
      for (let j = 0; j < batch.length; j++) {
        const knowledge = batch[j];
        
        try {
          const embedding = embeddingData.data[j].embedding;
          const actualDim = embedding.length;
          console.log(`📊 Storing embedding for ${knowledge.id}: ${actualDim} dimensions`);

          // Check of er al een embedding bestaat
          const { data: existingEmbedding } = await supabase
            .from('knowledge_embeddings')
            .select('id')
            .eq('knowledge_id', knowledge.id)
            .maybeSingle();

          if (existingEmbedding) {
            const { error: updateError } = await supabase
              .from('knowledge_embeddings')
              .update({ embedding, updated_at: new Date().toISOString() })
              .eq('knowledge_id', knowledge.id);
            
            if (updateError) {
              console.error(`❌ UPDATE FAILED for ${knowledge.id}:`, updateError);
              
              // Log to embedding_failures
              await supabase.from('embedding_failures').insert({
                knowledge_id: knowledge.id,
                error_type: 'storage_error',
                error_message: updateError.message,
                token_count: Math.floor(embeddingInputs[j].length / 4) // Rough estimate
              });
              
              results.push({ knowledge_id: knowledge.id, success: false, error: updateError.message });
              continue;
            }
            
            console.log(`✅ Successfully updated embedding for ${knowledge.id} (${actualDim}D)`);
          } else {
            const { error: insertError } = await supabase
              .from('knowledge_embeddings')
              .insert({ knowledge_id: knowledge.id, embedding });
            
            if (insertError) {
              console.error(`❌ INSERT FAILED for ${knowledge.id}:`, insertError);
              
              // Log to embedding_failures
              await supabase.from('embedding_failures').insert({
                knowledge_id: knowledge.id,
                error_type: 'storage_error',
                error_message: insertError.message,
                token_count: Math.floor(embeddingInputs[j].length / 4)
              });
              
              results.push({ knowledge_id: knowledge.id, success: false, error: insertError.message });
              continue;
            }
            
            console.log(`✅ Successfully inserted embedding for ${knowledge.id} (${actualDim}D)`);
          }

          processedCount++;
          results.push({ 
            knowledge_id: knowledge.id, 
            success: true,
            dimension: actualDim,
            operation: existingEmbedding ? 'updated' : 'inserted'
          });

          // Progress logging per 100 items
          if (processedCount % 100 === 0) {
            console.log(`✅ Processed ${processedCount}/${knowledgeItems.length} embeddings`);
          }
        } catch (itemError) {
          console.error(`❌ UNEXPECTED ERROR for ${knowledge.id}:`, itemError);
          
          // Log to embedding_failures
          await supabase.from('embedding_failures').insert({
            knowledge_id: knowledge.id,
            error_type: 'unexpected_error',
            error_message: itemError instanceof Error ? itemError.message : 'Unknown error',
            token_count: Math.floor(embeddingInputs[j].length / 4)
          });
          
          results.push({ 
            knowledge_id: knowledge.id, 
            success: false, 
            error: itemError instanceof Error ? itemError.message : 'Unknown error' 
          });
        }
      }
    }

    console.log('✅ Batch embeddings stored', {
      total: knowledgeItems.length,
      processed: processedCount,
      execution_time_ms: Date.now() - startTime
    });

    // Get remaining count for auto-mode feedback
    let remaining = 0;
    if (body.batch_mode === 'auto') {
      const { count: totalKnowledge } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      
      const { count: totalEmbeddings } = await supabase
        .from('knowledge_embeddings')
        .select('*', { count: 'exact', head: true });
      
      remaining = Math.max(0, (totalKnowledge || 0) - (totalEmbeddings || 0));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount,
        remaining,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-embedding function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});