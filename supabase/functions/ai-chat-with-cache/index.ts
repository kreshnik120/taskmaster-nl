import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SHA-256 hash function
async function hashQuestion(question: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(question.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Invalid messages format');
    }

    // Get user info
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Authentication required');
    }

    // Get user's org
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!userOrg) {
      throw new Error('User not in organization');
    }

    const orgId = userOrg.org_id;
    const userQuestion = messages[messages.length - 1].content;

    // STEP 1: Check cache
    const questionHash = await hashQuestion(userQuestion);
    console.log('🔍 Cache lookup for hash:', questionHash.slice(0, 16));

    const { data: cachedResponse } = await supabase
      .from('ai_response_cache')
      .select('*')
      .eq('org_id', orgId)
      .eq('question_hash', questionHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cachedResponse) {
      console.log('✅ CACHE HIT - returning cached response');
      
      // Update hit count and analytics
      await supabase
        .from('ai_response_cache')
        .update({ hit_count: cachedResponse.hit_count + 1 })
        .eq('id', cachedResponse.id);

      await supabase
        .from('cache_analytics')
        .upsert({
          org_id: orgId,
          date: new Date().toISOString().split('T')[0],
          cache_hits: 1,
        }, {
          onConflict: 'org_id,date',
          ignoreDuplicates: false
        });

      const executionTime = Date.now() - startTime;
      
      await supabase.from('function_call_logs').insert({
        function_name: 'ai-chat-with-cache',
        org_id: orgId,
        user_id: user.id,
        success: true,
        execution_time_ms: executionTime,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        estimated_cost_eur: 0,
        model_used: 'cache-hit'
      });

      return new Response(JSON.stringify({ 
        message: cachedResponse.response,
        cached: true,
        execution_time_ms: executionTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('❌ CACHE MISS - generating new response');

    // STEP 2: Generate embedding for question
    const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: userQuestion,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate embedding');
    }

    const embeddingData = await embeddingResponse.json();
    const questionEmbedding = embeddingData.data[0].embedding;

    // STEP 3: Semantic search for relevant knowledge
    const { data: relevantKnowledge, error: searchError } = await supabase
      .rpc('match_knowledge', {
        query_embedding: questionEmbedding,
        match_threshold: 0.7,
        match_count: 50,
        filter_org_id: orgId
      });

    if (searchError) {
      console.error('Semantic search error:', searchError);
      throw searchError;
    }

    console.log(`🔎 Found ${relevantKnowledge?.length || 0} relevant knowledge items`);

    // STEP 4: Apply relevance filter (exclude low-usage categories)
    const LOW_USAGE_CATEGORIES = ['documenten', 'externe_data'];
    const filteredKnowledge = (relevantKnowledge || []).filter(
      (item: any) => !LOW_USAGE_CATEGORIES.includes(item.category)
    );

    console.log(`✂️ Filtered to ${filteredKnowledge.length} items (removed ${(relevantKnowledge?.length || 0) - filteredKnowledge.length} low-usage items)`);

    // STEP 5: Call AI with reduced context
    const knowledgeContext = filteredKnowledge.map((item: any) => ({
      category: item.category,
      key: item.key,
      value: item.value,
      confidence: item.confidence_score,
      similarity: item.similarity
    }));

    const systemPrompt = `Je bent een AI assistent met toegang tot een kennisbank met ${filteredKnowledge.length} relevante items (gesorteerd op relevantie).

**BELANGRIJKE INSTRUCTIES:**
1. Gebruik ALLEEN informatie uit de kennisbank hieronder
2. Als je het antwoord niet weet, zeg dan: "Ik heb geen informatie over dit onderwerp"
3. Vermeld altijd je bronnen (category + key)
4. Wees specifiek en concreet

**KENNISBANK:**
${JSON.stringify(knowledgeContext, null, 2)}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiMessage = aiData.choices[0].message.content;

    const inputTokens = aiData.usage?.prompt_tokens || 0;
    const outputTokens = aiData.usage?.completion_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    // Calculate cost (Gemini 2.5 Flash pricing)
    const estimatedCost = (inputTokens * 0.00001875 + outputTokens * 0.0000075) / 1000;

    // STEP 6: Store in cache (24h TTL)
    const knowledgeIds = filteredKnowledge.map((k: any) => k.knowledge_id);
    
    await supabase.from('ai_response_cache').insert({
      org_id: orgId,
      question_hash: questionHash,
      question: userQuestion,
      response: aiMessage,
      knowledge_ids: knowledgeIds,
      hit_count: 0,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    // Update analytics
    const executionTime = Date.now() - startTime;
    
    await supabase
      .from('cache_analytics')
      .upsert({
        org_id: orgId,
        date: new Date().toISOString().split('T')[0],
        cache_misses: 1,
        avg_query_time_ms: executionTime,
        total_tokens_saved: 0,
        total_cost_saved_eur: 0
      }, {
        onConflict: 'org_id,date',
        ignoreDuplicates: false
      });

    await supabase.from('function_call_logs').insert({
      function_name: 'ai-chat-with-cache',
      org_id: orgId,
      user_id: user.id,
      success: true,
      execution_time_ms: executionTime,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_eur: estimatedCost,
      model_used: 'google/gemini-2.5-flash'
    });

    console.log(`✅ Response generated in ${executionTime}ms (${totalTokens} tokens, €${estimatedCost.toFixed(4)})`);

    return new Response(JSON.stringify({ 
      message: aiMessage,
      cached: false,
      execution_time_ms: executionTime,
      tokens_used: totalTokens,
      knowledge_items_used: filteredKnowledge.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});