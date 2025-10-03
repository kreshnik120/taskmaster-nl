import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CommunicationAnalysis {
  category: string;
  key: string;
  value: any;
  confidence_score: number;
  source: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📞 Client Communication Coach starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get org_id (fallback to hardcoded for autonomous mode)
    const orgId = '550e8400-e29b-41d4-a716-446655440000';
    console.log(`🤖 Running in autonomous mode for org: ${orgId}`);

    // 1. Analyze recent application conversations
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: conversations, error: convError } = await supabase
      .from('application_conversations')
      .select(`
        *,
        professional_applications!inner(
          org_id,
          email_from,
          status
        )
      `)
      .gte('created_at', sevenDaysAgo)
      .eq('professional_applications.org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (convError) {
      console.error('Error fetching conversations:', convError);
    }

    // 2. Analyze recent chat messages
    const { data: chatMessages, error: chatError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('role', 'assistant')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if (chatError) {
      console.error('Error fetching chat messages:', chatError);
    }

    // 3. Analyze task comments
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        tasks!inner(org_id)
      `)
      .eq('tasks.org_id', orgId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(40);

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
    }

    // 4. Prepare context for AI analysis
    const communicationContext = {
      conversations: conversations?.slice(0, 20) || [],
      chatMessages: chatMessages?.slice(0, 15) || [],
      comments: comments?.slice(0, 15) || [],
      stats: {
        total_conversations: conversations?.length || 0,
        total_chats: chatMessages?.length || 0,
        total_comments: comments?.length || 0,
      }
    };

    console.log(`📊 Analysis context: ${communicationContext.stats.total_conversations} conversations, ${communicationContext.stats.total_chats} chats, ${communicationContext.stats.total_comments} comments`);

    // 5. Call AI for communication analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiPrompt = `Je bent een expert in klantcommunicatie voor zorguitzendbureau's (CitoZorg/ABCzorg).

CONTEXT:
- Aantal conversaties geanalyseerd: ${communicationContext.stats.total_conversations}
- Aantal chat berichten: ${communicationContext.stats.total_chats}
- Aantal comments: ${communicationContext.stats.total_comments}

VOORBEELDEN VAN RECENTE COMMUNICATIE:
${JSON.stringify(communicationContext, null, 2)}

ANALYSEER EN GENEREER:
1. **Tone Guidelines** - Voor verschillende scenario's (sollicitatie acceptatie, afwijzing, urgente vragen)
2. **Response Templates** - Professionele templates voor veelvoorkomende situaties
3. **Best Practices** - Wat werkt goed in klantcommunicatie
4. **Common Pain Points** - Wat gaat vaak mis en hoe dit te voorkomen
5. **FAQ Items** - Veelgestelde vragen en standaard antwoorden
6. **Escalation Prevention** - Technieken om escalaties te voorkomen

UITVOER FORMAT:
Genereer 15-25 kennis items in dit JSON formaat:
[
  {
    "category": "client_communication",
    "key": "tone_guidelines_application_response",
    "value": {
      "scenario": "sollicitatie reactie",
      "tone": "vriendelijk-professioneel",
      "do": ["gebruik voornaam", "toon waardering", "wees specifiek"],
      "dont": ["formeel jargon", "vage beloftes"],
      "example": "Beste [naam], Bedankt voor je interesse in de functie bij [client]..."
    },
    "confidence_score": 0.85,
    "source": "client_communication_coach"
  }
]

CATEGORIEËN:
- client_communication_templates
- client_communication_best_practices  
- client_communication_tone_analysis
- client_communication_escalation_prevention
- client_communication_faq

Genereer diverse, praktische items die direct bruikbaar zijn!`;

    console.log('🤖 Calling AI for communication analysis...');

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
            role: 'user',
            content: aiPrompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices[0]?.message?.content || '[]';
    
    console.log('🤖 AI Response received, parsing knowledge items...');

    // Parse AI response
    let knowledgeItems: CommunicationAnalysis[] = [];
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || 
                       aiContent.match(/```\n([\s\S]*?)\n```/) ||
                       [null, aiContent];
      const jsonContent = jsonMatch[1] || aiContent;
      knowledgeItems = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('AI response:', aiContent.substring(0, 500));
    }

    console.log(`📚 Parsed ${knowledgeItems.length} communication knowledge items`);

    // 6. Store knowledge items in database
    if (knowledgeItems.length > 0) {
      const knowledgeRecords = knowledgeItems.map(item => ({
        org_id: orgId,
        user_id: orgId, // System user
        category: item.category || 'client_communication',
        key: item.key,
        value: item.value,
        confidence_score: item.confidence_score || 0.8,
        source: item.source || 'client_communication_coach',
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('ai_knowledge_base')
        .insert(knowledgeRecords)
        .select();

      if (insertError) {
        console.error('Error storing knowledge:', insertError);
        throw insertError;
      }

      console.log(`✅ Stored ${inserted?.length || 0} communication knowledge items`);

      // Log function call
      await supabase.from('function_call_logs').insert({
        org_id: orgId,
        user_id: orgId,
        function_name: 'client-communication-coach',
        model_used: 'google/gemini-2.5-flash',
        success: true,
      });

      return new Response(
        JSON.stringify({
          success: true,
          items_generated: inserted?.length || 0,
          categories: [...new Set(knowledgeItems.map(i => i.category))],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('⚠️ No knowledge items generated');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No knowledge items generated',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

  } catch (error) {
    console.error('❌ Client Communication Coach error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
