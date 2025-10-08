import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { trigger, org_id, batch_size = 500 } = await req.json();
    
    console.log(`🎯 Meta-Orchestrator gestart: trigger=${trigger}, org_id=${org_id}`);

    // Haal of maak orchestrator state
    let { data: state } = await supabase
      .from('orchestrator_state')
      .select('*')
      .eq('org_id', org_id)
      .single();

    if (!state) {
      const { data: newState } = await supabase
        .from('orchestrator_state')
        .insert({ org_id, status: 'initializing' })
        .select()
        .single();
      state = newState;
    }

    // Update status naar running
    await supabase
      .from('orchestrator_state')
      .update({ 
        status: 'running', 
        last_run_at: new Date().toISOString(),
        error_message: null 
      })
      .eq('id', state.id);

    // STAP 1: Haal ALLE knowledge base items op (geen limit!)
    const { data: allItems, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('id, category, key, value, confidence_score, usage_count, created_at')
      .eq('org_id', org_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    console.log(`📊 Verwerk ${allItems?.length || 0} items in batches van ${batch_size}`);

    if (!allItems || allItems.length === 0) {
      await supabase
        .from('orchestrator_state')
        .update({ status: 'idle', total_items_processed: 0 })
        .eq('id', state.id);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Geen items om te verwerken',
          items_processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STAP 2: Batch processing
    const batches = [];
    for (let i = 0; i < allItems.length; i += batch_size) {
      batches.push(allItems.slice(i, i + batch_size));
    }

    let totalCategoriesCreated = 0;
    let totalItemsUpdated = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 Batch ${batchIndex + 1}/${batches.length}: ${batch.length} items`);

      // Update orchestrator state
      await supabase
        .from('orchestrator_state')
        .update({ current_batch: batchIndex + 1 })
        .eq('id', state.id);

      // STAP 3: AI Categorisering
      const categoriesPrompt = `
Analyseer deze ${batch.length} kennisbank items en detecteer semantische clusters.
Maak automatisch nieuwe categorieën met beschrijvende namen en keywords.

**REGELS:**
- Groepeer items met vergelijkbare onderwerpen
- Maak categorieën zoals "client_kwintes", "hr_verlof_2024", "zzp_compliance"
- Maximaal 20 categorieën per batch
- Genereer 3-7 keywords per categorie
- Geef elke categorie een confidence score (0-1)

**INPUT ITEMS:**
${batch.map((item, idx) => `${idx + 1}. [${item.category}] ${item.key}: ${JSON.stringify(item.value).substring(0, 200)}...`).join('\n')}

**OUTPUT (JSON):**
{
  "categories": [
    {
      "name": "category_name",
      "description": "beschrijving",
      "keywords": ["keyword1", "keyword2"],
      "confidence_score": 0.85,
      "item_ids": ["uuid1", "uuid2"]
    }
  ]
}
`;

      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'Je bent een expert in kennisbank organisatie. Analyseer items en maak slimme categorieën.' },
              { role: 'user', content: categoriesPrompt }
            ],
            temperature: 0.3,
          }),
        });

        if (!aiResponse.ok) {
          console.error(`❌ AI API error: ${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const aiContent = aiData.choices[0].message.content;
        
        // Probeer JSON te parsen (extract van markdown code block indien nodig)
        let categoriesData;
        try {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          categoriesData = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
        } catch (parseError) {
          console.error(`❌ JSON parse error:`, parseError);
          continue;
        }

        // STAP 4: Maak categorieën aan in database
        for (const cat of categoriesData.categories || []) {
          const { data: existingCat } = await supabase
            .from('ai_categories')
            .select('id')
            .eq('org_id', org_id)
            .eq('name', cat.name)
            .maybeSingle();

          if (!existingCat) {
            const { error: insertError } = await supabase
              .from('ai_categories')
              .insert({
                org_id,
                name: cat.name,
                description: cat.description,
                keywords: cat.keywords,
                confidence_score: cat.confidence_score,
                item_count: cat.item_ids?.length || 0,
                auto_generated: true,
              });

            if (!insertError) {
              totalCategoriesCreated++;
              console.log(`✅ Categorie gemaakt: ${cat.name} (${cat.item_ids?.length} items)`);
            }
          } else {
            // Update item_count
            await supabase
              .from('ai_categories')
              .update({ 
                item_count: cat.item_ids?.length || 0,
                updated_at: new Date().toISOString() 
              })
              .eq('id', existingCat.id);
          }
        }

        totalItemsUpdated += batch.length;

      } catch (error) {
        console.error(`❌ Batch ${batchIndex + 1} error:`, error);
        continue;
      }
    }

    // STAP 5: Update finale state
    await supabase
      .from('orchestrator_state')
      .update({
        status: 'idle',
        total_items_processed: totalItemsUpdated,
        categories_created: totalCategoriesCreated,
        current_batch: 0,
        metadata: {
          last_run: new Date().toISOString(),
          batches_processed: batches.length,
        }
      })
      .eq('id', state.id);

    console.log(`✅ Meta-Orchestrator voltooid: ${totalItemsUpdated} items, ${totalCategoriesCreated} categorieën`);

    return new Response(
      JSON.stringify({
        success: true,
        items_processed: totalItemsUpdated,
        categories_created: totalCategoriesCreated,
        batches_processed: batches.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Meta-Orchestrator error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
