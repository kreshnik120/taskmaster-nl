import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// GUEST AI MARKT INTELLIGENCE TOPICS (60+ market research areas)
const GUEST_AI_TEACHING_TOPICS = [
  // Categorie 1: GGZ Instellingen (15 topics)
  'Top 20 GGZ organisaties Nederland personeel omzet 2024-2025',
  'GGZ instellingen externe inhuur budget per regio Nederland',
  'GGZ instellingen ZZP beleid en uurtarieven 2025',
  'Forensische zorg instellingen personeelsbestand capaciteit',
  'GGZ crisis zorg aanbieders Nederland 2025',
  'Parnassia Groep personeelsdata en externe inhuur',
  'GGZ inGeest organisatiestructuur en ZZP gebruik',
  'Altrecht GGZ locaties en personeelsbestand',
  'Arkin GGZ externe inhuur kosten 2024',
  'Antes zorg personeelsplanning en capaciteit',
  'Vincent van Gogh GGZ ZZP tarieven afspraken',
  'Dimence Groep personeelsbestand en inhuur budget',
  'Lentis GGZ organisatie marktdata 2025',
  'Mondriaan GGZ externe personeelskosten',
  'ProPersona GGZ inhuur strategie 2025',
  
  // Categorie 2: Gehandicaptenzorg GHZ (12 topics)
  'Top GHZ organisaties Nederland omzet medewerkers 2025',
  'GHZ instellingen ZZP gebruik en externe inhuur data',
  'Jeugdzorg GHZ sector personeelstekorten 2025',
  'Woonvormen GHZ aantal locaties per organisatie',
  'Prisma zorg aantal medewerkers locaties specialisaties',
  'Prisma externe inhuur budget en ZZP beleid',
  'Philadelphia Zorg personeelsbestand en ZZP gebruik',
  'Lunet Zorg organisatiestructuur en zorgtypen',
  'Lunet externe personeelskosten en inhuur 2025',
  'Sovida zorg personeelsbestand en specialisaties',
  'Sovida ZZP gebruik en planning praktijk',
  'Amarant Groep personeelsdata en externe inhuur',
  
  // Categorie 3: Ouderenzorg (10 topics)
  'Top ouderenzorg organisaties Nederland 2024-2025',
  'Verpleeghuizen externe inhuur kosten per organisatie',
  'Thuiszorg organisaties personeelsbestand 2025',
  'Wijkverpleging aanbieders marktaandeel Nederland',
  'Envida personeelskosten externe medewerkers 2025',
  'Zorggroep Apeldoorn omzet en personeelsdata',
  'Cordaan zorg locaties en personeelsbestand 2025',
  'Vitalis WoonZorg Groep capaciteit en inhuur',
  'Humanitas DMH marktpositie en personeelsdata',
  'Florence ouderenzorg externe inhuur strategie',
  
  // Categorie 4: VG Sector & Verslavingszorg (8 topics)
  'VG sector organisaties externe inhuur 2025',
  'Persoonlijke verzorging aanbieders marktdata',
  'Thuisbegeleiding organisaties personeelsbestand',
  'Verslavingszorg instellingen Nederland overzicht 2025',
  'Verslavingszorg personeelsbestand en ZZP gebruik',
  'Ambulante vs klinische verslavingszorg aanbieders',
  'Iriszorg verslavingszorg externe inhuur budget',
  'Tactus Verslavingszorg personeelsplanning',
  
  // Categorie 5: Planning Intelligence (12 topics)
  'Personeelsplanning zorg critical success factors 2025',
  'Beschikbaarheid matching algoritmes zorgprofessionals',
  'Locatie optimalisatie reistijd compensatie zorg Nederland',
  'Certificering diploma eisen per zorgfunctie 2025',
  'Skill matching strategieën professional client fit',
  'Continuïteit van zorg planning vaste gezichten beleid',
  'Shift lengte optimalisatie per zorgzwaarte niveau',
  'Reistijd berekening maximum afstanden zorgprofessionals',
  'Client voorkeur management preference matching zorg',
  'Professional tevredenheid retention strategieën',
  'Capacity forecasting modellen healthcare sector',
  'Roostering efficiency KPIs zorgorganisaties Nederland',
  
  // Categorie 6: Markt & Financiële Intelligence (8 topics)
  'Zorg externe inhuur markt Nederland waarde 2024-2025',
  'ZZP zorg markt groei en ontwikkelingen 2025',
  'Personeelstekorten zorg sector per regio 2025',
  'Gemiddelde ZZP tarieven zorg per functie 2025',
  'Externe inhuur kosten top 50 zorgorganisaties',
  'Zorg vacatures markt per specialisatie 2025',
  'ZZP vs uitzendbureau marktaandeel zorg Nederland',
  'Healthcare staffing platforms marktoverzicht 2025'
];

