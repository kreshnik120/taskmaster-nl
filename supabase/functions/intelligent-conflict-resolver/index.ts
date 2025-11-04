import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConflictAnalysis {
  field: string;
  org_profiles_value: any;
  ai_knowledge_value: any;
  confidence_score: number;
  source_count: number;
  last_verified: string | null;
  recommendation: 'keep_org_profiles' | 'update_to_kb' | 'manual_review';
  reasoning: string;
}

interface ResolutionResult {
  conflicts_detected: number;
  auto_resolved: number;
  manual_review_needed: number;
  updated_fields: string[];
  conflicts: ConflictAnalysis[];
}

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

    console.log('🔍 Intelligent Conflict Resolver - Starting scan...');

    // Get all organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id');

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;

    // STAP 1: Haal org_profiles op
    const { data: orgProfiles } = await supabase
      .from('org_profiles')
      .select('*')
      .eq('org_id', orgId);

    if (!orgProfiles || orgProfiles.length === 0) {
      console.log('⚠️ No org_profiles found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No org_profiles to check',
          conflicts_detected: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: ResolutionResult[] = [];

    // STAP 2: Analyseer elk profiel
    for (const profile of orgProfiles) {
      console.log(`\n🔎 Analyzing: ${profile.brand_name}`);
      
      const conflicts: ConflictAnalysis[] = [];
      const updatedFields: string[] = [];
      let autoResolved = 0;

      // STAP 3: Check KvK-nummer in ai_knowledge_base
      const { data: kvkItems } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .eq('org_id', orgId)
        .or(`key.ilike.%kvk%,key.ilike.%kamer van koophandel%`)
        .or(`value->>text.ilike.%${profile.brand_name}%,category.eq.organisatie_gegevens`)
        .is('deleted_at', null)
        .order('confidence_score', { ascending: false })
        .limit(10);

      if (kvkItems && kvkItems.length > 0) {
        // Zoek naar KvK-nummers in de knowledge base
        const kvkPattern = /\b\d{8}\b/g;
        const foundKvkNumbers = new Set<string>();

        kvkItems.forEach(item => {
          const valueText = typeof item.value === 'object' && item.value !== null 
            ? JSON.stringify(item.value) 
            : String(item.value || '');
          
          const matches = valueText.match(kvkPattern);
          if (matches) {
            matches.forEach(num => foundKvkNumbers.add(num));
          }
        });

        // Als we een KvK-nummer vinden dat anders is dan in org_profiles
        for (const kvkNum of foundKvkNumbers) {
          if (kvkNum !== profile.kvk_number) {
            // Vind het item met de hoogste confidence
            const relevantItem = kvkItems.find(item => {
              const valueText = typeof item.value === 'object' && item.value !== null 
                ? JSON.stringify(item.value) 
                : String(item.value || '');
              return valueText.includes(kvkNum);
            });

            if (relevantItem) {
              const confidence = relevantItem.confidence_score || 0;
              const usageCount = relevantItem.usage_count || 0;
              
              // AUTO-RESOLVE LOGICA
              // ✅ Auto-update als:
              // - Confidence > 0.95 EN usage > 5
              // - OF Confidence > 0.85 EN usage > 10
              const shouldAutoResolve = 
                (confidence > 0.95 && usageCount > 5) ||
                (confidence > 0.85 && usageCount > 10);

              conflicts.push({
                field: 'kvk_number',
                org_profiles_value: profile.kvk_number,
                ai_knowledge_value: kvkNum,
                confidence_score: confidence,
                source_count: kvkItems.filter(i => {
                  const vt = typeof i.value === 'object' && i.value !== null 
                    ? JSON.stringify(i.value) 
                    : String(i.value || '');
                  return vt.includes(kvkNum);
                }).length,
                last_verified: relevantItem.last_verified_at || relevantItem.updated_at,
                recommendation: shouldAutoResolve ? 'update_to_kb' : 'manual_review',
                reasoning: shouldAutoResolve
                  ? `Hoge betrouwbaarheid (${(confidence * 100).toFixed(1)}%) + veelvuldig gebruik (${usageCount}x)`
                  : `Confidence ${(confidence * 100).toFixed(1)}% te laag voor auto-correctie (vereist >85% + 10+ uses)`
              });

              // STAP 4: AUTO-UPDATE indien criteria voldaan
              if (shouldAutoResolve) {
                console.log(`✅ AUTO-RESOLVE: Updating ${profile.brand_name} KvK to ${kvkNum}`);
                
                const { error: updateError } = await supabase
                  .from('org_profiles')
                  .update({ 
                    kvk_number: kvkNum,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', profile.id);

                if (!updateError) {
                  updatedFields.push('kvk_number');
                  autoResolved++;

                  // Log in business_intelligence
                  await supabase
                    .from('business_intelligence')
                    .insert({
                      org_id: orgId,
                      intelligence_type: 'auto_correction',
                      title: `Auto-gecorrigeerd: ${profile.brand_name} KvK-nummer`,
                      description: `KvK-nummer geüpdatet van ${profile.kvk_number} naar ${kvkNum}`,
                      data: {
                        brand_name: profile.brand_name,
                        field: 'kvk_number',
                        old_value: profile.kvk_number,
                        new_value: kvkNum,
                        confidence: confidence,
                        usage_count: usageCount,
                        source_item_id: relevantItem.id
                      },
                      impact_score: confidence,
                      priority: 'high',
                      status: 'resolved'
                    });

                  // Log learning event
                  await supabase
                    .from('ai_learning_events')
                    .insert({
                      org_id: orgId,
                      event_type: 'auto_correction',
                      context: {
                        brand_name: profile.brand_name,
                        field: 'kvk_number',
                        old_value: profile.kvk_number,
                        new_value: kvkNum,
                        auto_resolved: true
                      },
                      confidence_score: confidence,
                      outcome: 'success'
                    });
                }
              } else {
                // STAP 5: Log voor manual review
                console.log(`⚠️ MANUAL REVIEW NEEDED: ${profile.brand_name} KvK conflict (${(confidence * 100).toFixed(1)}% confidence)`);
                
                await supabase
                  .from('business_intelligence')
                  .insert({
                    org_id: orgId,
                    intelligence_type: 'data_quality',
                    title: `KvK-nummer conflict: ${profile.brand_name}`,
                    description: `org_profiles heeft ${profile.kvk_number}, maar knowledge base suggereert ${kvkNum}`,
                    data: {
                      brand_name: profile.brand_name,
                      field: 'kvk_number',
                      org_profiles_value: profile.kvk_number,
                      ai_knowledge_value: kvkNum,
                      confidence: confidence,
                      usage_count: usageCount,
                      requires_manual_review: true,
                      reason: 'Confidence te laag voor auto-correctie'
                    },
                    impact_score: confidence,
                    priority: confidence > 0.8 ? 'high' : 'medium',
                    status: 'active'
                  });
              }
            }
          }
        }
      }

      // STAP 6: Check adres, postcode, woonplaats
      const addressFields = ['address', 'postal_code', 'city'];
      for (const field of addressFields) {
        const { data: addressItems } = await supabase
          .from('ai_knowledge_base')
          .select('*')
          .eq('org_id', orgId)
          .or(`key.ilike.%${field}%,key.ilike.%adres%,key.ilike.%vestiging%`)
          .or(`value->>text.ilike.%${profile.brand_name}%,category.eq.organisatie_gegevens`)
          .is('deleted_at', null)
          .gte('confidence_score', 0.7)
          .order('confidence_score', { ascending: false })
          .limit(5);

        if (addressItems && addressItems.length > 0) {
          const currentValue = profile[field as keyof typeof profile];
          // Check if there's a different value with high confidence
          const betterValue = addressItems.find(item => {
            const valueText = typeof item.value === 'object' && item.value !== null 
              ? (item.value as any).text || JSON.stringify(item.value)
              : String(item.value || '');
            return valueText !== currentValue && (item.confidence_score || 0) > 0.85;
          });

          if (betterValue) {
            const valueText = typeof betterValue.value === 'object' && betterValue.value !== null 
              ? (betterValue.value as any).text || JSON.stringify(betterValue.value)
              : String(betterValue.value || '');
            
            const confidence = betterValue.confidence_score || 0;
            const usageCount = betterValue.usage_count || 0;
            
            const shouldAutoResolve = 
              (confidence > 0.95 && usageCount > 3) ||
              (confidence > 0.90 && usageCount > 8);

            conflicts.push({
              field,
              org_profiles_value: currentValue,
              ai_knowledge_value: valueText,
              confidence_score: confidence,
              source_count: addressItems.length,
              last_verified: betterValue.last_verified_at || betterValue.updated_at,
              recommendation: shouldAutoResolve ? 'update_to_kb' : 'manual_review',
              reasoning: shouldAutoResolve
                ? `Hoge betrouwbaarheid voor ${field}`
                : `Vereist verificatie voor ${field}`
            });

            if (shouldAutoResolve) {
              console.log(`✅ AUTO-RESOLVE: Updating ${profile.brand_name} ${field}`);
              
              const { error: updateError } = await supabase
                .from('org_profiles')
                .update({ 
                  [field]: valueText,
                  updated_at: new Date().toISOString()
                })
                .eq('id', profile.id);

              if (!updateError) {
                updatedFields.push(field);
                autoResolved++;

                await supabase
                  .from('business_intelligence')
                  .insert({
                    org_id: orgId,
                    intelligence_type: 'auto_correction',
                    title: `Auto-gecorrigeerd: ${profile.brand_name} ${field}`,
                    description: `${field} geüpdatet`,
                    data: {
                      brand_name: profile.brand_name,
                      field,
                      old_value: currentValue,
                      new_value: valueText,
                      confidence
                    },
                    impact_score: confidence,
                    status: 'resolved'
                  });
              }
            }
          }
        }
      }

      // Store results
      allResults.push({
        conflicts_detected: conflicts.length,
        auto_resolved: autoResolved,
        manual_review_needed: conflicts.filter(c => c.recommendation === 'manual_review').length,
        updated_fields: updatedFields,
        conflicts
      });
    }

    // STAP 7: Samenvatting
    const totalConflicts = allResults.reduce((sum, r) => sum + r.conflicts_detected, 0);
    const totalAutoResolved = allResults.reduce((sum, r) => sum + r.auto_resolved, 0);
    const totalManualReview = allResults.reduce((sum, r) => sum + r.manual_review_needed, 0);

    const executionTime = Date.now() - startTime;
    console.log(`\n✅ Scan completed in ${executionTime}ms`);
    console.log(`📊 Conflicts: ${totalConflicts} | Auto-resolved: ${totalAutoResolved} | Manual review: ${totalManualReview}`);

    // Log summary
    await supabase
      .from('function_call_logs')
      .insert({
        org_id: orgId,
        user_id: orgs[0].id, // System user
        function_name: 'intelligent-conflict-resolver',
        success: true,
        execution_time_ms: executionTime
      });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          conflicts_detected: totalConflicts,
          auto_resolved: totalAutoResolved,
          manual_review_needed: totalManualReview,
          execution_time_ms: executionTime
        },
        results: allResults
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
