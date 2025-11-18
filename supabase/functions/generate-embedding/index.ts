import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum characters to prevent token limit errors (~7000 tokens = ~28000 chars)
const MAX_CHARS = 28000;

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const { knowledge_id, knowledge_ids } = await req.json();
    
    // Support voor batch processing
    const ids = knowledge_ids || (knowledge_id ? [knowledge_id] : []);
    
    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'knowledge_id or knowledge_ids is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 generate-embedding invoked', {
      batch_size: ids.length,
      timestamp: new Date().toISOString()
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // Process in batches van 50 (OpenAI batch limit)
    const BATCH_SIZE = 50;
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

      // Generate embeddings with OpenAI text-embedding-3-small with better error handling
      let embeddingData;
      try {
        embeddingData = await retryWithBackoff(async () => {
          const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
          if (!openaiApiKey) {
            throw new Error('OPENAI_API_KEY not configured');
          }

          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              dimensions: 1536,
              input: embeddingInputs
            })
          });

          if (!response.ok) {
            const error = await response.text();
            console.error('OpenAI Embedding API error:', error);
            
            // Log failures for this batch
            for (const knowledge of batch) {
              await supabase.from('embedding_failures').insert({
                knowledge_id: knowledge.id,
                error_type: response.status === 500 ? 'openai_500_error' : 'openai_api_error',
                error_message: `OpenAI API ${response.status}: ${error.substring(0, 500)}`,
                token_count: Math.floor(embeddingInputs[batch.indexOf(knowledge)].length / 4)
              });
            }
            
            throw new Error(`OpenAI API error: ${response.status}`);
          }

          return await response.json();
        });
      } catch (batchError) {
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount,
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