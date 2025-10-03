import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    if (new Date() > CUTOFF_DATE) {
      return new Response(JSON.stringify({ 
        stopped: true, 
        reason: 'Free AI period ended' 
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

    const { 
      user_question, 
      ai_response, 
      knowledge_used,
      user_feedback 
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

    // Store learning event
    const { data: learningEvent } = await supabase
      .from('ai_learning_events')
      .insert({
        user_id: user.id,
        org_id: userOrg.org_id,
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
        applied_to_knowledge_base: false
      })
      .select()
      .single();

    // Apply confidence updates
    let updatesApplied = 0;
    for (const update of analysis.confidence_updates || []) {
      const { error } = await supabase
        .from('ai_knowledge_base')
        .update({ 
          confidence_score: update.new_confidence,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.knowledge_id)
        .eq('org_id', userOrg.org_id);

      if (!error) updatesApplied++;
    }

    // Mark contradictions for review
    if (analysis.contradictions_found) {
      for (const knowledge of knowledge_used || []) {
        await supabase
          .from('ai_knowledge_base')
          .update({ needs_review: true })
          .eq('id', knowledge.id)
          .eq('org_id', userOrg.org_id);
      }
    }

    // Log function call
    const executionTime = Date.now() - startTime;
    const inputTokens = Math.ceil((user_question.length + ai_response.length) / 4);
    const outputTokens = Math.ceil(analysisContent.length / 4);

    await supabase.from('function_call_logs').insert({
      user_id: user.id,
      org_id: userOrg.org_id,
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
      contradictions_marked: analysis.contradictions_found,
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