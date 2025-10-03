import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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
    if (new Date() > CUTOFF_DATE) {
      console.log('⏰ Service stopped - cutoff date reached');
      return new Response(JSON.stringify({ 
        message: 'Free period ended' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const orgId = '550e8400-e29b-41d4-a716-446655440000';
    console.log(`👥 Professional Profile Enrichment starting for org: ${orgId}`);

    const { data: professionals } = await supabase
      .from('professionals')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'actief')
      .limit(50);

    if (!professionals || professionals.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No active professionals found',
        knowledge_added: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Enriching ${professionals.length} professional profiles...`);

    const systemPrompt = `Je bent een HR data-analist voor ABCzorg en CitoZorg. 

TAAK: Analyseer professional profielen en genereer bruikbare kennis-items voor matching en planning.

Voor elk profiel, extraheer:
1. Kerncompetenties en specialisaties
2. Beschikbaarheidspatronen en voorkeuren
3. Ervaring met specifieke cliëntgroepen
4. Certificeringen en kwalificaties
5. Tarief-gerelateerde informatie
6. Geografische voorkeuren en reisbereidheid
7. Werkvoorkeur (shifts, contracttype)
8. Sterke punten en verbeterpunten

OUTPUT FORMAT (JSON array):
[
  {
    "category": "professional_profiles",
    "key": "professional_[id]_[aspect]",
    "value": { "detailed": "object", "with": "structured data" },
    "confidence_score": 0.75-0.95,
    "source": "profile_enrichment"
  }
]

Genereer 30-50 knowledge items per professional.`;

    const knowledgeItems: any[] = [];
    
    for (const prof of professionals) {
      console.log(`🔍 Enriching: ${prof.full_name} (${prof.functie_niveau})`);

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { 
              role: 'user', 
              content: `Analyseer dit professional profiel:\n\n${JSON.stringify(prof, null, 2)}`
            }
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        console.error(`AI API error for ${prof.full_name}:`, response.status);
        continue;
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices[0].message.content;

      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const items = JSON.parse(jsonMatch[0]);
          knowledgeItems.push(...items.map((item: any) => ({
            ...item,
            org_id: orgId,
            user_id: orgId,
            professional_id: prof.id
          })));
        }
      } catch (e) {
        console.error('Failed to parse AI response:', e);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`📚 Total knowledge items extracted: ${knowledgeItems.length}`);

    let insertedCount = 0;
    for (let i = 0; i < knowledgeItems.length; i += 100) {
      const batch = knowledgeItems.slice(i, i + 100);
      
      const { data: inserted, error } = await supabase
        .from('ai_knowledge_base')
        .upsert(batch, { 
          onConflict: 'org_id,category,key',
          ignoreDuplicates: false 
        })
        .select();

      if (!error && inserted) {
        insertedCount += inserted.length;
      }
    }

    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: orgId,
      function_name: 'professional-enricher',
      success: true,
      execution_time_ms: Date.now(),
      model_used: 'google/gemini-2.5-flash',
      estimated_cost_eur: 0,
    });

    console.log(`✅ Stored ${insertedCount} professional knowledge items`);

    return new Response(JSON.stringify({
      success: true,
      professionals_analyzed: professionals.length,
      knowledge_items_generated: knowledgeItems.length,
      knowledge_items_stored: insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in professional-enricher:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
