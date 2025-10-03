import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Safety: Hard stop date after free period
const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Safety check: Stop after free period
    if (new Date() > CUTOFF_DATE) {
      console.log('⛔ Knowledge Graph Builder stopped: Free period ended');
      return new Response(JSON.stringify({ 
        stopped: true, 
        reason: 'Free AI period ended on October 6th, 2025',
        message: 'Knowledge graph builder is disabled to prevent costs'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!userOrg) throw new Error('No organization found');

    const { batch_size = 50 } = await req.json();

    console.log(`🧠 Starting Knowledge Graph Builder for org ${userOrg.org_id}`);
    console.log(`📊 Processing batch of ${batch_size} items`);

    // Fetch knowledge items
    const { data: knowledgeItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, confidence_score')
      .eq('org_id', userOrg.org_id)
      .is('deleted_at', null)
      .limit(batch_size);

    if (fetchError) throw fetchError;
    if (!knowledgeItems || knowledgeItems.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        relationships_detected: 0,
        message: 'No knowledge items to process' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📚 Analyzing ${knowledgeItems.length} knowledge items for relationships`);

    // Build context for AI analysis
    const knowledgeContext = knowledgeItems.map(item => ({
      id: item.id,
      category: item.category,
      key: item.key,
      value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value),
      confidence: item.confidence_score
    }));

    // Call Lovable AI to detect relationships
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Je bent een knowledge graph expert die semantische relaties detecteert tussen kennisitems.
            
Analyseer de gegeven kennisitems en detecteer ALLE mogelijke relaties tussen ze.

Relationship types:
- "contradicts": Items die elkaar tegenspreken
- "supports": Items die elkaar ondersteunen/aanvullen
- "related_to": Items die gerelateerd zijn aan elkaar
- "depends_on": Item A hangt af van/vereist item B
- "supersedes": Item A vervangt/overschrijft item B (newer info)
- "exemplifies": Item A is een voorbeeld van item B
- "compares": Items die vergeleken moeten worden

Voor elke relatie, geef:
1. source_id en target_id
2. relationship_type
3. confidence (0.0-1.0 hoe zeker je bent)
4. context (waarom deze relatie bestaat, max 200 chars)

Output ALLEEN valid JSON array, geen extra tekst.`
          },
          {
            role: 'user',
            content: `Detecteer alle semantische relaties tussen deze kennisitems:\n\n${JSON.stringify(knowledgeContext, null, 2)}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('AI credits exhausted. Please add funds to continue.');
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    console.log('🤖 AI Response received, parsing relationships...');

    // Parse AI response
    let relationships = [];
    try {
      // Extract JSON from response (sometimes AI adds markdown formatting)
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        relationships = JSON.parse(jsonMatch[0]);
      } else {
        relationships = JSON.parse(aiContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      relationships = [];
    }

    console.log(`🔗 Detected ${relationships.length} relationships`);

    // Store relationships in database
    let insertedCount = 0;
    const errors = [];

    for (const rel of relationships) {
      try {
        const { error: insertError } = await supabase
          .from('knowledge_relationships')
          .upsert({
            source_knowledge_id: rel.source_id,
            target_knowledge_id: rel.target_id,
            relationship_type: rel.relationship_type,
            confidence_score: rel.confidence || 0.8,
            detected_by: 'ai',
            context: rel.context || '',
            metadata: {
              model: 'gemini-2.5-flash',
              detected_at: new Date().toISOString()
            }
          }, {
            onConflict: 'source_knowledge_id,target_knowledge_id,relationship_type',
            ignoreDuplicates: false
          });

        if (insertError) {
          console.error('Insert error:', insertError);
          errors.push({ rel, error: insertError.message });
        } else {
          insertedCount++;
        }
      } catch (err) {
        console.error('Error processing relationship:', err);
        errors.push({ rel, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Log function call for budget tracking
    const executionTime = Date.now() - startTime;
    const inputTokens = Math.ceil(JSON.stringify(knowledgeContext).length / 4);
    const outputTokens = Math.ceil(aiContent.length / 4);

    await supabase.from('function_call_logs').insert({
      user_id: user.id,
      org_id: userOrg.org_id,
      function_name: 'knowledge-graph-builder',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_eur: 0, // Free during promotion
      model_used: 'gemini-2.5-flash',
      success: true,
      execution_time_ms: executionTime
    });

    console.log(`✅ Successfully inserted ${insertedCount} relationships`);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during insertion`);
    }

    return new Response(JSON.stringify({
      success: true,
      knowledge_items_analyzed: knowledgeItems.length,
      relationships_detected: relationships.length,
      relationships_stored: insertedCount,
      errors: errors.length,
      execution_time_ms: executionTime,
      tokens_used: inputTokens + outputTokens
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Knowledge Graph Builder error:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stopped_safely: new Date() > CUTOFF_DATE
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});