import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Support both authenticated (Test Nu) and autonomous (cron) modes
    const authHeader = req.headers.get('Authorization');
    
    // Always use SERVICE_ROLE_KEY for both modes
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let orgId: string;
    let userId: string;
    
    if (authHeader) {
      // Authenticated mode (Test Nu button)
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        console.error('❌ Authentication failed, falling back to autonomous mode');
        // Fallback to autonomous mode
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id')
          .limit(1);
        
        if (!orgs || orgs.length === 0) {
          throw new Error('No organizations found');
        }
        
        orgId = orgs[0].id;
        
        const { data: orgUser } = await supabase
          .from('user_organizations')
          .select('user_id')
          .eq('org_id', orgId)
          .limit(1)
          .single();
        
        userId = orgUser?.user_id || orgId;
        console.log('🤖 Fallback to autonomous mode for org:', orgId);
      } else {

        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!userOrg) {
          throw new Error('No organization found');
        }

        orgId = userOrg.org_id;
        userId = user.id;
        console.log('🔐 Running in authenticated mode for org:', orgId);
      }
    } else {
      // Autonomous mode (cron job) - use first organization
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (orgsError || !orgs || orgs.length === 0) {
        console.error('❌ No organizations found in autonomous mode');
        throw new Error('No organizations found');
      }

      orgId = orgs[0].id;
      
      // Get first user from org for userId
      const { data: orgUser } = await supabase
        .from('user_organizations')
        .select('user_id')
        .eq('org_id', orgId)
        .limit(1)
        .single();
      
      userId = orgUser?.user_id || orgId;
      console.log('🤖 Running in autonomous mode for org:', orgId);
    }

    // ULTRA-AUTONOMOUS CONFIG: Higher batch size and parallel mode enabled by default
    const { batch_size, parallel_mode } = await req.json().catch(() => ({}));

    // ULTRA MODE: Process 300 items per batch (was 200)
    const effectiveBatchSize = batch_size || 300;
    const parallelMode = parallel_mode !== false; // Default to true

    console.log(`🧠 ULTRA Knowledge Graph Builder for org ${orgId}`);
    console.log(`📊 Processing batch of ${effectiveBatchSize} items (parallel: ${parallelMode})`);

    // Fetch knowledge items
    const { data: knowledgeItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, confidence_score')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(effectiveBatchSize);

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
        model: 'google/gemini-2.5-pro',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: `Je bent een ULTRA knowledge graph expert die semantische relaties detecteert tussen kennisitems.
            
ULTRA MODE: Detecteer ook 2e-graads relaties en hiërarchieën.

EXTENDED Relationship Types (12):
- "contradicts": Items die elkaar tegenspreken
- "supports": Items die elkaar ondersteunen/aanvullen
- "extends": Item breidt ander item uit met details
- "requires": Item vereist ander item (harde afhankelijkheid)
- "prerequisite": Item is voorwaarde voor ander item
- "replaces": Nieuwe info vervangt oude (met datum)
- "supersedes": Nieuwere versie van oude info
- "related_to": Algemene thematische relatie
- "part_of": Item is onderdeel van groter geheel
- "example_of": Item is voorbeeld van algemene regel
- "alternative": Item is alternatief voor ander item
- "price_comparison": Tariefvergelijking tussen items

ADVANCED ANALYSIS:
- Detecteer ook indirecte relaties (A→B, B→C betekent A⇢C)
- Let op temporele relaties (oude vs nieuwe regelgeving)
- Identificeer hiërarchieën (CAO → schaal → functie)
- Zoek cross-category relaties

Voor elke relatie, geef:
1. source_id en target_id (UUID's)
2. relationship_type (uit bovenstaande lijst)
3. confidence (0.5-1.0)
4. context (gedetailleerde uitleg, max 200 chars)
5. strength ("weak"/"medium"/"strong")

⚠️ CRITICAL: Return ONLY a JSON object with a "relationships" array. No markdown, no extra text.
Format:
{
  "relationships": [
    {
      "source_id": "uuid",
      "target_id": "uuid",
      "relationship_type": "type",
      "confidence": 0.8,
      "context": "explanation",
      "strength": "medium"
    }
  ]
}`
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

    // Parse AI response with robust JSON mode handling
    let relationships = [];
    try {
      const parsedResponse = JSON.parse(aiContent);
      
      // JSON mode returns object with "relationships" key
      if (parsedResponse.relationships && Array.isArray(parsedResponse.relationships)) {
        relationships = parsedResponse.relationships;
        console.log(`✅ Successfully parsed ${relationships.length} relationships from JSON object`);
      } 
      // Fallback: if AI still returns array directly (legacy support)
      else if (Array.isArray(parsedResponse)) {
        relationships = parsedResponse;
        console.log(`✅ Successfully parsed ${relationships.length} relationships from array (legacy format)`);
      }
      else {
        console.error('❌ Unexpected JSON structure:', Object.keys(parsedResponse));
        relationships = [];
      }
      
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.error('Raw response (first 500 chars):', aiContent.slice(0, 500));
      
      // Log failure to function_call_logs for monitoring
      await supabase.from('function_call_logs').insert({
        function_name: 'knowledge-graph-builder',
        org_id: orgId,
        user_id: userId,
        error_message: `JSON parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        success: false,
        execution_time_ms: Date.now() - startTime,
        model_used: 'google/gemini-2.5-pro'
      });
      
      relationships = [];
    }

    console.log(`🔗 Detected ${relationships.length} relationships`);

    // ULTRA MODE: Batch insert relationships with enhanced metadata
    let insertedCount = 0;
    const errors: Array<{error: string, count?: number}> = [];

    if (relationships.length > 0) {
      try {
        const relationshipsToInsert = relationships.map((rel: any) => ({
          source_knowledge_id: rel.source_id,
          target_knowledge_id: rel.target_id,
          relationship_type: rel.relationship_type,
          confidence_score: rel.confidence || 0.8,
          detected_by: 'ai',
          context: rel.context || '',
          metadata: {
            strength: rel.strength || 'medium',
            model: 'gemini-2.5-pro',
            detected_at: new Date().toISOString(),
            batch_size: effectiveBatchSize,
            ultra_mode: true
          }
        }));

        const { data: inserted, error: batchError } = await supabase
          .from('knowledge_relationships')
          .upsert(relationshipsToInsert, {
            onConflict: 'source_knowledge_id,target_knowledge_id,relationship_type',
            ignoreDuplicates: false
          })
          .select();

        if (batchError) {
          console.error('Batch insert error:', batchError);
          errors.push({ error: batchError.message, count: relationships.length });
        } else {
          insertedCount = inserted?.length || 0;
        }
      } catch (err) {
        console.error('Error processing relationships:', err);
        errors.push({ error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Log function call for budget tracking
    const executionTime = Date.now() - startTime;
    const inputTokens = Math.ceil(JSON.stringify(knowledgeContext).length / 4);
    const outputTokens = Math.ceil(aiContent.length / 4);

    // Calculate relationship type distribution
    const typeDistribution = relationships.reduce((acc: Record<string, number>, rel: any) => {
      acc[rel.relationship_type] = (acc[rel.relationship_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgConfidence = relationships.length > 0 
      ? relationships.reduce((sum: number, r: any) => sum + r.confidence, 0) / relationships.length
      : 0;

    await supabase.from('function_call_logs').insert({
      user_id: userId,
      org_id: orgId,
      function_name: 'knowledge-graph-builder',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_eur: 0, // Free during promotion
      model_used: 'gemini-2.5-pro',
      success: true,
      execution_time_ms: executionTime
    });

    console.log(`✅ ULTRA MODE: Successfully inserted ${insertedCount} relationships`);
    console.log(`📊 Type distribution:`, typeDistribution);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during insertion`);
    }

    // FASE 4: Self-Supervised Pattern Discovery
    // Analyze ALL relationships to discover meta-patterns
    if (insertedCount > 10) { // Only run if we have enough data
      console.log('🔬 FASE 4: Discovering meta-patterns...');
      
      // Fetch ALL relationships for this org for pattern analysis
      const { data: allRelationships } = await supabase
        .from('knowledge_relationships')
        .select(`
          *,
          source:ai_knowledge_base!source_knowledge_id(category, key),
          target:ai_knowledge_base!target_knowledge_id(category, key)
        `)
        .limit(1000); // Analyze last 1000 relationships

      if (allRelationships && allRelationships.length > 50) {
        // Call AI to discover patterns
        const patternResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-pro',
            response_format: { type: "json_object" },
            messages: [
              {
                role: 'system',
                content: `Je bent een meta-pattern discovery expert die patronen ontdekt in knowledge graph relationships.

Analyseer deze relationships en ontdek HERHALENDE PATRONEN zoals:
- "Alle items met category 'tarieven' + keyword 'client_X' hebben relationship met CAO items"
- "Items over 'verlof' hebben vaak contradicts-relaties (regelwijzigingen)"
- "Client-vragen triggeren vaak 5+ related business_rule items"
- "Items met 'zzp' + 'btw' hebben altijd 'requires' relatie naar 'kvk' items"

Voor elk ontdekt pattern, geef:
1. pattern_description (duidelijke beschrijving)
2. confidence (0.6-1.0)
3. occurrences (hoe vaak gezien)
4. suggested_category (nieuwe category suggestie)

⚠️ CRITICAL: Return ONLY a JSON object with a "patterns" array.
Format:
{
  "patterns": [
    {
      "pattern_description": "string",
      "confidence": 0.85,
      "occurrences": 42,
      "suggested_category": "string"
    }
  ]
}`
              },
              {
                role: 'user',
                content: `Analyseer deze ${allRelationships.length} relationships en ontdek meta-patterns:\n\n${JSON.stringify(allRelationships.slice(0, 200), null, 2)}`
              }
            ],
            temperature: 0.4,
          }),
        });

        if (patternResponse.ok) {
          const patternData = await patternResponse.json();
          const patternContent = patternData.choices[0].message.content;
          
          try {
            const parsedPatterns = JSON.parse(patternContent);
            const patterns = parsedPatterns.patterns || [];
            
            if (patterns.length > 0) {
              // Store discovered patterns
              const patternsToInsert = patterns.map((p: any) => ({
                org_id: orgId,
                pattern_description: p.pattern_description,
                confidence: p.confidence,
                occurrences: p.occurrences,
                suggested_category: p.suggested_category,
                pattern_data: { 
                  source: 'knowledge-graph-builder',
                  relationship_count: allRelationships.length,
                  discovered_at: new Date().toISOString()
                }
              }));

              const { data: insertedPatterns, error: patternError } = await supabase
                .from('ai_meta_patterns')
                .insert(patternsToInsert)
                .select();

              if (!patternError && insertedPatterns) {
                console.log(`🔬 Discovered and stored ${insertedPatterns.length} meta-patterns`);
              }
            }
          } catch (parseError) {
            console.error('⚠️ Failed to parse pattern discovery:', parseError);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      mode: 'ultra',
      knowledge_items_analyzed: knowledgeItems.length,
      relationships_detected: relationships.length,
      relationships_stored: insertedCount,
      relationship_types: typeDistribution,
      avg_confidence: avgConfidence.toFixed(2),
      errors: errors.length,
      execution_time_ms: executionTime,
      tokens_used: inputTokens + outputTokens,
      cost_estimate: `€${((inputTokens + outputTokens) * 0.000001 * 0.30).toFixed(4)}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Knowledge Graph Builder error:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});