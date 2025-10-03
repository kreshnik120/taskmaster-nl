import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// ULTRA SELF-TRAINING QUESTIONS (52 vragen + PLANNING & MATCHING FOCUS)
const SELF_TRAINING_QUESTIONS = [
  // NIVEAU 1: Basis Knowledge Check (5)
  "Wat zijn de belangrijkste CAO VVT bepalingen voor 2025?",
  "Welke diploma's zijn vereist voor een Verzorgende IG functie?",
  "Wat is het verschil tussen Wlz en Zvw?",
  "Wat zijn de basiseisen voor ZZP'ers in de zorg?",
  "Welke registraties zijn verplicht voor zorgverleners?",
  
  // NIVEAU 2: Applied Knowledge (11 vragen - 6 NEW)
  "Hoe bereken ik het correcte uurtarief voor een Verpleegkundige niveau 4 volgens CAO?",
  "Welke stappen moet ik volgen om een ZZP'er compliant in te zetten?",
  "Wat zijn de juridische risico's bij inzet van tijdelijke krachten?",
  "Hoe controleer ik of een professional voldoet aan alle compliance eisen?",
  "Welke verzekeringen moet een ZZP'er minimaal hebben?",
  // NEW PLANNING/MATCHING BASICS:
  "Wat zijn basis criteria voor professional-client matching?",
  "Hoe werkt beschikbaarheid planning voor ZZP'ers?",
  "Wat is optimale shift lengte voor Verzorgende IG?",
  "Welke kwalificaties zijn vereist voor functie niveau 4?",
  "Hoe check ik beschikbaarheid van een professional?",
  "Wat zijn typische planning constraints in de zorg?",
  
  // NIVEAU 3: Complex Scenarios (15 vragen - 10 NEW)
  "Een ZZP'er wil 32 uur per week werken bij Stichting X. Wat zijn alle juridische, financiële en compliance aspecten die ik moet checken?",
  "Hoe ga ik om met een situatie waarbij een professional niet BIG-geregistreerd is maar wel relevante ervaring heeft?",
  "Wat is het verschil in aansprakelijkheid tussen een ZZP'er met BAV en zonder BAV?",
  "Welke CAO bepalingen zijn van toepassing bij overwerk in de nachtdienst?",
  "Hoe combineer ik Wlz tarieven met CAO schalen voor een juiste prijsstelling?",
  // NEW PLANNING/MATCHING SCENARIOS:
  "Welke factoren bepalen een succesvolle professional-client match?",
  "Wat zijn typische planningsconflicten en hoe los je die op?",
  "Hoe bepaal je optimale shift lengte per functie niveau?",
  "Welke rol speelt reistijd in planning optimalisatie?",
  "Hoe combineer je ZZP en loondienst personeel effectief?",
  "Wat zijn early warning signals voor planning problemen?",
  "Hoe balanceer je client voorkeuren met professional beschikbaarheid?",
  "Welke metrics gebruik je voor match quality?",
  "Hoe optimaliseer je capacity utilization?",
  "Wat zijn best practices voor last-minute vervangingen?",
  
  // NIVEAU 4: Strategic Thinking (15 vragen - 10 NEW)
  "Analyseer de belangrijkste compliance risico's voor CitoZorg en geef concrete mitigatie strategieën.",
  "Wat zijn de financiële implicaties van de nieuwe Wet DBA voor ons bedrijfsmodel?",
  "Hoe kunnen we onze matching algoritme optimaliseren op basis van CAO schalen en client budgets?",
  "Welke trends zie je in de zorgarbeidsmarkt en hoe moeten we daarop anticiperen?",
  "Wat zijn de 3 grootste knowledge gaps in onze huidige database?",
  // NEW PLANNING/MATCHING STRATEGY:
  "Hoe optimaliseer je reistijd tussen opeenvolgende opdrachten?",
  "Wanneer automatisch toewijzen vs. handmatig reviewen?",
  "Welke early warning signals voor professional burnout?",
  "Hoe voorkom je onder-/overbezetting bij clients?",
  "Strategieën voor capacity planning bij onverwachte pieken?",
  "Hoe balanceer je workload over verschillende functieniveaus?",
  "Welke data points zijn kritiek voor accurate planning?",
  "Hoe optimaliseer je professional satisfaction vs. business efficiency?",
  "Wat zijn de trade-offs tussen verschillende staffing modellen?",
  "Hoe meet je en verbeter je matching accuracy over tijd?",
  
  // NIVEAU 5: Meta-Learning (6 vragen - 4 NEW)
  "Welke informatie zou ik MOETEN weten maar momenteel NIET weet?",
  "Op welke vragen geef ik momenteel suboptimale antwoorden?",
  "Welke nieuwe regelgeving komt eraan waar we nu al op moeten anticiperen?",
  "Hoe kan ik mijn confidence scores beter kalibreren?",
  "Welke bronnen zou ik moeten monitoren voor proactieve updates?",
  // NEW META-LEARNING PLANNING:
  "Ontwerp een self-learning matching algoritme dat verbetert met elke assignment",
  "Hoe anticipeer je op toekomstige workforce trends en skill gaps?",
  "Welke onzichtbare patronen in onze data kunnen planning optimaliseren?",
  "Hoe balanceer je korte termijn efficiency met lange termijn talent development?"
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRITICAL: Auto-disable after free period
    if (new Date() > CUTOFF_DATE) {
      console.log('⛔ Self-Trainer DISABLED: Free period ended');
      return new Response(JSON.stringify({ 
        stopped: true, 
        reason: 'Self-trainer disabled after free period to prevent costs'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
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

        const { data: userOrg, error: orgError } = await supabase
          .from('user_organizations')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (orgError || !userOrg) {
          console.error('❌ No organization found for user');
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

    const { question_index, mode } = await req.json();

    // Select question based on index or random
    const questionIdx = question_index ?? Math.floor(Math.random() * SELF_TRAINING_QUESTIONS.length);
    const question = SELF_TRAINING_QUESTIONS[questionIdx];
    const complexity = Math.floor(questionIdx / 5) + 1; // 1-5 based on index

    console.log(`🧠 Self-Training Question (Complexity ${complexity}/5): ${question}`);

    // Fetch relevant knowledge for context
    const { data: knowledgeContext } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, confidence_score')
      .is('deleted_at', null)
      .order('confidence_score', { ascending: false })
      .limit(20);

    const contextStr = knowledgeContext?.map(k => 
      `[${k.category}] ${k.key}: ${typeof k.value === 'object' ? JSON.stringify(k.value) : k.value}`
    ).join('\n') || '';

    // Ask the question to yourself using AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Je bent een CitoZorg AI die zichzelf aan het trainen is.

Beantwoord de vraag zo goed mogelijk met de beschikbare kennis.
Indien je kennis tekortschiet, geef dat EXPLICIET aan.

Output ALLEEN valid JSON:
{
  "answer": "detailed answer to the question",
  "confidence": 0.0-1.0,
  "knowledge_used": ["knowledge_id1", "knowledge_id2"],
  "knowledge_gaps": ["specific gap 1", "specific gap 2"],
  "needs_research": true/false,
  "research_topics": ["topic to research 1", "topic 2"],
  "self_critique": "what could be improved in this answer"
}`
          },
          {
            role: 'user',
            content: `Beschikbare kennis:\n${contextStr}\n\nVraag: ${question}`
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const aiContent = aiData.choices[0].message.content;

    let result;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiContent);
    } catch {
      result = {
        answer: aiContent,
        confidence: 0.5,
        knowledge_gaps: ['Could not parse structured output'],
        needs_research: true
      };
    }

    // Store the learning event
    const { error: learningError } = await supabase
      .from('ai_learning_events')
      .insert({
        org_id: orgId,
        user_id: userId,
        event_type: 'self_training',
        context: {
          question,
          question_index: questionIdx,
          complexity_level: complexity,
          knowledge_context_count: knowledgeContext?.length || 0
        },
        ai_response: result,
        learning_score: result.confidence,
        outcome: result.needs_research ? 'needs_research' : 'learned',
        applied_to_knowledge_base: false
      });

    if (learningError) {
      console.error('Error storing learning event:', learningError);
    }

    // If low confidence or needs research, trigger auto-harvester
    if (result.confidence < 0.7 || result.needs_research) {
      console.log('🔍 Low confidence detected, triggering auto-research...');
      
      if (result.research_topics && result.research_topics.length > 0) {
        // Trigger auto-knowledge-harvester with specific topics (don't await)
        supabase.functions.invoke('auto-knowledge-harvester', {
          body: { search_topics: result.research_topics }
        }).catch(err => console.error('Auto-harvest trigger failed:', err));
      }
    }

    // Log function call
    await supabase
      .from('function_call_logs')
      .insert({
        org_id: orgId,
        user_id: userId,
        function_name: 'self-trainer',
        success: true,
        input_tokens: aiData.usage?.prompt_tokens || 0,
        output_tokens: aiData.usage?.completion_tokens || 0,
        total_tokens: aiData.usage?.total_tokens || 0,
        model_used: 'gemini-2.5-flash',
        estimated_cost_eur: (aiData.usage?.total_tokens || 0) * 0.000001 * 0.15
      });

    return new Response(JSON.stringify({
      success: true,
      question,
      complexity_level: complexity,
      result,
      auto_research_triggered: result.confidence < 0.7 || result.needs_research,
      next_question_index: (questionIdx + 1) % SELF_TRAINING_QUESTIONS.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Self-Trainer error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
