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
    const startTime = Date.now();
    if (new Date() > CUTOFF_DATE) {
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
    console.log(`⚖️ Compliance Rule Extraction for org: ${orgId}`);

    const complianceTopics = [
      'CAO VVT regels en verplichtingen',
      'CAO GGZ arbeidsvoorwaarden',
      'CAO Sociaal Werk richtlijnen',
      'Arbeidstijdenwet en rusttijden',
      'WTZi kwaliteitseisen',
      'BIG-registratie en bevoegdheden',
      'AVG en privacy in de zorg',
      'Kwaliteitskader Verpleeghuiszorg',
      'Veilige medicatietoediening',
      'Hygiëne protocollen en richtlijnen',
      'Incident melding procedures',
      'VOG vereisten en screening'
    ];

    const systemPrompt = `Je bent een compliance specialist voor Nederlandse zorginstellingen (ABCzorg en CitoZorg).

TAAK: Extraheer concrete, toepasbare compliance regels en checks uit Nederlandse zorgwetgeving.

Voor elk onderwerp, genereer:
1. Concrete regels en vereisten
2. Waarom het belangrijk is (risico's)
3. Hoe te controleren (checks)
4. Wat te doen bij overtreding
5. Uitzonderingen en bijzonderheden
6. Praktische voorbeelden

OUTPUT FORMAT (JSON array):
[
  {
    "category": "compliance_rules",
    "key": "compliance_[onderwerp]_[aspect]",
    "value": { 
      "rule": "concrete regel",
      "rationale": "waarom",
      "check": "hoe controleren",
      "action": "wat bij overtreding",
      "examples": ["voorbeeld 1", "voorbeeld 2"]
    },
    "confidence_score": 0.85-0.95,
    "source": "compliance_extraction"
  }
]

Genereer 10-15 regels per onderwerp. Focus op PRAKTISCHE toepassing.`;

    const knowledgeItems: any[] = [];
    
    for (const topic of complianceTopics) {
      console.log(`🔍 Extracting rules for: ${topic}`);

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
              content: `Extraheer compliance regels voor: "${topic}"\n\nFocus op Nederlandse zorgwetgeving 2025, CAO's, en best practices.`
            }
          ],
          temperature: 0.6,
        }),
      });

      if (!response.ok) {
        console.error(`AI API error for ${topic}:`, response.status);
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
            topic: topic
          })));
        }
      } catch (e) {
        console.error('Failed to parse AI response:', e);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`📚 Total compliance rules extracted: ${knowledgeItems.length}`);

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
      function_name: 'compliance-extractor',
      success: true,
      execution_time_ms: Math.floor(Date.now() - startTime),
      model_used: 'google/gemini-2.5-flash',
      estimated_cost_eur: 0,
    });

    console.log(`✅ Stored ${insertedCount} compliance rules`);

    return new Response(JSON.stringify({
      success: true,
      topics_analyzed: complianceTopics.length,
      knowledge_items_generated: knowledgeItems.length,
      knowledge_items_stored: insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in compliance-extractor:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
