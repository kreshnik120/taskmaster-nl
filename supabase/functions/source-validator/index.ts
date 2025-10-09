import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

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
    console.log('🔗 Source Validator checking external sources...');

    // Get all items with external sources
    const { data: items } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, value')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .limit(500);

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ success: true, sources_validated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract items with source URLs
    const itemsWithSources = items.filter(item => {
      const value = item.value as any;
      return value?.source_url && typeof value.source_url === 'string';
    });

    console.log(`🔍 Validating ${itemsWithSources.length} sources...`);

    let validatedCount = 0;
    let brokenCount = 0;
    const brokenSources: any[] = [];

    for (const item of itemsWithSources) {
      const value = item.value as any;
      const sourceUrl = value.source_url;

      try {
        // Check if source is accessible
        const response = await fetch(sourceUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000) // 5s timeout
        });

        if (response.ok) {
          // Source is valid - update last_verified
          await supabase
            .from('ai_knowledge_base')
            .update({
              value: {
                ...value,
                last_verified: new Date().toISOString(),
                validation_status: 'valid'
              }
            })
            .eq('id', item.id);

          validatedCount++;
          console.log(`✓ Valid: ${item.key}`);
        } else {
          // Source returned error
          console.log(`❌ Invalid (${response.status}): ${item.key}`);
          brokenCount++;
          brokenSources.push({
            item_id: item.id,
            key: item.key,
            category: item.category,
            source: sourceUrl,
            status_code: response.status
          });

          // Mark for review
          await supabase
            .from('ai_knowledge_base')
            .update({
              needs_review: true,
              last_validation_error: `Source unreachable: HTTP ${response.status}`,
              value: {
                ...value,
                last_verified: new Date().toISOString(),
                validation_status: 'broken'
              }
            })
            .eq('id', item.id);
        }
      } catch (error) {
        // Network error or timeout
        console.log(`❌ Broken: ${item.key} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        brokenCount++;
        brokenSources.push({
          item_id: item.id,
          key: item.key,
          category: item.category,
          source: sourceUrl,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Mark for review
        await supabase
          .from('ai_knowledge_base')
          .update({
            needs_review: true,
            last_validation_error: `Source unreachable: ${error instanceof Error ? error.message : 'Network error'}`,
            value: {
              ...value,
              last_verified: new Date().toISOString(),
              validation_status: 'unreachable'
            }
          })
          .eq('id', item.id);
      }

      // Rate limiting (avoid hammering servers)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Report broken sources to business intelligence
    if (brokenSources.length > 0) {
      const brokenPercentage = (brokenSources.length / itemsWithSources.length) * 100;
      const impactScore = Math.min(1.0, brokenPercentage / 100);
      
      // Classify severity based on percentage
      let severity: string;
      if (brokenPercentage > 50) {
        severity = 'critical';
      } else if (brokenPercentage > 25) {
        severity = 'high';
      } else if (brokenPercentage > 10) {
        severity = 'medium';
      } else {
        severity = 'low';
      }
      
      await supabase
        .from('business_intelligence')
        .insert({
          org_id: orgId,
          intelligence_type: 'broken_sources',
          type: 'data_quality',
          severity: severity,
          title: `${brokenSources.length} broken external sources detected`,
          description: `Weekly source validation found ${brokenSources.length} unreachable sources (${brokenPercentage.toFixed(1)}%)`,
          priority: brokenPercentage > 25 ? 'high' : 'medium',
          status: 'active',
          impact_score: impactScore,
          data: {
            timestamp: new Date().toISOString(),
            broken_sources: brokenSources,
            total_validated: itemsWithSources.length,
            broken_percentage: brokenPercentage.toFixed(1)
          }
        });
    }

    // Log function call
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: orgId,
      function_name: 'source-validator',
      success: true,
      execution_time_ms: Math.floor(Date.now() - startTime),
      model_used: 'autonomous'
    });

    console.log(`✅ Source validation complete: ${validatedCount} valid, ${brokenCount} broken`);

    return new Response(JSON.stringify({
      success: true,
      sources_validated: itemsWithSources.length,
      valid_sources: validatedCount,
      broken_sources: brokenCount,
      broken_details: brokenSources
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Source Validator error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});