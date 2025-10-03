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

    const { search_topics } = await req.json();

    console.log('🌐 Auto Knowledge Harvester starting search...');

    const defaultTopics = [
      'CAO VVT wijzigingen 2025',
      'ZZP wetgeving update Nederland 2025',
      'BIG-registratie nieuwe eisen',
      'Zorgtarieven 2025',
      'Wet DBA update'
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
              content: `Je bent een research assistant die actuele informatie zoekt en valideert.

Voor het gegeven onderwerp:
1. Zoek naar actuele, betrouwbare informatie
2. Valideer de bronnen (officiële overheid, brancheorganisaties)
3. Extraheer concrete feiten en cijfers
4. Geef confidence score (0.0-1.0) op basis van betrouwbaarheid bron

Output ALLEEN valid JSON:
{
  "found_information": true/false,
  "items": [
    {
      "category": "compliance/tarieven/cao/etc",
      "key": "short_descriptive_key",
      "value": "detailed_information",
      "confidence": 0.0-1.0,
      "source_url": "url",
      "source_type": "officieel/branche/news",
      "date_published": "YYYY-MM-DD"
    }
  ],
  "search_quality": "excellent/good/poor"
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
          // Only store high-quality information from reliable sources
          if (item.confidence >= 0.7 && ['officieel', 'branche'].includes(item.source_type)) {
            newKnowledge.push({
              org_id: userOrg.org_id,
              user_id: user.id,
              category: `${item.category}_unknown`,
              key: item.key,
              value: {
                content: item.value,
                source_url: item.source_url,
                source_type: item.source_type,
                date_published: item.date_published,
                auto_harvested: true,
                harvest_date: new Date().toISOString()
              },
              confidence_score: item.confidence,
              source: `auto-harvest:${topic}`
            });
          }
        }
      }
    }

    console.log(`📚 Found ${newKnowledge.length} new knowledge items to store`);

    // Store new knowledge
    let insertedCount = 0;
    if (newKnowledge.length > 0) {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .insert(newKnowledge)
        .select();

      if (error) {
        console.error('Insert error:', error);
      } else {
        insertedCount = data?.length || 0;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      topics_searched: topics.length,
      items_found: newKnowledge.length,
      items_stored: insertedCount,
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