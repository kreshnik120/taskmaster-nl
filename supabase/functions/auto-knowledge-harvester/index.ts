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

    // Token tracking for all AI calls
    const startTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokensUsed = 0;

    const { search_topics } = await req.json();

    console.log('🌐 Auto Knowledge Harvester starting search...');

    // ULTRA TOPICS: ABCzorg/CitoZorg specifiek + Maximale data kwaliteit
    const defaultTopics = [
      // ABCzorg/CitoZorg Specifieke Topics (50+)
      'ABCzorg organisatiestructuur en compliance 2025',
      'CitoZorg operationele procedures en werkwijzen',
      'ABCzorg WMO contracten per gemeente',
      'CitoZorg Wlz zorgzwaartepakketten VV4-VV7',
      'ABCzorg tariefstructuur en DBC codes',
      'CitoZorg HR beleid duurzame inzetbaarheid',
      'ABCzorg professional pool samenstelling',
      'CitoZorg verzuimprotocol en re-integratie',
      'ABCzorg kwaliteitsindicatoren HKZ/ISO',
      'CitoZorg client portfolio en zorgplannen',
      'ABCzorg flexpool management strategie',
      'CitoZorg roostering en shift planning',
      'ABCzorg client tevredenheid metrics',
      'CitoZorg professioneel ontwikkeling trajecten',
      'ABCzorg compliance monitoring procedures',
      'CitoZorg medicatieveiligheid protocollen',
      'ABCzorg dossiervoering requirements',
      'CitoZorg BIG-registratie verificatie',
      'ABCzorg capacity planning forecasts',
      'CitoZorg professional satisfaction scores',
      
      // CAO & Arbeidsvoorwaarden (Relevant voor ABCzorg/CitoZorg)
      'CAO VVT wijzigingen 2025 voor ABCzorg',
      'CAO GGZ updates 2025 CitoZorg',
      'Eindejaarsuitkering zorg ABCzorg 2025',
      'Vakantietoeslag regelgeving CitoZorg',
      'Pensioenregeling zorg PFZW ABCzorg',
      'Onregelmatigheidstoeslag (ORT) tarieven CitoZorg',
      'Overwerk compensatie ABCzorg praktijk',
      'Bereikbaarheidsdienst vergoeding CitoZorg',
      
      // ZZP & DBA (Specifiek voor ABCzorg/CitoZorg context)
      'ZZP wetgeving Nederland 2025 ABCzorg',
      'Wet DBA handhaving 2025 CitoZorg',
      'ZZP opdrachtgeversverklaring eisen ABCzorg',
      'Modelovereenkomst ZZP zorg CitoZorg',
      'Tarievenafspraken ZZP zorg ABCzorg',
      
      // Registraties & Kwalificaties
      'BIG-registratie nieuwe eisen 2025 ABCzorg',
      'LRZa registratie verplichtingen CitoZorg',
      'Kwaliteitsregister Verpleegkundigen ABCzorg',
      'VOG aanvraag procedure CitoZorg',
      'Herregistratie BIG verplichtingen ABCzorg',
      
      // Wetgeving & Compliance (ABCzorg/CitoZorg relevant)
      'Wtza vergunningplicht ABCzorg',
      'Wkkgz meldplicht incidenten CitoZorg',
      'AVG privacy zorg ABCzorg implementatie',
      'Zorgverzekeringswet Zvw updates ABCzorg',
      'Wet langdurige zorg Wlz wijzigingen CitoZorg',
      'WMO 2015 nieuwe regels ABCzorg',
      'IGJ toezicht nieuwe eisen CitoZorg',
      
      // Tarieven & Financiën (ABCzorg/CitoZorg)
      'Zorgtarieven NZa 2025 ABCzorg',
      'ZZP tariefadvies 2025 CitoZorg',
      'Wmo tarief per uur ABCzorg',
      'Zorgzwaartepakketten ZZP tarieven CitoZorg',
      'Uurtarief Wlz 2025 ABCzorg',
      
      // Planning & Matching Intelligence
      'Shift optimalisatie algoritmes ABCzorg',
      'Reistijd berekening tussen opdrachten CitoZorg',
      'Capacity planning uitzendkrachten ABCzorg',
      'Rustperiode compliance CAO CitoZorg',
      'Professional-client match success ABCzorg',
      'Skill matching algoritmes CitoZorg',
      'Client preference patterns ABCzorg',
      'Assignment duration optimization CitoZorg',
      
      // Workforce Optimization
      'ZZP vs loondienst cost comparison ABCzorg',
      'Flexible staffing strategy CitoZorg',
      'Professional utilization rates ABCzorg',
      'Training investment optimization CitoZorg',
      'Professional retention strategies ABCzorg',
      'Churn prediction models CitoZorg'
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

TIER 1 BRONNEN (confidence 0.9-1.0) - ALLEEN DEZE ACCEPTEREN:
- overheid.nl, rijksoverheid.nl, belastingdienst.nl
- nza.nl (Nederlandse Zorgautoriteit)
- igj.nl (Inspectie Gezondheidszorg en Jeugd)
- officiële CAO websites (caovvt.nl)
- bigregister.nl (BIG-registratie)
- duo.nl (Overheid diploma's)

TIER 2 BRONNEN (confidence 0.7-0.9) - ALLEEN MET CROSS-VALIDATIE:
- actiz.nl, btsg.nl, ggznederland.nl (brancheorganisaties)
- nivel.nl (Nederlands instituut voor onderzoek)
- vilans.nl (kenniscentrum langdurige zorg)
- vgn.nl (Vereniging Gehandicaptenzorg)
- MOET cross-validated zijn door TIER 1 bron

TIER 3 BRONNEN: NIET MEER ACCEPTEREN

SPECIFIEK VOOR ABCZORG/CITOZORG:
- Focus op organisatie-specifieke compliance, procedures, tarieven
- Valideer alle data met officiële bronnen
- Cross-validatie VERPLICHT voor TIER 2

Voor het gegeven onderwerp:
1. Zoek ALLEEN in TIER 1 + TIER 2 bronnen
2. TIER 2 informatie MOET cross-validated zijn
3. Extraheer concrete feiten, cijfers, datums
4. Geef confidence score gebaseerd op:
   - Tier van de bron (TIER 1 = 0.9-1.0, TIER 2 = 0.7-0.9)
   - Actualiteit (2024-2025 = +0.1, 2023 = +0.0, ouder = -0.2)
   - Cross-validatie (VERPLICHT voor TIER 2 = +0.1)
5. Focus op ABCzorg/CitoZorg relevantie

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
        }),
      });

      if (!searchResponse.ok) {
        if (searchResponse.status === 429) {
          console.error(`⚠️ Rate limit exceeded for topic: ${topic}`);
          return new Response(JSON.stringify({ 
            error: 'Rate limits exceeded', 
            message: 'Please try again later or reduce request frequency.' 
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (searchResponse.status === 402) {
          console.error(`💳 Credits exhausted for topic: ${topic}`);
          return new Response(JSON.stringify({ 
            error: 'Credits exhausted', 
            message: 'Please add funds to your Lovable AI workspace to continue.' 
          }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.error(`Search failed for topic: ${topic}`);
        continue;
      }

      const searchData = await searchResponse.json();
      
      // Extract and accumulate token usage
      if (searchData.usage) {
        totalInputTokens += searchData.usage.prompt_tokens || 0;
        totalOutputTokens += searchData.usage.completion_tokens || 0;
        totalTokensUsed += searchData.usage.total_tokens || 0;
      }
      
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
          // QUALITY MODE: Increased threshold to 0.7, TIER 1+2 only
          // Reject TIER 3 sources
          if (item.source_type?.includes('tier3')) {
            console.log(`❌ Rejected TIER 3 source: ${item.key}`);
            continue;
          }
          
          // TIER 2 must be cross-validated
          if (item.source_type?.includes('tier2') && !item.cross_validated) {
            console.log(`❌ Rejected uncross-validated TIER 2: ${item.key}`);
            continue;
          }
          
          if (item.confidence >= 0.7) {
            // Boost confidence if cross-validated
            const finalConfidence = item.cross_validated 
              ? Math.min(item.confidence + 0.1, 1.0) 
              : item.confidence;

            // Category normalization (remove _unknown suffix)
            const categoryMap: Record<string, string> = {
              'cao_unknown': 'cao',
              'wetgeving_unknown': 'wetgeving',
              'compliance_unknown': 'compliance',
              'tarieven_unknown': 'tarieven',
              'zzp_unknown': 'zzp_vereisten',
              'registraties_unknown': 'registraties',
              'verzekeringen_unknown': 'verzekeringen'
            };
            
            const normalizedCategory = categoryMap[item.category] || item.category.replace('_unknown', '');

            newKnowledge.push({
              org_id: orgId,
              user_id: userId,
              category: normalizedCategory,
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
            
            // Extract client from key/value for tagging
            const keyLower = item.key.toLowerCase();
            const valueLower = JSON.stringify(item.value).toLowerCase();
            let clientId = null;
            
            // Check for client keywords
            const clientMap: Record<string, string> = {
              'lunet': 'lunet',
              'prisma': 'prisma',
              'swz': 'swz',
              'stichting swz': 'swz',
              'citozorg': 'citozorg',
              'abczorg': 'abczorg',
              'evb': 'evb'
            };
            
            for (const [keyword, clientName] of Object.entries(clientMap)) {
              if (keyLower.includes(keyword) || valueLower.includes(keyword)) {
                // Try to find client_id
                clientId = clientName; // Will be resolved in a separate query
                break;
              }
            }
            
            return {
              ...item,
              usage_count: existingItem ? (existingItem.usage_count || 0) + 1 : 1,
              client_keyword: clientId // Temporary field for resolution
            };
          });

          // Resolve client_keywords to client_ids
          const clientKeywords = [...new Set(enrichedKnowledge.map(item => item.client_keyword).filter(Boolean))];
          const clientIdMap: Record<string, string> = {};
          
          if (clientKeywords.length > 0) {
            for (const keyword of clientKeywords) {
              if (!keyword) continue; // Skip null/undefined
              
              const { data: client } = await supabase
                .from('clients')
                .select('id, name')
                .eq('org_id', orgId)
                .ilike('name', `%${keyword}%`)
                .single();
              
              if (client) {
                clientIdMap[keyword] = client.id;
              }
            }
          }

          // Map client_keyword to client_id
          const finalKnowledge = enrichedKnowledge.map(item => {
            const { client_keyword, ...rest } = item;
            return {
              ...rest,
              client_id: client_keyword ? (clientIdMap[client_keyword] || null) : null
            };
          });

          // UPSERT: Insert new items, update existing ones
          const { data, error } = await supabase
            .from('ai_knowledge_base')
            .upsert(finalKnowledge, {
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

    // Log function execution metrics
    const endTime = Date.now();
    const executionTimeMs = endTime - startTime;

    await supabase
      .from('function_call_logs')
      .insert({
        function_name: 'auto-knowledge-harvester',
        org_id: orgId,
        user_id: userId,
        status: 'completed',
        execution_time_ms: executionTimeMs,
        model_used: 'google/gemini-2.5-pro',
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalTokensUsed,
        estimated_cost_eur: 0, // Free during promo period
        parameters_used: {
          topics_count: topics.length,
          items_found: newKnowledge.length,
          items_stored: insertedCount + updatedCount
        }
      });

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