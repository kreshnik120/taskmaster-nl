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

  try {
    // CRITICAL: Auto-disable after free period
    if (new Date() > CUTOFF_DATE) {
      console.log('⛔ Auto Knowledge Harvester DISABLED: Free period ended');
      return new Response(JSON.stringify({ 
        stopped: true, 
        reason: 'Auto-harvester disabled after free period to prevent costs',
        message: 'This function is permanently disabled to protect your budget'
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
      
      userId = orgUser?.user_id || orgId; // Fallback to orgId if no user found
      console.log('🤖 Running in autonomous mode for org:', orgId);
    }

    const { search_topics } = await req.json();

    console.log('🌐 Auto Knowledge Harvester starting search...');

    // ULTRA TOPICS: 125+ onderwerpen voor maximale coverage + PLANNING & MATCHING
    const defaultTopics = [
      // CAO & Arbeidsvoorwaarden (12)
      'CAO VVT wijzigingen 2025', 'CAO GGZ updates 2025', 'CAO Sociaal Werk nieuwe regels',
      'Eindejaarsuitkering zorg 2025', 'Vakantietoeslag regelgeving', 'Pensioenregeling zorg PFZW',
      'Onregelmatigheidstoeslag (ORT) tarieven', 'Overwerk compensatie zorg', 'Bereikbaarheidsdienst vergoeding',
      'Oproepkrachten rechten CAO', 'Parttimers secundaire arbeidsvoorwaarden', 'Loonschalen zorg 2025',
      
      // ZZP & DBA (10)
      'ZZP wetgeving Nederland 2025', 'Wet DBA handhaving 2025', 'Fictieve dienstbetrekking criteria',
      'ZZP opdrachtgeversverklaring eisen', 'Modelovereenkomst ZZP zorg', 'VAR verklaring afschaffing',
      'G-rekening ZZP constructie', 'Ketenaansprakelijkheid WKA zorg', 'ZZP rechten en plichten',
      'Tarievenafspraken ZZP zorg',
      
      // Registraties & Kwalificaties (8)
      'BIG-registratie nieuwe eisen 2025', 'LRZa registratie verplichtingen', 'SKJ register jeugdzorg',
      'Kwaliteitsregister Verpleegkundigen', 'VOG aanvraag procedure zorg', 'Artikel 9 screening zorg',
      'Herregistratie BIG verplichtingen', 'E-learning verplicht zorg',
      
      // Wetgeving & Compliance (10)
      'Wtza vergunningplicht zorg', 'Wkkgz meldplicht incidenten', 'AVG privacy zorg',
      'Zorgverzekeringswet Zvw updates', 'Wet langdurige zorg Wlz wijzigingen', 'WMO 2015 nieuwe regels',
      'Jeugdwet aanpassingen', 'Kwaliteitswet zorginstellingen', 'IGJ toezicht nieuwe eisen',
      'NEN normeringen zorg',
      
      // Tarieven & Financiën (8)
      'Zorgtarieven NZa 2025', 'ZZP tariefadvies 2025', 'Wmo tarief per uur',
      'Pgb budget 2025', 'Zorgzwaartepakketten ZZP tarieven', 'Uurtarief Wlz 2025',
      'Jeugdzorg tarief per uur', 'NZa beleidsregels tarieven',
      
      // Verzekeringen & Aansprakelijkheid (5)
      'Beroepsaansprakelijkheidsverzekering BAV eisen', 'Bedrijfsaansprakelijkheid zorg minimum',
      'Arbeidsongeschiktheidsverzekering ZZP', 'Aansprakelijkheid zorgverlener', 'Verzekeringen verplicht ZZP',

      // === NIEUWE PLANNING INTELLIGENCE TOPICS (25) ===
      'Shift optimalisatie algoritmes zorg', 'Reistijd berekening tussen opdrachten',
      'Capacity planning uitzendkrachten', 'Rustperiode compliance CAO', 'Nachtdienst rooster regels',
      'Planning constraints Wlz zorg', 'Shift lengte per functieniveau', 'Break time regelgeving',
      'Opeenvolgende diensten maximum', 'Planning software vereisten zorg',
      'Automated scheduling best practices', 'Last-minute vervangingen protocol',
      'Beschikbaarheid voorspelling modellen', 'Seasonal demand patterns zorg',
      'Weekend shift premies', 'Holiday shift staffing strategies', 'Continuïteit van zorg planning',
      'Flexpool management', 'On-call beschikbaarheid tarieven', 'Shift swap policies',
      'Planning efficiency metrics', 'Workforce forecasting methoden', 'Schedule optimization KPIs',
      'Real-time planning aanpassingen', 'Capacity utilization targets zorg',

      // === NIEUWE MATCHING INTELLIGENCE TOPICS (25) ===
      'Professional-client match success factors', 'Skill matching algoritmes',
      'Experience requirements per functieniveau', 'Cultural fit indicators zorg',
      'Client preference patterns', 'Professional satisfaction metrics',
      'Match quality scoring systemen', 'Assignment success predictors',
      'Client feedback patterns matching', 'Retention prediction models',
      'Skill gap analysis professionals', 'Training recommendations matching',
      'Client-professional compatibility scores', 'Long-term assignment success factors',
      'Professional development paths', 'Client needs assessment criteria',
      'Assignment duration optimization', 'Professional preference learning',
      'Client loyalty indicators', 'Match performance tracking metrics',
      'Professional burnout early warning signs', 'Client satisfaction drivers',
      'Assignment complexity scoring', 'Team composition optimization',
      'Cross-training opportunities identification',

      // === NIEUWE WORKFORCE OPTIMIZATION TOPICS (25) ===
      'ZZP vs loondienst cost comparison', 'Flexible staffing strategy zorg',
      'Workforce mix optimization', 'Cost per hour analyses per werkmodel',
      'Marginal contribution per professional type', 'Break-even point calculations',
      'Capacity planning forecast models', 'Demand volatility management',
      'Professional utilization rates optimization', 'Idle time reduction strategies',
      'Multi-skilling ROI calculations', 'Training investment optimization',
      'Professional retention strategies cost-benefit', 'Recruitment channel effectiveness',
      'Onboarding efficiency metrics', 'Time to productivity benchmarks',
      'Professional lifecycle value', 'Churn prediction models',
      'Compensation competitiveness analysis', 'Benefit package optimization',
      'Performance incentive structures', 'Career progression frameworks',
      'Talent pipeline management', 'Succession planning strategies',
      'Workforce analytics dashboards'
    ];

    const topics = search_topics || defaultTopics;
    const newKnowledge = [];

    for (const topic of topics) {
      console.log(`🔍 Searching for: ${topic}`);

      // Use AI to search and validate information
      const searchResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: `Je bent een ULTRA research assistant die actuele informatie zoekt en valideert met MULTI-TIER validation.

TIER 1 BRONNEN (confidence 0.9-1.0):
- overheid.nl, rijksoverheid.nl, belastingdienst.nl
- nza.nl (Nederlandse Zorgautoriteit)
- igj.nl (Inspectie Gezondheidszorg en Jeugd)
- officiële CAO websites (caovvt.nl)

TIER 2 BRONNEN (confidence 0.7-0.9):
- actiz.nl, btsg.nl, ggznederland.nl (brancheorganisaties)
- nivel.nl (Nederlands instituut voor onderzoek)
- vilans.nl (kenniscentrum langdurige zorg)
- vgn.nl (Vereniging Gehandicaptenzorg)

TIER 3 BRONNEN (confidence 0.5-0.7):
- zorgvisie.nl, skipr.nl (vakbladen)
- universiteiten en hogescholen (.edu)
- adviesbureaus en consultancy

Voor het gegeven onderwerp:
1. Zoek in MEERDERE bronnen (minimaal 2 verschillende tiers)
2. Cross-valideer informatie tussen bronnen
3. Extraheer concrete feiten, cijfers, datums
4. Geef confidence score gebaseerd op:
   - Tier van de bron (zie boven)
   - Actualiteit (2024-2025 = +0.1, 2023 = +0.0, ouder = -0.2)
   - Cross-validatie (2+ bronnen bevestigen = +0.1)

Output ALLEEN valid JSON:
{
  "found_information": true/false,
  "items": [
    {
      "category": "compliance/tarieven/cao/zzp/registraties/wetgeving/verzekeringen",
      "key": "descriptive_unique_key",
      "value": "detailed_information_with_specifics",
      "confidence": 0.5-1.0,
      "source_url": "primary_source_url",
      "source_type": "tier1_officieel/tier2_branche/tier3_vakblad",
      "date_published": "YYYY-MM-DD",
      "cross_validated": true/false,
      "validation_sources": ["url1", "url2"]
    }
  ],
  "search_quality": "excellent/good/poor",
  "total_sources_checked": 3
}`
            },
            {
              role: 'user',
              content: `Zoek actuele informatie over: ${topic}\n\nVandaag is: ${new Date().toISOString().split('T')[0]}`
            }
          ],
          temperature: 0.1,
        }),
      });

      if (!searchResponse.ok) {
        console.error(`Search failed for topic: ${topic}`);
        continue;
      }

      const searchData = await searchResponse.json();
      const searchContent = searchData.choices[0].message.content;

      let searchResults;
      try {
        const jsonMatch = searchContent.match(/\{[\s\S]*\}/);
        searchResults = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(searchContent);
      } catch {
        console.error(`Failed to parse results for: ${topic}`);
        continue;
      }

      if (searchResults.found_information && searchResults.items) {
        for (const item of searchResults.items) {
          // ULTRA MODE: Lowered threshold to 0.5, accept all tier sources
          if (item.confidence >= 0.5) {
            // Boost confidence if cross-validated
            const finalConfidence = item.cross_validated 
              ? Math.min(item.confidence + 0.1, 1.0) 
              : item.confidence;

            newKnowledge.push({
              org_id: orgId,
              user_id: userId,
              category: `${item.category}_unknown`,
              key: item.key,
              value: {
                content: item.value,
                source_url: item.source_url,
                source_type: item.source_type,
                date_published: item.date_published,
                cross_validated: item.cross_validated || false,
                validation_sources: item.validation_sources || [],
                auto_harvested: true,
                harvest_date: new Date().toISOString(),
                search_quality: searchResults.search_quality,
                last_verified: new Date().toISOString()
              },
              confidence_score: finalConfidence,
              source: `auto-harvest:${topic}`,
              last_used_at: new Date().toISOString()
            });
          }
        }
      }
    }

    console.log(`📚 Found ${newKnowledge.length} new knowledge items to store`);

    // Store new knowledge with UPSERT (insert new + update existing)
    let insertedCount = 0;
    let updatedCount = 0;
    if (newKnowledge.length > 0) {
      // First, get existing keys to track updates vs inserts
      const existingKeys = newKnowledge.map(item => item.key);
      const { data: existing } = await supabase
        .from('ai_knowledge_base')
        .select('key, usage_count')
        .in('key', existingKeys)
        .eq('org_id', orgId)
        .eq('user_id', userId);

      // Enrich with incremented usage_count for existing items
      const enrichedKnowledge = newKnowledge.map(item => {
        const existingItem = existing?.find(e => e.key === item.key);
        return {
          ...item,
          usage_count: existingItem ? (existingItem.usage_count || 0) + 1 : 1
        };
      });

      // UPSERT: Insert new items, update existing ones
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .upsert(enrichedKnowledge, {
          onConflict: 'user_id,org_id,category,key',
          ignoreDuplicates: false  // Update existing records
        })
        .select();

      if (error) {
        console.error('❌ Upsert error:', error);
      } else {
        // Calculate inserted vs updated
        const existingKeySet = new Set(existing?.map(e => e.key) || []);
        insertedCount = data?.filter(d => !existingKeySet.has(d.key)).length || 0;
        updatedCount = (data?.length || 0) - insertedCount;
        console.log(`✅ Stored: ${insertedCount} nieuwe items, ${updatedCount} updates`);
      }
    }

    // Calculate quality metrics
    const avgConfidence = newKnowledge.length > 0
      ? newKnowledge.reduce((sum, item) => sum + item.confidence_score, 0) / newKnowledge.length
      : 0;
    const crossValidatedCount = newKnowledge.filter(item => 
      item.value.cross_validated === true
    ).length;

    return new Response(JSON.stringify({
      success: true,
      topics_searched: topics.length,
      items_found: newKnowledge.length,
      items_stored: insertedCount + updatedCount,
      items_inserted: insertedCount,
      items_updated: updatedCount,
      avg_confidence: avgConfidence.toFixed(2),
      cross_validated_items: crossValidatedCount,
      quality_rate: `${((crossValidatedCount / Math.max(insertedCount + updatedCount, 1)) * 100).toFixed(1)}%`,
      warning: 'This function will be auto-disabled after October 6th'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Auto Knowledge Harvester error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});