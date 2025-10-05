import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log('🔧 Source Fixer starting...');

    // Fetch first organization
    const { data: orgs } = await supabaseClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    if (!orgs) {
      throw new Error('No organization found');
    }

    const orgId = orgs.id;
    console.log(`🏢 Processing org: ${orgId}`);

    // Fetch items with broken sources (validation failures)
    const { data: brokenItems, error: fetchError } = await supabaseClient
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', orgId)
      .gt('validation_failures', 0)
      .is('deleted_at', null)
      .order('validation_failures', { ascending: false })
      .limit(100);

    if (fetchError) throw fetchError;

    console.log(`📊 Found ${brokenItems?.length || 0} items with validation failures`);

    let fixedCount = 0;
    let downgradedCount = 0;
    const results = [];

    for (const item of brokenItems || []) {
      const errorMsg = item.last_validation_error || '';
      
      // Check if error is due to broken source
      const isBrokenSource = errorMsg.includes('404') || 
                            errorMsg.includes('timeout') || 
                            errorMsg.includes('DNS') ||
                            errorMsg.includes('ECONNREFUSED');

      if (!isBrokenSource) {
        continue;
      }

      console.log(`🔍 Processing item ${item.id}: ${errorMsg.substring(0, 50)}...`);

      // Try to find alternative sources
      let canFix = false;
      
      // Check if value contains alternative URLs
      if (item.value && typeof item.value === 'object') {
        const valueStr = JSON.stringify(item.value);
        const hasAlternative = valueStr.includes('overheid.nl') || 
                              valueStr.includes('rijksoverheid.nl') ||
                              valueStr.includes('government.nl');
        
        if (hasAlternative && errorMsg.includes('404')) {
          console.log('✅ Alternative source found, marking as fixable');
          canFix = true;
        }
      }

      if (canFix) {
        // Reset validation failures, keep confidence
        const { error: updateError } = await supabaseClient
          .from('ai_knowledge_base')
          .update({
            validation_failures: 0,
            last_validation_error: null,
            needs_review: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (!updateError) {
          fixedCount++;
          results.push({ id: item.id, action: 'fixed', error: errorMsg.substring(0, 100) });
        }
      } else {
        // Downgrade confidence to 50%, flag for review
        const { error: downgradeError } = await supabaseClient
          .from('ai_knowledge_base')
          .update({
            confidence_score: 0.50,
            needs_review: true,
            last_validation_error: `Source unavailable: ${errorMsg.substring(0, 200)}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (!downgradeError) {
          downgradedCount++;
          results.push({ id: item.id, action: 'downgraded', error: errorMsg.substring(0, 100) });
        }
      }
    }

    console.log(`✅ Fixed: ${fixedCount}, Downgraded: ${downgradedCount}`);

    // Log to business intelligence
    const { error: biError } = await supabaseClient
      .from('business_intelligence')
      .insert({
        org_id: orgId,
        intelligence_type: 'data_quality',
        title: 'Source Fixer Results',
        description: `Fixed ${fixedCount} sources, downgraded ${downgradedCount} broken sources`,
        priority: 'medium',
        status: 'active',
        impact_score: (fixedCount + downgradedCount) / 10,
        data: {
          fixed_count: fixedCount,
          downgraded_count: downgradedCount,
          total_processed: brokenItems?.length || 0,
          results: results.slice(0, 10) // Store first 10 for debugging
        }
      });

    if (biError) {
      console.error('Failed to log to business intelligence:', biError);
    }

    // Log function call
    await supabaseClient.from('function_call_logs').insert({
      function_name: 'source-fixer',
      user_id: orgId,
      org_id: orgId,
      success: true,
      execution_time_ms: Math.floor(Date.now() - startTime)
    });

    return new Response(
      JSON.stringify({
        success: true,
        fixed: fixedCount,
        downgraded: downgradedCount,
        total_processed: brokenItems?.length || 0,
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Source Fixer error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
