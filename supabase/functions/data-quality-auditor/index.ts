import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to extract correct client name from validation error
function extractCorrectClientFromError(errorMessage: string): string | null {
  if (!errorMessage) return null;
  
  // Pattern: "Client mismatch: KB claims X, but used for Y query"
  const match = errorMessage.match(/but used for (\w+) query/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  
  return null;
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

    // Get first organization for autonomous mode
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    console.log('🔍 Data Quality Auditor scanning org:', orgId);

    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const issues: string[] = [];
    let fixedItemsCount = 0;
    let archivedCount = 0;
    let boostedCount = 0;

    // Get all clients for lookup during auto-fix
    const { data: allClients } = await supabase
      .from('clients')
      .select('id, name, company')
      .eq('org_id', orgId);
    
    const clientLookup = new Map<string, string>();
    allClients?.forEach(client => {
      const normalizedName = client.name.toLowerCase().replace(/\s+/g, '');
      clientLookup.set(normalizedName, client.id);
      
      // Also try company name
      if (client.company) {
        const normalizedCompany = client.company.toLowerCase().replace(/\s+/g, '');
        clientLookup.set(normalizedCompany, client.id);
      }
    });

    // SCAN 1: Outdated information (> 12 months) + AUTO-ARCHIVE
    const { data: outdated } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, updated_at, last_used_at, usage_count, created_at, confidence_score')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .lt('updated_at', twelveMonthsAgo)
      .limit(100);

    if (outdated && outdated.length > 0) {
      console.log(`⚠️ Found ${outdated.length} outdated items - checking usage...`);
      
      for (const item of outdated) {
        const lastUsed = item.last_used_at ? new Date(item.last_used_at) : null;
        const monthsUnused = lastUsed 
          ? (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24 * 30)
          : 999; // Never used
        
        // Skip high-confidence items that were recently used
        if (item.confidence_score > 0.90 && lastUsed && monthsUnused < 1) {
          continue; // Don't flag as needs_review
        }
        
        // AUTO-ARCHIVE: If >12 months old AND >3 months unused
        if (monthsUnused > 3) {
          await supabase
            .from('ai_knowledge_base')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: 'data-quality-auditor',
              deletion_reason: {
                reason: 'auto_archived_outdated',
                age_months: Math.floor(monthsUnused),
                last_updated: item.updated_at,
                last_used: item.last_used_at || 'never'
              },
              needs_review: false
            })
            .eq('id', item.id);
          
          archivedCount++;
          console.log(`📦 Auto-archived: ${item.key} (unused for ${Math.floor(monthsUnused)} months)`);
        } else {
          // Old but recently used - flag for review
          await supabase
            .from('ai_knowledge_base')
            .update({ needs_review: true })
            .eq('id', item.id);
        }
      }
      
      if (archivedCount > 0) {
        issues.push(`${archivedCount} items auto-archived (outdated + unused)`);
      }
      
      const reviewCount = outdated.length - archivedCount;
      if (reviewCount > 0) {
        issues.push(`${reviewCount} outdated items flagged for review`);
      }
    }

    // SCAN 2: Low confidence items (< 0.7)
    const { data: lowConfidence } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, confidence_score')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .lt('confidence_score', 0.7)
      .limit(100);

    if (lowConfidence && lowConfidence.length > 0) {
      console.log(`⚠️ Found ${lowConfidence.length} low confidence items`);
      
      await supabase
        .from('ai_knowledge_base')
        .update({ needs_review: true })
        .in('id', lowConfidence.map(i => i.id));
      
      issues.push(`${lowConfidence.length} low confidence items (<0.7)`);
    }

    // SCAN 3: Items without cross-validation
    const { data: unvalidated } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, value')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .limit(500);

    const unvalidatedItems = unvalidated?.filter(item => {
      const value = item.value as any;
      return value?.cross_validated === false && value?.source_type?.includes('tier2');
    }) || [];

    if (unvalidatedItems.length > 0) {
      console.log(`⚠️ Found ${unvalidatedItems.length} unvalidated TIER 2 items`);
      
      await supabase
        .from('ai_knowledge_base')
        .update({ needs_review: true })
        .in('id', unvalidatedItems.map(i => i.id));
      
      issues.push(`${unvalidatedItems.length} unvalidated TIER 2 items`);
    }

    // SCAN 4: Items with validation failures + AUTO-FIX
    const { data: failed } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, validation_failures, last_validation_error, value')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gt('validation_failures', 0)
      .limit(100);

    if (failed && failed.length > 0) {
      console.log(`⚠️ Found ${failed.length} items with validation failures - attempting auto-fix...`);
      
      // Try to auto-fix client mismatch errors
      for (const item of failed) {
        if (item.last_validation_error?.includes('Client mismatch')) {
          const correctClientName = extractCorrectClientFromError(item.last_validation_error);
          
          if (correctClientName) {
            const normalizedClientName = correctClientName.toLowerCase().replace(/\s+/g, '');
            const correctClientId = clientLookup.get(normalizedClientName);
            
            if (correctClientId) {
              // Update the knowledge base item with correct client_id
              const updatedValue = {
                ...(item.value as any),
                client_id: correctClientId
              };
              
              const { error: fixError } = await supabase
                .from('ai_knowledge_base')
                .update({
                  value: updatedValue,
                  validation_failures: 0,
                  last_validation_error: null,
                  needs_review: false,
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
              
              if (!fixError) {
                fixedItemsCount++;
                console.log(`✅ Fixed client mismatch: ${item.key} → updated to client "${correctClientName}" (${correctClientId})`);
              } else {
                console.error(`❌ Failed to fix ${item.key}:`, fixError.message);
              }
            } else {
              console.log(`⚠️ Could not find client_id for "${correctClientName}" - skipping ${item.key}`);
            }
          }
        }
      }
      
      const remainingFailures = failed.length - fixedItemsCount;
      if (remainingFailures > 0) {
        issues.push(`${remainingFailures} validation failures (${fixedItemsCount} auto-fixed)`);
      }
    }

    // SCAN 5: Smart Confidence Boost
    const { data: mediumConfidence } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, confidence_score, usage_count, created_at, last_used_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gte('confidence_score', 0.7)
      .lt('confidence_score', 0.85)
      .gte('usage_count', 3) // Minimum 3x gebruikt
      .limit(50);

    if (mediumConfidence && mediumConfidence.length > 0) {
      console.log(`🔍 Analyzing ${mediumConfidence.length} medium-confidence items for boost...`);
      
      for (const item of mediumConfidence) {
        const daysSinceCreation = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
        const usageRate = item.usage_count / Math.max(daysSinceCreation, 1); // Uses per day
        
        // BOOST CRITERIA: ≥3x gebruikt + usage rate ≥ 0.1 per day
        if (usageRate >= 0.1) {
          const newConfidence = Math.min(0.9, item.confidence_score + 0.1);
          
          await supabase
            .from('ai_knowledge_base')
            .update({
              confidence_score: newConfidence,
              needs_review: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);
          
          boostedCount++;
          console.log(`📈 Confidence boost: ${item.key} (${item.confidence_score} → ${newConfidence}) - ${item.usage_count} uses in ${Math.floor(daysSinceCreation)} days`);
        }
      }
      
      if (boostedCount > 0) {
        console.log(`✅ Boosted confidence for ${boostedCount} well-performing items`);
      }
    }

    // Report to business intelligence
    if (issues.length > 0 || fixedItemsCount > 0 || archivedCount > 0 || boostedCount > 0) {
      const summary = [];
      if (fixedItemsCount > 0) summary.push(`${fixedItemsCount} auto-fixed`);
      if (archivedCount > 0) summary.push(`${archivedCount} archived`);
      if (boostedCount > 0) summary.push(`${boostedCount} boosted`);
      
      // Calculate impact score and classify
      const totalIssues = issues.length;
      const impactScore = totalIssues > 50 ? 0.9 : (totalIssues > 20 ? 0.7 : (totalIssues > 5 ? 0.5 : 0.3));
      
      // Determine severity based on impact
      let severity: string;
      if (impactScore > 0.8 || (totalIssues > 100 && fixedItemsCount === 0)) {
        severity = 'critical';
      } else if (impactScore > 0.6 || totalIssues > 50) {
        severity = 'high';
      } else if (impactScore > 0.4 || totalIssues > 10) {
        severity = 'medium';
      } else {
        severity = 'low';
      }
      
      await supabase
        .from('business_intelligence')
        .insert({
          org_id: orgId,
          intelligence_type: 'data_quality_audit',
          type: 'data_quality',
          severity: severity,
          title: summary.length > 0
            ? `Data Quality Audit: ${issues.length} issues, ${summary.join(', ')}`
            : `Data Quality Audit: ${issues.length} issues found`,
          description: issues.join(', '),
          priority: (fixedItemsCount > 0 || archivedCount > 0 || boostedCount > 0) ? 'medium' : 'high',
          status: 'active',
          impact_score: impactScore,
          data: {
            timestamp: new Date().toISOString(),
            outdated_count: outdated?.length || 0,
            low_confidence_count: lowConfidence?.length || 0,
            unvalidated_count: unvalidatedItems.length,
            failed_validation_count: failed?.length || 0,
            auto_fixed_count: fixedItemsCount,
            auto_archived_count: archivedCount,
            confidence_boosted_count: boostedCount,
            total_issues: issues.length
          }
        });
    }

    // Log function call
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: orgId,
      function_name: 'data-quality-auditor',
      success: true,
      execution_time_ms: Math.floor(Date.now() - startTime),
      model_used: 'autonomous'
    });

    console.log(`✅ Quality audit complete: ${issues.length} issues, ${fixedItemsCount} fixed, ${archivedCount} archived, ${boostedCount} boosted`);

    return new Response(JSON.stringify({
      success: true,
      issues_found: issues.length,
      auto_fixed: fixedItemsCount,
      auto_archived: archivedCount,
      confidence_boosted: boostedCount,
      details: issues,
      items_marked_for_review: (outdated?.length || 0) + (lowConfidence?.length || 0) + unvalidatedItems.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Data Quality Auditor error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});