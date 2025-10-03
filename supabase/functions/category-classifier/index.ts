import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    console.log('🔄 Category Classifier processing unknown categories...');

    // Get all items with _unknown suffix
    const { data: unknownItems } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .or('category.ilike.%_unknown')
      .limit(100);

    if (!unknownItems || unknownItems.length === 0) {
      console.log('✅ No unknown items to classify');
      return new Response(JSON.stringify({ 
        success: true, 
        items_classified: 0,
        message: 'No unknown categories found'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Found ${unknownItems.length} items to reclassify`);
    let reclassifiedCount = 0;

    // Process in batches of 10
    for (let i = 0; i < unknownItems.length; i += 10) {
      const batch = unknownItems.slice(i, Math.min(i + 10, unknownItems.length));
      
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
              role: 'system',
              content: `Je bent een categorisatie expert. Classificeer knowledge items in de juiste categorie.

Beschikbare categorieën:
- compliance: IGJ toezicht, HKZ, ISO, kwaliteitsindicatoren, audits
- wetgeving: Wlz, WMO, Wtza, Wkkgz, AVG, ZVW
- cao: CAO VVT, CAO GGZ, salarisschalen, arbeidsvoorwaarden, toeslagen
- tarieven: NZa tarieven, DBC codes, ZZP tarieven, uurtarieven, winstmarges
- zzp_vereisten: VOG, BIG, KVK, BTW, DBA, modelcontracten
- registraties: BIG-registratie, LRZa, kwaliteitsregisters
- bedrijfsgegevens: organisatiestructuur, procedures, beleid
- verzekeringen: zorgverzekeraars, contracten, declaraties

Analyseer elke item en bepaal de beste categorie.

Output ALLEEN valid JSON array:
[
  {
    "id": "item_uuid",
    "new_category": "categorie_naam",
    "confidence": 0.0-1.0,
    "reason": "korte verklaring"
  }
]`
            },
            {
              role: 'user',
              content: `Classificeer deze items:\n\n${JSON.stringify(batch.map(item => ({
                id: item.id,
                current_category: item.category,
                key: item.key,
                value: typeof item.value === 'object' ? item.value.content || JSON.stringify(item.value) : item.value
              })), null, 2)}`
            }
          ],
        }),
      });

      if (!aiResponse.ok) {
        console.error('AI classification failed for batch');
        continue;
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices[0].message.content;

      let classifications;
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        classifications = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        console.error('Failed to parse classification results');
        continue;
      }

      // Apply classifications with high confidence
      for (const classification of classifications) {
        if (classification.confidence >= 0.8) {
          const { error } = await supabase
            .from('ai_knowledge_base')
            .update({
              category: classification.new_category,
              confidence_score: Math.max(
                unknownItems.find(i => i.id === classification.id)?.confidence_score || 0.5,
                classification.confidence
              ),
              needs_review: classification.confidence < 0.95
            })
            .eq('id', classification.id);

          if (!error) {
            reclassifiedCount++;
            console.log(`✅ Reclassified ${classification.id}: ${classification.new_category} (${(classification.confidence * 100).toFixed(0)}%)`);
          }
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log business intelligence
    if (reclassifiedCount > 0) {
      await supabase.from('business_intelligence').insert({
        org_id: orgId,
        intelligence_type: 'data_quality',
        priority: 'low',
        title: 'Knowledge categorieën verbeterd',
        description: `${reclassifiedCount} items succesvol gerecategoriseerd van _unknown naar correcte categorieën`,
        data: {
          items_processed: unknownItems.length,
          items_reclassified: reclassifiedCount,
          improvement_rate: `${((reclassifiedCount / unknownItems.length) * 100).toFixed(1)}%`
        },
        impact_score: 0.4
      });
    }

    console.log(`✅ Category classification complete: ${reclassifiedCount}/${unknownItems.length} items reclassified`);

    return new Response(JSON.stringify({
      success: true,
      items_processed: unknownItems.length,
      items_classified: reclassifiedCount,
      classification_rate: `${((reclassifiedCount / unknownItems.length) * 100).toFixed(1)}%`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Category Classifier error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
