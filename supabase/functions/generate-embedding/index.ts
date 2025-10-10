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
    const startTime = Date.now();
    const { knowledge_id } = await req.json();
    
    console.log('🔍 generate-embedding invoked', {
      knowledge_id,
      timestamp: new Date().toISOString()
    });

    if (!knowledge_id) {
      return new Response(
        JSON.stringify({ error: 'knowledge_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Haal knowledge item op
    const { data: knowledge, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, source')
      .eq('id', knowledge_id)
      .single();

    if (fetchError || !knowledge) {
      console.error('Error fetching knowledge:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Knowledge item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Creëer embedding text
    const embeddingText = `${knowledge.category}: ${knowledge.key}\n${JSON.stringify(knowledge.value)}`;

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
      console.error('OpenAI API error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate embedding' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: [embeddingData] } = await openaiResponse.json();
    const embedding = embeddingData.embedding;

    // Check of er al een embedding bestaat
    const { data: existingEmbedding } = await supabase
      .from('knowledge_embeddings')
      .select('id')
      .eq('knowledge_id', knowledge_id)
      .single();

    if (existingEmbedding) {
      // Update bestaande embedding
      const { error: updateError } = await supabase
        .from('knowledge_embeddings')
        .update({ embedding, updated_at: new Date().toISOString() })
        .eq('knowledge_id', knowledge_id);

      if (updateError) {
        console.error('Error updating embedding:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update embedding' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Insert nieuwe embedding
      const { error: insertError } = await supabase
        .from('knowledge_embeddings')
        .insert({ knowledge_id, embedding });

      if (insertError) {
        console.error('Error inserting embedding:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to insert embedding' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('✅ Embedding stored', {
      knowledge_id,
      embedding_dimensions: embedding.length,
      execution_time_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({ success: true, knowledge_id }),
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
