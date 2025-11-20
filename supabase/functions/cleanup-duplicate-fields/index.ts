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
    
    if (typeof value !== 'object' || value === null) {
      continue;
    }

    let needsCleanup = false;
    let cleanedValue = { ...value };
    const issues: string[] = [];
    const before = { ...value };

    // CHECK 1: Metadata velden in value (horen niet in value column)
    const prohibitedFields = ['category', 'key', 'confidence', 'role_tags', 'source_type', 'org_id', 'client_id'];
    const foundProhibited = prohibitedFields.filter(field => cleanedValue[field] !== undefined);
    
    if (foundProhibited.length > 0) {
      needsCleanup = true;
      issues.push(`metadata_fields: ${foundProhibited.join(', ')}`);
      foundProhibited.forEach(field => delete cleanedValue[field]);
    }

    // CHECK 2: Nested value.value structure (double nesting)
    if (cleanedValue.value && typeof cleanedValue.value === 'object') {
      // Check of de nested value ook daadwerkelijk content heeft
      const nestedKeys = Object.keys(cleanedValue.value);
      if (nestedKeys.length > 0) {
        needsCleanup = true;
        issues.push('nested_value_structure');
        cleanedValue = cleanedValue.value;
      }
    }

    // CHECK 3: Duplicate fields (existing logic - na flattening)
    if (cleanedValue.value && typeof cleanedValue.value === 'object') {
      const topLevelKeys = Object.keys(cleanedValue);
      const nestedKeys = Object.keys(cleanedValue.value);
      const duplicateFields = topLevelKeys.filter(key => 
        key !== 'value' && nestedKeys.includes(key)
      );
      
      if (duplicateFields.length > 0) {
        needsCleanup = true;
        issues.push(`duplicate_fields: ${duplicateFields.join(', ')}`);
        duplicateFields.forEach(field => delete cleanedValue[field]);
      }
    }

    if (!needsCleanup) {
      continue;
    }

    console.log(`[cleanup-duplicate-fields] Fixing ${item.key}: ${issues.join(' | ')}`);
    const after = cleanedValue;

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
        duplicateFields: issues,
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
        duplicateFields: issues,
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
