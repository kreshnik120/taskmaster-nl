import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.baseDelay * Math.pow(2, attempt),
          config.maxDelay
        );
        console.log(`Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

async function generateEmbeddingGemini(text: string, apiKey: string): Promise<number[]> {
  // Use Gemini to extract semantic concepts for hash-based embedding
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'Extract 20 key semantic concepts from the text as single words, separated by commas. Focus on: entities, actions, attributes, domain-specific terms.'
        },
        {
          role: 'user',
          content: `Text: ${text.substring(0, 1000)}`
        }
      ]
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const concepts = data.choices[0].message.content
    .toLowerCase()
    .split(',')
    .map((c: string) => c.trim())
    .filter((c: string) => c.length > 0);

  console.log(`🔍 Extracted concepts: ${concepts.slice(0, 5).join(', ')}...`);

  // Create hash-based feature vector (768 dimensions to match database)
  const embedding = new Array(768).fill(0);
  concepts.forEach((concept: string) => {
    const hash = simpleHash(concept);
    // Spread each concept across 8 dimensions for better distribution
    for (let i = 0; i < 8; i++) {
      const pos = (hash + i * 97) % 768;
      embedding[pos] += (1 / (i + 1)) * 0.1;
    }
  });

  // L2 normalization
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (magnitude || 1));
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');

  if (!lovableKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  console.log('🤖 Generating Gemini-based embedding...');
  return await retryWithBackoff(() => generateEmbeddingGemini(text, lovableKey));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧮 Generate Embeddings starting...');

    // First get all knowledge IDs that already have embeddings
    const { data: existingEmbeddings } = await supabase
      .from('knowledge_embeddings')
      .select('knowledge_id');
    
    const existingIds = new Set(existingEmbeddings?.map(e => e.knowledge_id) || []);

    // Fetch knowledge items without embeddings (limit to batch of 50)
    const { data: allKnowledge, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value')
      .is('deleted_at', null)
      .limit(200);

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      throw fetchError;
    }

    // Filter out items that already have embeddings
    const knowledgeItems = allKnowledge?.filter(item => !existingIds.has(item.id)) || [];

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      throw fetchError;
    }

    if (!knowledgeItems || knowledgeItems.length === 0) {
      console.log('✅ No knowledge items need embeddings');
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          message: 'All items have embeddings'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Processing ${knowledgeItems.length} knowledge items...`);

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Process items in batches of 10 to avoid rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < knowledgeItems.length; i += BATCH_SIZE) {
      const batch = knowledgeItems.slice(i, i + BATCH_SIZE);
      
      await Promise.allSettled(
        batch.map(async (item) => {
          try {
            // Create text representation
            const text = `${item.category}: ${item.key} = ${JSON.stringify(item.value)}`;
            
            // Generate embedding
            const embedding = await generateEmbedding(text);

            // Store embedding
            const { error: insertError } = await supabase
              .from('knowledge_embeddings')
              .upsert({
                knowledge_id: item.id,
                embedding: embedding,
                updated_at: new Date().toISOString()
              });

            if (insertError) {
              throw insertError;
            }

            successCount++;
            console.log(`✅ Embedded: ${item.category}/${item.key}`);
          } catch (error) {
            failureCount++;
            const err = error as Error;
            const errorMsg = `Failed ${item.id}: ${err.message}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        })
      );

      // Rate limiting: wait between batches
      if (i + BATCH_SIZE < knowledgeItems.length) {
        await sleep(1000);
      }
    }

    console.log(`✅ Embeddings complete: ${successCount} success, ${failureCount} failures`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: knowledgeItems.length,
        successful: successCount,
        failed: failureCount,
        errors: errors.slice(0, 10) // Only return first 10 errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error generating embeddings:', error);
    const err = error as Error;
    return new Response(
      JSON.stringify({ 
        success: false,
        error: err.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
