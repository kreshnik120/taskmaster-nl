import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// GUEST AI EXPERT TEACHING TOPICS (50+ essential knowledge areas)
const GUEST_AI_TEACHING_TOPICS = [
  // CAO Essentials (15 topics - 30%)
  'CAO VVT 2025 loonschalen per functie niveau 1-5',
  'CAO VVT overwerk regelingen en toeslagen nachtdienst weekend',
  'CAO VVT vakantiedagen opbouw en aanspraken per FTE',
  'CAO VVT werktijden roosters en wettelijke rusttijden',
  'CAO VVT functioneringsgesprekken en beoordeling',
  'CAO VVT scholing en ontwikkelbudget per medewerker',
  'CAO VVT reis en onkosten vergoedingen',
  'CAO VVT arbeidsvoorwaarden ZZP vs loondienst',
  'CAO VVT verlofrechten bijzonder verlof en calamiteiten',
  'CAO VVT proeftijd opzegtermijnen en ontslag',
  'CAO VVT ADV dagen en arbeidsmarkttoelage',
  'CAO VVT pensioenopbouw en premieverdeling',
  'CAO VVT functiewaardering en inschaling criteria',
  'CAO VVT gestandaardiseerde functieprofielen',
  'CAO VVT wijzigingen 2025 vs 2024',
  
  // Wlz/Zvw Compliance (15 topics - 30%)
  'Wlz zorgzwaartepakketten VV1-VV10 criteria en indicaties',
  'Zvw wijkverpleging prestaties en verrichtingen codes',
  'Wlz cliëntprofielen en zorgkenmerken per ZZP',
  'Zvw indicatiecriteria thuiszorg en persoonlijke verzorging',
  'Wlz verantwoordingsplicht en dossiervorming vereisten',
  'Zvw kwaliteitseisen en HKZ certificering',
  'Wlz MDO verplichtingen multidisciplinair overleg',
  'Zvw zorgplannen en evaluatie frequentie',
  'Wlz eigen bijdrage berekening 2025 tarieven',
  'Zvw verplicht eigen risico en maximum 2025',
  'Wlz contractering en zorginkoop per regio',
  'Zvw prestatiebeschrijvingen en normatieve tijden',
  'Wlz ICT systemen en digitale gegevensuitwisseling',
  'Zvw klachtenprocedures en geschillenregeling',
  'Wlz/Zvw verschil in verantwoordelijkheden en financiering',
  
  // ZZP Vereisten en Compliance (10 topics - 20%)
  'ZZP BAV beroepsaansprakelijkheidsverzekering minimale dekking zorg',
  'ZZP VOG Verklaring Omtrent Gedrag aanvraag en geldigheid',
  'Wet DBA 2025 handhaving en modelovereenkomsten',
  'ZZP BIG registratie verplichtingen per beroepsgroep',
  'ZZP kwaliteitsregister V&V inschrijving en herbeoordeling',
  'ZZP AVG compliance en verwerkersovereenkomsten',
  'ZZP fiscale verplichtingen BTW en inkomstenbelasting',
  'ZZP arbeidsongeschiktheidsverzekering AOV advisering',
  'ZZP pensioenopbouw en lijfrente aftrek mogelijkheden',
  'ZZP administratieve verplichtingen en archivering termijnen',
  
  // Planning Intelligence (5 topics - 10%)
  'Optimale shift lengte per functie niveau en zorgzwaarte',
  'Reistijd compensatie regelgeving en maximale afstanden',
  'Capacity planning forecasting methoden healthcare',
  'Roostering wettelijke rusttijden en Arbeidstijdenwet compliance',
  'Planning efficiency metrics en KPIs zorgorganisaties',
  
  // Professional Matching (5 topics - 10%)
  'Client voorkeuren matching criteria en compatibiliteit scoring',
  'Professional-client fit indicatoren en succesvoorspellers',
  'Match quality metrics en evaluatie criteria care sector',
  'Continuïteit van zorg planning en vaste gezichten beleid',
  'Professional satisfaction vs client needs balancering',
];

// Helper function to extract category from topic
function extractCategoryFromTopic(topic: string): string {
  const lowerT = topic.toLowerCase();
  
  // Planning/Matching related
  if (lowerT.includes('planning') || lowerT.includes('shift') || lowerT.includes('roostering')) {
    return 'processen';
  }
  if (lowerT.includes('matching') || lowerT.includes('fit indicator')) {
    return 'processen';
  }
  
  // CAO
  if (lowerT.includes('cao')) {
    return 'cao';
  }
  
  // Compliance/Legal
  if (lowerT.includes('compliance') || lowerT.includes('big') || lowerT.includes('registratie')) {
    return 'compliance';
  }
  if (lowerT.includes('wlz') || lowerT.includes('zvw') || lowerT.includes('zorgzwaarte')) {
    return 'wetgeving';
  }
  
  // ZZP
  if (lowerT.includes('zzp') || lowerT.includes('zelfstandige')) {
    return 'zzp_vereisten';
  }
  
  // Insurance
  if (lowerT.includes('verzekering') || lowerT.includes('bav') || lowerT.includes('aov')) {
    return 'verzekeringen';
  }
  
  // Default fallback
  return 'compliance';
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
            content: `Je bent een EXPERT AI leraar die CitoZorg AI onderwijst.

DOEL: Geef DIRECT high-quality facts over het gegeven topic.
GEBRUIK: Je volledige Gemini training + web search access.
VALIDATIE: Gebruik alleen Tier 1+2 bronnen (overheid.nl, nza.nl, caovvt.nl).

Output ALLEEN valid JSON met dit formaat:
{
  "facts": [
    {
      "content": "Concrete fact met alle details",
      "category": "cao/compliance/wetgeving/zzp_vereisten/tarieven",
      "confidence": 0.95,
      "sources": ["https://overheid.nl/...", "https://nza.nl/..."],
      "last_updated": "2025-01",
      "cross_validated": true
    }
  ],
  "total_facts": 3,
  "average_confidence": 0.95,
  "quality_tier": "tier1"
}

REGELS:
1. Minimaal 3-5 facts per topic
2. Confidence >= 0.85 voor elke fact
3. Tier 2 bronnen MOETEN cross-validated zijn
4. Laatste update datum verplicht
5. Concrete cijfers/bedragen/percentages waar mogelijk`
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
