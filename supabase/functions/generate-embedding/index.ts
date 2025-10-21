import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      
      // Creëer embedding texts
      const embeddingInputs = batch.map(k => 
        `${k.category}: ${k.key}\n${JSON.stringify(k.value)}`
      );

      // LAAG 1: Genereer embeddings met Gemini via Lovable AI Gateway (GRATIS)
      const embeddingData = await retryWithBackoff(async () => {
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          throw new Error('LOVABLE_API_KEY not configured');
        }

        const response = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/text-embedding-004', // Gemini embedding model via Lovable AI Gateway
            input: embeddingInputs
          })
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Gemini Embedding API error:', error);
          throw new Error(`Gemini API error: ${response.status}`);
        }

        return await response.json();
      });

      // Store embeddings
      for (let j = 0; j < batch.length; j++) {
        const knowledge = batch[j];
        const embedding = embeddingData.data[j].embedding;

        if (embedding.length !== 768) {
          console.error(`Invalid embedding size for ${knowledge.id}: ${embedding.length}`);
          continue;
        }

        // Check of er al een embedding bestaat
        const { data: existingEmbedding } = await supabase
          .from('knowledge_embeddings')
          .select('id')
          .eq('knowledge_id', knowledge.id)
          .maybeSingle();

        if (existingEmbedding) {
          await supabase
            .from('knowledge_embeddings')
            .update({ embedding, updated_at: new Date().toISOString() })
            .eq('knowledge_id', knowledge.id);
        } else {
          await supabase
            .from('knowledge_embeddings')
            .insert({ knowledge_id: knowledge.id, embedding });
        }

        processedCount++;
        results.push({ knowledge_id: knowledge.id, success: true });

        // Progress logging per 100 items
        if (processedCount % 100 === 0) {
          console.log(`✅ Processed ${processedCount}/${knowledgeItems.length} embeddings`);
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