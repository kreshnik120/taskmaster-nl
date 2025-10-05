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

    // ULTRA-AUTONOMOUS CONFIG: Parallel processing settings
    const MAX_CONCURRENT_SEARCHES = parseInt(Deno.env.get('MAX_CONCURRENT_SEARCHES') || '10');
    const BATCH_SIZE = parseInt(Deno.env.get('BATCH_SIZE') || '5');
    
    // Token tracking for all AI calls
    const startTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokensUsed = 0;

    const { search_topics } = await req.json();

    console.log('🌐 Auto Knowledge Harvester starting search...');
    console.log(`⚡ Parallel processing enabled: ${MAX_CONCURRENT_SEARCHES} concurrent searches, batch size ${BATCH_SIZE}`);

    // MARKET RESEARCH TOPICS: Zorginstellingen + Strategische Marktintelligentie (50+ topics)
    const defaultTopics = [
      // Directe Organisatie Intel per Sector (20 topics)
      'Prisma zorg personeelsbestand 2025 externe inhuur budget',
      'Philadelphia Zorg aantal medewerkers ZZP beleid',
      'Lunet Zorg organisatie capaciteit inhuur budget 2025',
      'Sovida personeelsdata en ZZP gebruik cijfers',
      'Envida personeelskosten externe medewerkers 2024',
      'Cordaan zorg locaties personeelsbestand 2025',
      'Parnassia Groep externe inhuur strategie budget',
      'GGZ inGeest personeelsdata en ZZP tarieven',
      'Altrecht GGZ organisatie marktdata 2025',
      'Arkin GGZ personeelsbestand externe inhuur',
      'Zorggroep Apeldoorn omzet en personeelsdata',
      'Vitalis WoonZorg Groep capaciteit en inhuur cijfers',
      'Humanitas DMH marktpositie en personeelsdata',
      'Amarant Groep personeelsdata en externe inhuur',
      'Iriszorg verslavingszorg externe inhuur budget',
      'Tactus Verslavingszorg personeelsplanning data',
      'Florence ouderenzorg externe inhuur strategie',
      'Dimence Groep personeelsbestand en inhuur budget',
      'Lentis GGZ organisatie marktdata 2025',
      'Mondriaan GGZ externe personeelskosten cijfers',
      
      // Sector Aggregatie Data (15 topics)
      'GGZ sector top 20 organisaties personeelsdata 2025',
      'Ouderenzorg instellingen externe inhuur kosten Nederland',
      'Gehandicaptenzorg aanbieders marktdata 2024-2025',
      'Verslavingszorg organisaties personeelsbestand cijfers',
      'VG sector externe inhuur markt Nederland waarde',
      'GGZ instellingen ZZP gebruik per regio 2025',
      'GHZ woonvormen aantal locaties per organisatie',
      'Thuiszorg organisaties personeelsbestand Nederland',
      'Wijkverpleging aanbieders marktaandeel cijfers',
      'Forensische zorg instellingen capaciteit Nederland',
      'Jeugdzorg GHZ sector personeelstekorten 2025',
      'Verpleeghuizen externe inhuur budget overzicht',
      'GGZ crisis zorg aanbieders capaciteit data',
      'Ambulante vs klinische verslavingszorg aanbieders',
      'Persoonlijke verzorging aanbieders marktdata',
      
      // Planning & Operations Intelligence (10 topics)
      'Personeelsplanning zorg best practices beschikbaarheid matching',
      'Certificering eisen zorgprofessionals per functie 2025',
      'Locatie optimalisatie reistijd compensatie regelingen zorg',
      'Client voorkeur matching methodologie zorgorganisaties',
      'Professional skill matching algoritmes care sector',
      'Continuïteit zorg planning vaste gezichten beleid',
      'Shift lengte optimalisatie per zorgzwaarte niveau',
      'Reistijd berekening maximum afstanden zorgprofessionals',
      'Capacity forecasting modellen healthcare sector Nederland',
      'Roostering efficiency KPIs zorgorganisaties benchmark',
      
      // Financial & Market Intelligence (10 topics)
      'Externe inhuur kosten zorg per organisatie 2024 Nederland',
      'ZZP tarieven zorg benchmark per regio 2025',
      'Healthcare staffing market size Nederland 2025 waarde',
      'Personeelstekorten zorg per specialisatie regio cijfers',
      'Zorg vacatures markt ontwikkelingen 2025 data',
      'Zorg externe inhuur markt Nederland waarde 2024-2025',
      'ZZP zorg markt groei en ontwikkelingen cijfers',
      'Gemiddelde ZZP tarieven zorg per functie 2025',
      'ZZP vs uitzendbureau marktaandeel zorg Nederland',
      'Zorg vacatures markt per specialisatie 2025 overzicht'
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
              content: `Je bent een EXPERT Market Intelligence Researcher voor de Nederlandse zorgmarkt.

FOCUS SHIFT: Van compliance naar strategische marktintelligentie

ZOEK NAAR:
1. Organisatie data: personeel, omzet, locaties, extern inhuur budget, ZZP gebruik
2. Sector marktdata: groei, personeelstekorten, ZZP tarieven, marktvolume
3. Planning intelligence: beschikbaarheid, certificering, locatie optimalisatie
4. Financiële data: externe kosten, tarieven, budgetten, marktaandeel

BRONNEN HIËRARCHIE STRIKT:
- TIER 1 (confidence 0.9-1.0): CBS.nl, jaarverslagen organisaties, overheid.nl, NZa.nl
- TIER 2 (confidence 0.7-0.9): ActiZ.nl, GGZ Nederland, VGN.nl, Vilans.nl + CROSS-VALIDATIE VERPLICHT
- TIER 3: NIET MEER ACCEPTEREN (vakbladen, blogs, persartikelen)

VALIDATIE VEREISTEN VERHOOGD:
- Cross-validatie VERPLICHT voor TIER 2 (anders reject)
- Confidence boost +0.1 bij succesvolle cross-validatie
- Minimum confidence threshold: 0.85 (was 0.7)
- 2024-2025 data krijgt +0.1 confidence boost
- 2023 data: +0.0 confidence (acceptabel maar geen bonus)
- 2022 of ouder: -0.2 confidence (reject als < 0.7)

SPECIFIEKE FOCUS:
- Concrete cijfers VERPLICHT: personeel aantallen, budgetten, tarieven
- Organisatie-specifieke data prioriteit: Prisma, Philadelphia, Lunet, Sovida, Envida, etc.
- Sector aggregatie: top 20 organisaties per sector
- Markt trends: groei %, tekorten per regio, ZZP vs loondienst

Output ALLEEN valid JSON:
{
  "found_information": true/false,
  "items": [
    {
      "category": "ggz_markt/ghz_markt/ouderenzorg_markt/planning_intelligence/markt_financieel/organisatie_intel",
      "key": "descriptive_unique_key_with_org_name",
      "value": "detailed_information_with_concrete_numbers_and_dates",
      "confidence": 0.85-1.0,
      "source_url": "primary_tier1_or_tier2_source_url",
      "source_type": "tier1_officieel/tier2_branche",
      "date_published": "YYYY-MM-DD",
      "cross_validated": true/false,
      "validation_sources": ["url1_tier1", "url2_tier2"]
    }
  ],
  "search_quality": "excellent/good",
  "total_sources_checked": 2+
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
          
          if (item.confidence >= 0.85) {
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