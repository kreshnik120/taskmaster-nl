import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  itemId: string;
  key: string;
  duplicateFields: string[];
  before: any;
  after: any;
  fixed: boolean;
  error?: string;
}

/**
 * Edge function om duplicate fields in ai_knowledge_base te detecteren en op te schonen
 * 
 * Detecteert situaties waar hetzelfde veld op meerdere niveaus voorkomt:
 * - Top-level: { opmerkingen: "...", value: { opmerkingen: "..." } }
 * - Oplossing: verwijder top-level duplicaten, behoud alleen nested versie
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verificatie
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Haal alle knowledge items op (alleen niet-verwijderde)
    const { data: knowledgeItems, error: fetchError } = await supabaseClient
      .from('ai_knowledge_base')
      .select('id, key, value, category')
      .is('deleted_at', null);

    if (fetchError) {
      console.error('[cleanup-duplicate-fields] Error fetching knowledge items:', fetchError);
      throw fetchError;
    }

    console.log(`[cleanup-duplicate-fields] Analyzing ${knowledgeItems?.length || 0} knowledge items...`);

    const results: CleanupResult[] = [];
    let fixedCount = 0;

    // Analyseer elk item
    for (const item of knowledgeItems || []) {
      const value = item.value;
      
      // Check of het een object is met een nested 'value' property
      if (typeof value !== 'object' || value === null || !value.value || typeof value.value !== 'object') {
        continue;
      }

      const topLevelKeys = Object.keys(value);
      const nestedKeys = Object.keys(value.value);
      const duplicateFields: string[] = [];

      // Detecteer duplicaten
      for (const key of topLevelKeys) {
        if (key !== 'value' && nestedKeys.includes(key)) {
          duplicateFields.push(key);
        }
      }

      if (duplicateFields.length === 0) {
        continue;
      }

      console.log(`[cleanup-duplicate-fields] Found duplicates in ${item.key}:`, duplicateFields);

      const before = { ...value };
      const after = { ...value };

      // Verwijder top-level duplicaten
      for (const field of duplicateFields) {
        delete after[field];
      }

      // Update het item in de database
      const { error: updateError } = await supabaseClient
        .from('ai_knowledge_base')
        .update({
          value: after,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (updateError) {
        console.error(`[cleanup-duplicate-fields] Error updating ${item.key}:`, updateError);
        results.push({
          itemId: item.id,
          key: item.key,
          duplicateFields,
          before,
          after,
          fixed: false,
          error: updateError.message,
        });
      } else {
        console.log(`[cleanup-duplicate-fields] Fixed ${item.key}`);
        fixedCount++;
        results.push({
          itemId: item.id,
          key: item.key,
          duplicateFields,
          before,
          after,
          fixed: true,
        });
      }
    }

    console.log(`[cleanup-duplicate-fields] Cleanup complete. Fixed ${fixedCount} out of ${results.length} items with duplicates.`);

    return new Response(
      JSON.stringify({
        success: true,
        totalAnalyzed: knowledgeItems?.length || 0,
        itemsWithDuplicates: results.length,
        itemsFixed: fixedCount,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[cleanup-duplicate-fields] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