// Helper function to extract category from topic (Market Intelligence Focus)
function extractCategoryFromTopic(topic: string): string {
  const lowerT = topic.toLowerCase();
  
  // GGZ Sector
  if (lowerT.includes('ggz') || lowerT.includes('geestelijke') || lowerT.includes('psychiatrisch') ||
      lowerT.includes('parnassia') || lowerT.includes('altrecht') || lowerT.includes('arkin')) {
    return 'ggz_markt';
  }
  
  // GHZ Sector
  if (lowerT.includes('ghz') || lowerT.includes('gehandicaptenzorg') || lowerT.includes('prisma') || 
      lowerT.includes('philadelphia') || lowerT.includes('lunet') || lowerT.includes('sovida') ||
      lowerT.includes('amarant')) {
    return 'ghz_markt';
  }
  
  // Ouderenzorg
  if (lowerT.includes('ouderenzorg') || lowerT.includes('verpleeghuis') || lowerT.includes('thuiszorg') ||
      lowerT.includes('wijkverpleging') || lowerT.includes('envida') || lowerT.includes('cordaan') ||
      lowerT.includes('vitalis') || lowerT.includes('humanitas') || lowerT.includes('florence')) {
    return 'ouderenzorg_markt';
  }
  
  // VG Sector & Verslavingszorg
  if (lowerT.includes('vg sector') || lowerT.includes('persoonlijke verzorging') || 
      lowerT.includes('verslavingszorg') || lowerT.includes('iriszorg') || lowerT.includes('tactus') ||
      lowerT.includes('thuisbegeleiding') || lowerT.includes('ambulante')) {
    return 'vg_verslavingszorg';
  }
  
  // Planning Intelligence
  if (lowerT.includes('planning') || lowerT.includes('roostering') || lowerT.includes('shift') ||
      lowerT.includes('matching') || lowerT.includes('optimalisatie') || lowerT.includes('capacity') ||
      lowerT.includes('beschikbaarheid') || lowerT.includes('certificering') || lowerT.includes('reistijd')) {
    return 'planning_intelligence';
  }
  
  // Markt & Financieel
  if (lowerT.includes('markt') || lowerT.includes('financieel') || lowerT.includes('inhuur') ||
      lowerT.includes('tarieven') || lowerT.includes('vacatures') || lowerT.includes('tekorten') ||
      lowerT.includes('waarde') || lowerT.includes('groei') || lowerT.includes('budget')) {
    return 'markt_financieel';
  }
  
  // Organisatie-specifiek
  if (lowerT.includes('personeelsbestand') || lowerT.includes('locaties') || 
      lowerT.includes('organisatie') || lowerT.includes('omzet') || lowerT.includes('medewerkers')) {
    return 'organisatie_intel';
  }
  
  // Default fallback
  return 'markt_intelligence';
}

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

    const { topic_index, mode } = await req.json();

    // Select topic based on index or random
    const topicIdx = topic_index ?? Math.floor(Math.random() * GUEST_AI_TEACHING_TOPICS.length);
    const topic = GUEST_AI_TEACHING_TOPICS[topicIdx];
    const priority = topicIdx < 30 ? 'high' : 'medium'; // First 30 topics are high priority

    console.log(`👨‍🏫 Guest AI Teaching Topic (${priority} priority): ${topic}`);

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
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: `Je bent een EXPERT AI Market Researcher die CitoZorg onderwijst over de zorgmarkt.

FOCUS GEBIEDEN:
1. Zorgorganisaties: personeel, omzet, locaties, specialisaties per sector
2. Externe inhuur markten: ZZP gebruik, budgetten, tarieven
3. Planning intelligence: beschikbaarheid, certificering, locatie matching
4. Financiële data: marktvolume, groei, personeelstekorten

DATA VEREISTEN:
- TIER 1 bronnen: CBS.nl, overheid.nl, jaarverslagen organisaties
- TIER 2 bronnen: ActiZ.nl, GGZ Nederland, VGN.nl + cross-validatie VERPLICHT
- Actuele data: 2024-2025 VERPLICHT (2023 of ouder = -0.2 confidence)
- Concrete cijfers: personeel aantallen, budgetten, tarieven, percentages

VALIDATIE STRENG:
- Minimum confidence: 0.85 (TIER 3 bronnen NIET MEER ACCEPTEREN)
- TIER 2 MOET cross-validated zijn door TIER 1
- Elke fact MOET 2+ bronnen hebben
- Laatste update datum + bron URL VERPLICHT

Output ALLEEN valid JSON met dit formaat:
{
  "facts": [
    {
      "content": "Concrete fact met alle details en cijfers",
      "category": "ggz_markt/ghz_markt/ouderenzorg_markt/planning_intelligence/markt_financieel/organisatie_intel",
      "confidence": 0.85-1.0,
      "sources": ["https://cbs.nl/...", "https://actiz.nl/..."],
      "last_updated": "2025-01",
      "cross_validated": true,
      "source_tier": "tier1_officieel/tier2_branche"
    }
  ],
  "total_facts": 3-5,
  "average_confidence": 0.85+,
  "quality_tier": "tier1/tier2"
}

REGELS:
1. Minimaal 3-5 facts per topic
2. Confidence >= 0.85 voor elke fact (reject < 0.85)
3. TIER 2 MOET cross-validated zijn (anders reject)
4. 2024-2025 data krijgt +0.1 confidence boost
5. Focus op concrete marktdata en organisatie intelligence`
          },
          {
            role: 'user',
            content: `Leer me ALLES over: ${topic}\n\nBeschikbare context (ter referentie):\n${contextStr}`
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
        facts: [],
        total_facts: 0,
        average_confidence: 0,
        quality_tier: 'failed'
      };
    }

    // Save all high-quality facts directly (Guest AI = Expert)
    let savedItemsCount = 0;
    if (result.facts && Array.isArray(result.facts) && result.facts.length > 0) {
      for (const fact of result.facts) {
        if (fact.confidence >= 0.85) {
          try {
            const category = fact.category || extractCategoryFromTopic(topic);
            
            // Check for duplicates
            const factSnippet = fact.content.substring(0, 30);
            const { data: existing } = await supabase
              .from('ai_knowledge_base')
              .select('id')
              .eq('category', category)
              .ilike('key', `%${factSnippet}%`)
              .is('deleted_at', null)
              .maybeSingle();
            
            if (existing) {
              console.log('⚠️ Duplicate fact detected, skipping');
            } else {
              const key = `guest_ai_${category}_${Date.now()}_${savedItemsCount}`;
              
              const { error: insertError } = await supabase
                .from('ai_knowledge_base')
                .insert({
                  org_id: orgId,
                  user_id: userId,
                  category: category,
                  key: key,
                  value: {
                    content: fact.content,
                    topic: topic,
                    confidence: fact.confidence,
                    sources: fact.sources || [],
                    last_updated: fact.last_updated,
                    cross_validated: fact.cross_validated,
                    source: 'guest_ai_expert',
                    learned_at: new Date().toISOString()
                  },
                  confidence_score: fact.confidence,
                  source: `guest_ai_topic_${topicIdx}_${result.quality_tier}`,
                  needs_review: fact.confidence < 0.9
                });
              
              if (!insertError) {
                savedItemsCount++;
                console.log(`✅ Saved Guest AI fact (confidence: ${fact.confidence})`);
              } else {
                console.error('❌ Failed to save fact:', insertError);
              }
            }
          } catch (saveError) {
            console.error('❌ Error saving fact:', saveError);
          }
        } else {
          console.log(`⚠️ Skipping low-confidence fact (${fact.confidence})`);
        }
      }
    }

    // Store the learning event
    const { error: learningError } = await supabase
      .from('ai_learning_events')
      .insert({
        org_id: orgId,
        user_id: userId,
        event_type: 'guest_ai_teaching',
        context: {
          topic,
          topic_index: topicIdx,
          priority: priority,
          quality_tier: result.quality_tier,
          knowledge_context_count: knowledgeContext?.length || 0
        },
        ai_response: result,
        learning_score: result.average_confidence || 0,
        outcome: savedItemsCount > 0 ? 'facts_learned' : 'no_facts',
        applied_to_knowledge_base: savedItemsCount > 0
      });

    if (learningError) {
      console.error('Error storing learning event:', learningError);
    }

    // If quality is low, trigger auto-harvester for verification
    if (result.average_confidence < 0.7 || result.quality_tier === 'tier2' || savedItemsCount === 0) {
      console.log('🔍 Low quality/confidence detected, triggering verification...');
      
      // Trigger auto-knowledge-harvester for additional validation
      supabase.functions.invoke('auto-knowledge-harvester', {
        body: { search_topics: [topic] }
      }).catch(err => console.error('Auto-harvest trigger failed:', err));
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
      topic,
      priority,
      result,
      facts_saved: savedItemsCount,
      quality_tier: result.quality_tier,
      auto_verification_triggered: result.average_confidence < 0.7 || savedItemsCount === 0,
      next_topic_index: (topicIdx + 1) % GUEST_AI_TEACHING_TOPICS.length
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
