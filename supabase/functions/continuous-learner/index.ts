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
    // Detect mode: authenticated vs autonomous with graceful fallback
    const authHeader = req.headers.get('Authorization');
    const isRealUserAuth = authHeader && !authHeader.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3');
    
    let orgId: string;
    let userId: string;
    let supabase: any;

    if (isRealUserAuth) {
      // TRY authenticated mode with real user
      console.log('🔐 Attempting authenticated mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        // FALLBACK to autonomous mode
        console.log('❌ Auth failed, falling back to autonomous mode');
        supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
        orgId = orgs![0].id;
        userId = orgId;
      } else {
        userId = user.id;
        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!userOrg) {
          const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
          orgId = orgs![0].id;
        } else {
          orgId = userOrg.org_id;
        }
      }
    } else {
      // AUTONOMOUS MODE
      console.log('🤖 Running in autonomous mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
      orgId = orgs![0].id;
      userId = orgId;
    }

    const { 
      user_question, 
      ai_response, 
      knowledge_used,
      user_feedback,
      auto_apply = true  // ✅ NIEUW: backward compatible, default TRUE
    } = await req.json();

    console.log('🎓 Continuous Learner analyzing interaction...');

    // Analyze the chat interaction with AI
    const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Je bent een AI learning expert die chat interacties analyseert om de kennisbank te verbeteren.

Analyseer deze interactie en bepaal:
1. Was het antwoord volledig? (yes/no)
2. Was het antwoord accuraat? (yes/no)
3. Welke kennis ontbreekt? (list missing topics)
4. Welke kennis moet worden geüpdatet? (list knowledge_ids met nieuwe confidence scores)
5. Zijn er tegenstrijdigheden gedetecteerd? (yes/no)
6. Suggesties voor nieuwe kennisitems (list max 3)

Output ALLEEN valid JSON object met deze keys:
{
  "completeness": "yes/no",
  "accuracy": "yes/no/uncertain",
  "missing_knowledge": ["topic1", "topic2"],
  "confidence_updates": [{"knowledge_id": "uuid", "new_confidence": 0.0-1.0, "reason": "text"}],
  "contradictions_found": true/false,
  "new_knowledge_suggestions": [{"category": "x", "key": "y", "value": "z", "confidence": 0.8}],
  "learning_score": 0.0-1.0
}`
          },
          {
            role: 'user',
            content: `Analyseer deze chat interactie:

VRAAG: ${user_question}

AI ANTWOORD: ${ai_response}

GEBRUIKTE KENNIS: ${JSON.stringify(knowledge_used || [])}

USER FEEDBACK: ${user_feedback || 'none'}`
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!analysisResponse.ok) {
      if (analysisResponse.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      if (analysisResponse.status === 402) {
        throw new Error('AI credits exhausted');
      }
      throw new Error(`AI API error: ${analysisResponse.status}`);
    }

    const analysisData = await analysisResponse.json();
    const analysisContent = analysisData.choices[0].message.content;

    console.log('📊 Analysis received, processing results...');

    let analysis;
    try {
      const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(analysisContent);
    } catch {
      analysis = {
        completeness: 'uncertain',
        accuracy: 'uncertain',
        learning_score: 0.5,
        missing_knowledge: [],
        confidence_updates: [],
        contradictions_found: false,
        new_knowledge_suggestions: []
      };
    }

    // ✅ NIEUW: Auto-create high-confidence knowledge suggestions
    let suggestionsCreated = 0;
    if (auto_apply && analysis.new_knowledge_suggestions?.length > 0) {
      console.log(`💡 Processing ${analysis.new_knowledge_suggestions.length} knowledge suggestions...`);
      
      for (const suggestion of analysis.new_knowledge_suggestions) {
        if (suggestion.confidence >= 0.85) {
          // Check for duplicates
          const { data: existingDup } = await supabase
            .from('ai_knowledge_base')
            .select('id')
            .eq('key', suggestion.key)
            .eq('org_id', orgId)
            .is('deleted_at', null)
            .limit(1);
          
          if (!existingDup || existingDup.length === 0) {
            const { error: insertError } = await supabase
              .from('ai_knowledge_base')
              .insert({
                user_id: userId,
                org_id: orgId,
                category: suggestion.category || 'learned_from_chat',
                key: suggestion.key,
                value: suggestion.value,
                confidence_score: suggestion.confidence,
                source: 'continuous_learner_auto_suggestion',
                auto_reviewed_at: new Date().toISOString(),
                review_count: 1
              });
            
            if (!insertError) {
              suggestionsCreated++;
              console.log(`✅ Created new knowledge: ${suggestion.key}`);
            }
          }
        }
      }
    }

    // Apply confidence updates (✅ VERBETERD: met validatie en safety checks)
    let updatesApplied = 0;
    if (auto_apply && analysis.confidence_updates?.length > 0) {
      console.log(`🔄 Applying ${analysis.confidence_updates.length} confidence updates...`);
      
      for (const update of analysis.confidence_updates) {
        // ✅ VALIDATION: Check if knowledge_id exists
        const { data: existingKb } = await supabase
          .from('ai_knowledge_base')
          .select('id, confidence_score, review_count')
          .eq('id', update.knowledge_id)
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .maybeSingle();
        
        if (!existingKb) {
          console.warn(`⚠️ Knowledge ${update.knowledge_id} not found, skipping update`);
          continue;
        }
        
        // ✅ SAFETY: Cap confidence between 0.3 and 1.0
        const newConfidence = Math.max(0.3, Math.min(1.0, update.new_confidence));
        
        const { error } = await supabase
          .from('ai_knowledge_base')
          .update({ 
            confidence_score: newConfidence,
            updated_at: new Date().toISOString(),
            auto_reviewed_at: new Date().toISOString(),
            review_count: (existingKb.review_count || 0) + 1,
            last_validation_error: null
          })
          .eq('id', update.knowledge_id)
          .eq('org_id', orgId);

        if (!error) {
          updatesApplied++;
          console.log(`✅ Updated ${update.knowledge_id}: ${existingKb.confidence_score} → ${newConfidence}`);
        } else {
          console.error(`❌ Failed to update ${update.knowledge_id}:`, error);
        }
      }
    }

    // Store learning event
    const { data: learningEvent } = await supabase
      .from('ai_learning_events')
      .insert({
        user_id: userId,
        org_id: orgId,
        event_type: 'chat_analysis',
        context: {
          question: user_question,
          response: ai_response,
          knowledge_used: knowledge_used,
          user_feedback: user_feedback
        },
        ai_response: analysis,
        outcome: analysis.completeness === 'yes' && analysis.accuracy === 'yes' ? 'success' : 'needs_improvement',
        learning_score: analysis.learning_score,
        applied_to_knowledge_base: auto_apply && (updatesApplied > 0 || suggestionsCreated > 0)  // ✅ DYNAMISCH: alleen TRUE als daadwerkelijk toegepast
      })
      .select()
      .single();

    // Mark contradictions for review
    if (analysis.contradictions_found) {
      for (const knowledge of knowledge_used || []) {
        await supabase
          .from('ai_knowledge_base')
          .update({ needs_review: true })
          .eq('id', knowledge.id)
          .eq('org_id', orgId);
      }
    }

    // Log function call
    const executionTime = Date.now() - startTime;
    const inputTokens = Math.ceil((user_question.length + ai_response.length) / 4);
    const outputTokens = Math.ceil(analysisContent.length / 4);

    await supabase.from('function_call_logs').insert({
      user_id: userId,
      org_id: orgId,
      function_name: 'continuous-learner',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_eur: 0,
      model_used: 'gemini-2.5-flash',
      success: true,
      execution_time_ms: executionTime
    });

    console.log(`✅ Learning analysis complete. ${updatesApplied} confidence scores updated.`);

    return new Response(JSON.stringify({
      success: true,
      analysis: analysis,
      learning_event_id: learningEvent?.id,
      confidence_updates_applied: updatesApplied,
      suggestions_created: suggestionsCreated,  // ✅ NIEUW
      contradictions_marked: analysis.contradictions_found,
      auto_apply_enabled: auto_apply,  // ✅ NIEUW
      execution_time_ms: executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Continuous Learner error:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});