import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get user and org
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!userOrg) throw new Error('No organization found');

    const body = await req.json();
    const {
      user_action,
      conflict_type,
      suggestion_data,
      items_affected,
      ai_reasoning,
      items,
      chosen_item_ids,
      deleted_item_ids,
      suggestion_id,
      conflict_id,
      auto_resolved,
      learning_score: providedLearningScore
    } = body;

    console.log('📝 Logging conflict resolution:', { user_action, conflict_type });
    console.log('📝 Auto-resolved status:', { 
      received: auto_resolved, 
      will_store: auto_resolved === true 
    });

    // Fetch involved knowledge items for context
    const itemIds = items_affected?.map((a: any) => a.item_id) || 
                    items?.map((i: any) => i.id) ||
                    [...(chosen_item_ids || []), ...(deleted_item_ids || [])];

    let knowledgeItems: any[] = [];
    if (itemIds && itemIds.length > 0) {
      const { data } = await supabase
        .from('ai_knowledge_base')
        .select('id, category, key, value, confidence_score')
        .in('id', itemIds);
      
      knowledgeItems = data || [];
    }

    // Prepare AI analysis prompt
    const analysisPrompt = `Analyseer deze conflict resolutie:

USER ACTIE: ${user_action}
CONFLICT TYPE: ${conflict_type}
AUTO-RESOLVED: ${auto_resolved ? 'JA - AI suggestie was automatisch geaccepteerd' : 'NEE - handmatige gebruiker keuze'}
AI REDENERING: ${ai_reasoning || suggestion_data?.reasoning || 'Niet beschikbaar'}

BETROKKEN ITEMS:
${knowledgeItems.map((item: any) => `- [${item.category}] ${item.key}: confidence=${item.confidence_score}`).join('\n')}

Bepaal:
1. Was de AI suggestie correct? (yes/no/uncertain)
2. Moet de confidence score van items aangepast worden?
3. Welke patronen moet de AI leren hiervan?
4. Learning score (0.0-1.0) - hoe nuttig is deze feedback?
   ${auto_resolved ? '(Hint: auto-resolved betekent zeer hoge zekerheid, boost learning score)' : ''}

Geef JSON output met deze exacte structuur:
{
  "ai_was_correct": true/false,
  "confidence_adjustments": [{"item_id": "uuid", "adjustment": 0.10, "reason": "text"}],
  "learned_patterns": ["pattern1", "pattern2"],
  "learning_score": 0.85
}`;

    // Call Lovable AI for analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const startTime = Date.now();
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
            content: 'Je bent een AI trainer die conflict resoluties analyseert om het systeem te verbeteren. Geef altijd valide JSON output.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiAnalysisText = aiData.choices?.[0]?.message?.content || '{}';
    
    // Parse AI response (try to extract JSON)
    let aiAnalysis: any = {};
    try {
      const jsonMatch = aiAnalysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        aiAnalysis = JSON.parse(aiAnalysisText);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', aiAnalysisText);
      aiAnalysis = {
        ai_was_correct: user_action === 'approved',
        confidence_adjustments: [],
        learned_patterns: ['parse_error'],
        learning_score: 0.5
      };
    }

    console.log('🤖 AI Analysis:', aiAnalysis);

    // Apply confidence score adjustments based on user action
    const adjustments = aiAnalysis.confidence_adjustments || [];
    
    // Add default adjustments based on action type
    if (user_action === 'approved' && chosen_item_ids) {
      chosen_item_ids.forEach((id: string) => {
        if (!adjustments.find((a: any) => a.item_id === id)) {
          adjustments.push({ item_id: id, adjustment: 0.10, reason: 'User approved this item' });
        }
      });
    } else if (user_action === 'rejected' && items_affected) {
      items_affected.forEach((item: any) => {
        if (!adjustments.find((a: any) => a.item_id === item.item_id)) {
          adjustments.push({ 
            item_id: item.item_id, 
            adjustment: -0.15, 
            reason: 'User rejected AI suggestion'
          });
        }
      });
    } else if (user_action === 'marked_as_complementary' && items) {
      items.forEach((item: any) => {
        const itemId = item.id || item.item_id;
        if (itemId && !adjustments.find((a: any) => a.item_id === itemId)) {
          adjustments.push({ 
            item_id: itemId, 
            adjustment: 0.05, 
            reason: 'Items are complementary, not conflicting'
          });
        }
      });
    }

    // Apply adjustments to database
    for (const adj of adjustments) {
      if (!adj.item_id) continue;
      
      const { data: currentItem } = await supabase
        .from('ai_knowledge_base')
        .select('confidence_score')
        .eq('id', adj.item_id)
        .single();

      if (currentItem) {
        const newScore = Math.max(0.1, Math.min(1.0, (currentItem.confidence_score || 0.5) + adj.adjustment));
        
        await supabase
          .from('ai_knowledge_base')
          .update({
            confidence_score: newScore,
            needs_review: user_action === 'rejected' ? true : false
          })
          .eq('id', adj.item_id);

        console.log(`✅ Updated confidence for ${adj.item_id}: ${currentItem.confidence_score} → ${newScore}`);
      }
    }

    // Create learning event
    const finalLearningScore = providedLearningScore || aiAnalysis.learning_score || 
      (user_action === 'marked_as_complementary' ? 0.95 : 
       user_action === 'rejected' ? 0.90 : 0.85);

    // Boost learning score voor auto-resolved items
    const adjustedLearningScore = auto_resolved 
      ? Math.min(1.0, finalLearningScore * 1.1) // 10% boost, max 1.0
      : finalLearningScore;

    const { error: learningError } = await supabase
      .from('ai_learning_events')
      .insert({
        user_id: user.id,
        org_id: userOrg.org_id,
        event_type: 'conflict_resolution',
        context: {
          user_action,
          conflict_type,
          conflict_id: conflict_id || suggestion_id,
          items_involved: knowledgeItems.map((i: any) => i.id),
          ai_reasoning: ai_reasoning || suggestion_data?.reasoning,
          auto_resolved: auto_resolved === true
        },
        ai_response: {
          analysis: aiAnalysis,
          adjustments_applied: adjustments,
          raw_response: aiAnalysisText
        },
        learning_score: adjustedLearningScore,
        applied_to_knowledge_base: adjustments.length > 0
      });

    if (learningError) {
      console.error('Failed to create learning event:', learningError);
    }

    // Log function call
    const executionTime = Date.now() - startTime;
    await supabase
      .from('function_call_logs')
      .insert({
        user_id: user.id,
        org_id: userOrg.org_id,
        function_name: 'log-conflict-resolution',
        success: true,
        execution_time_ms: executionTime,
        model_used: 'google/gemini-2.5-flash',
        input_tokens: Math.ceil(analysisPrompt.length / 4),
        output_tokens: Math.ceil(aiAnalysisText.length / 4),
        estimated_cost_eur: 0.002
      });

    console.log(`✅ Conflict resolution logged (${executionTime}ms)`);

    return new Response(
      JSON.stringify({ 
        success: true,
        ai_analysis: aiAnalysis,
        adjustments_applied: adjustments.length,
        learning_score: adjustedLearningScore
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in log-conflict-resolution:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
