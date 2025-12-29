// Data Quality Auditor - scans and auto-fixes knowledge base issues
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { softDeleteKnowledge, updateConfidence } from '../_shared/knowledge-crud.ts';

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

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createAdminClient();

    // Get first organization for autonomous mode
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    console.log('[data-quality-auditor] Scanning org:', orgId);

    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const issues: string[] = [];
    let fixedItemsCount = 0;
    let archivedCount = 0;
    let boostedCount = 0;

    // Get all sublocations and organizations for lookup during auto-fix
    const [{ data: allSublocations }, { data: clientOrgs }] = await Promise.all([
      supabase
        .from('client_sublocations')
        .select(`
          id, naam,
          location:client_locations!inner(
            id, naam,
            organization:client_organizations!inner(id, name, org_id)
          )
        `)
        .eq('is_active', true),
      supabase.from('client_organizations').select('id, name').eq('org_id', orgId)
    ]);
    
    // Build comprehensive lookup: name variants → sublocation.id (FK-compliant)
    const clientLookup = new Map<string, string>();
    
    // Add sublocation names
    allSublocations?.forEach((sub: any) => {
      const normalizedName = sub.naam.toLowerCase().replace(/\s+/g, '');
      clientLookup.set(normalizedName, sub.id);
      
      // Add partial matches
      sub.naam.toLowerCase().split(/[\s-]+/).forEach((word: string) => {
        if (word.length > 2) clientLookup.set(word, sub.id);
      });
      
      // Add location name mapping to first sublocation
      if (sub.location?.naam) {
        const normalizedLocation = sub.location.naam.toLowerCase().replace(/\s+/g, '');
        if (!clientLookup.has(normalizedLocation)) {
          clientLookup.set(normalizedLocation, sub.id);
        }
      }
    });
    
    // Add client_organizations names pointing to first sublocation under them
    const orgToSublocationId = new Map<string, string>();
    allSublocations?.forEach((sub: any) => {
      const orgId = sub.location?.organization?.id;
      if (orgId && !orgToSublocationId.has(orgId)) {
        orgToSublocationId.set(orgId, sub.id);
      }
    });
    
    clientOrgs?.forEach(org => {
      const sublocationId = orgToSublocationId.get(org.id);
      if (sublocationId) {
        const normalizedName = org.name.toLowerCase().replace(/\s+/g, '');
        if (!clientLookup.has(normalizedName)) {
          clientLookup.set(normalizedName, sublocationId);
        }
        // Add partial matches for organization names
        org.name.toLowerCase().split(/[\s-]+/).forEach((word: string) => {
          if (word.length > 2 && !clientLookup.has(word)) {
            clientLookup.set(word, sublocationId);
          }
        });
      }
    });
    
    console.log(`[data-quality-auditor] Client lookup built with ${clientLookup.size} name variants from sublocations/organizations`);

    // SCAN 1: Outdated information (> 12 months) + AUTO-ARCHIVE
    const { data: outdated } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, updated_at, last_used_at, usage_count, created_at, confidence_score')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .lt('updated_at', twelveMonthsAgo)
      .limit(100);

    if (outdated && outdated.length > 0) {
      console.log(`[data-quality-auditor] Found ${outdated.length} outdated items - checking usage...`);
      
      for (const item of outdated) {
        const lastUsed = item.last_used_at ? new Date(item.last_used_at) : null;
        const monthsUnused = lastUsed 
          ? (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24 * 30)
          : 999; // Never used
        
        // Skip high-confidence items that were recently used
        if (item.confidence_score > 0.90 && lastUsed && monthsUnused < 1) {
          continue; // Don't flag as needs_review
        }
        
        // AUTO-ARCHIVE: If >12 months old AND >3 months unused - use unified softDeleteKnowledge
        if (monthsUnused > 3) {
          try {
            // Verify item belongs to org before deletion (security check)
            const { data: verifyItem } = await supabase
              .from('ai_knowledge_base')
              .select('id')
              .eq('id', item.id)
              .eq('org_id', orgId)
              .single();
            
            if (verifyItem) {
              await softDeleteKnowledge(supabase as any, item.id, {
                deletedBy: 'data-quality-auditor',
                reason: `Auto-archived: outdated (${Math.floor(monthsUnused)} months unused)`,
                metadata: { org_id: orgId, usage_count: item.usage_count }
              });
              archivedCount++;
              console.log(`[data-quality-auditor] Auto-archived: ${item.key} (unused for ${Math.floor(monthsUnused)} months)`);
            }
          } catch (err) {
            console.error(`[data-quality-auditor] Failed to archive ${item.id}:`, err);
          }
        } else {
          // Old but recently used - flag for review with org_id check
          await supabase
            .from('ai_knowledge_base')
            .update({ needs_review: true })
            .eq('id', item.id)
            .eq('org_id', orgId);
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

    // SCAN 2: Low confidence items (< 0.7) - with org_id check
    const { data: lowConfidence } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, confidence_score')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .lt('confidence_score', 0.7)
      .limit(100);

    if (lowConfidence && lowConfidence.length > 0) {
      console.log(`[data-quality-auditor] Found ${lowConfidence.length} low confidence items`);
      
      // Batch update with org_id check
      await supabase
        .from('ai_knowledge_base')
        .update({ needs_review: true })
        .in('id', lowConfidence.map(i => i.id))
        .eq('org_id', orgId);
      
      issues.push(`${lowConfidence.length} low confidence items (<0.7)`);
    }

    // SCAN 3: Items without cross-validation - with org_id check
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
      console.log(`[data-quality-auditor] Found ${unvalidatedItems.length} unvalidated TIER 2 items`);
      
      // Batch update with org_id check
      await supabase
        .from('ai_knowledge_base')
        .update({ needs_review: true })
        .in('id', unvalidatedItems.map(i => i.id))
        .eq('org_id', orgId);
      
      issues.push(`${unvalidatedItems.length} unvalidated TIER 2 items`);
    }

    // SCAN 4: Items with validation failures + AUTO-FIX - with org_id check
    const { data: failed } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, validation_failures, last_validation_error, value')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gt('validation_failures', 0)
      .limit(100);

    if (failed && failed.length > 0) {
      console.log(`[data-quality-auditor] Found ${failed.length} items with validation failures - attempting auto-fix...`);
      
      // Try to auto-fix client mismatch errors
      for (const item of failed) {
        if (item.last_validation_error?.includes('Client mismatch')) {
          const correctClientName = extractCorrectClientFromError(item.last_validation_error);
          
          if (correctClientName) {
            const normalizedClientName = correctClientName.toLowerCase().replace(/\s+/g, '');
            const correctClientId = clientLookup.get(normalizedClientName);
            
            if (correctClientId) {
              // Update BOTH the client_id column AND value.client_id JSONB field
              const updatedValue = {
                ...(item.value as any),
                client_id: correctClientId
              };
              
              const { error: fixError } = await supabase
                .from('ai_knowledge_base')
                .update({
                  client_id: correctClientId,  // UPDATE THE ACTUAL FK COLUMN!
                  value: updatedValue,
                  validation_failures: 0,
                  last_validation_error: null,
                  needs_review: false,
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id)
                .eq('org_id', orgId);
              
              if (!fixError) {
                fixedItemsCount++;
                console.log(`[data-quality-auditor] Fixed client mismatch: ${item.key} → updated to client "${correctClientName}" (${correctClientId})`);
              } else {
                console.error(`[data-quality-auditor] Failed to fix ${item.key}:`, fixError.message);
              }
            } else {
              console.log(`[data-quality-auditor] Could not find client_id for "${correctClientName}" - skipping ${item.key}`);
            }
          }
        }
      }
      
      const remainingFailures = failed.length - fixedItemsCount;
      if (remainingFailures > 0) {
        issues.push(`${remainingFailures} validation failures (${fixedItemsCount} auto-fixed)`);
      }
    }

    // SCAN 5: Smart Confidence Boost - use unified updateConfidence
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
      console.log(`[data-quality-auditor] Analyzing ${mediumConfidence.length} medium-confidence items for boost...`);
      
      for (const item of mediumConfidence) {
        const daysSinceCreation = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
        const usageRate = item.usage_count / Math.max(daysSinceCreation, 1); // Uses per day
        
        // BOOST CRITERIA: ≥3x gebruikt + usage rate ≥ 0.1 per day
        if (usageRate >= 0.1) {
          try {
            // Use unified updateConfidence with atomic RPC - use stability_boost rule with custom delta
            const result = await updateConfidence(supabase as any, item.id, orgId, {
              ruleKey: 'stability_boost',
              customDelta: 0.1
            });
            
            boostedCount++;
            console.log(`[data-quality-auditor] Confidence boost: ${item.key} (${item.confidence_score} → ${result.newConfidence}) - ${item.usage_count} uses in ${Math.floor(daysSinceCreation)} days`);
          } catch (err) {
            console.error(`[data-quality-auditor] Failed to boost ${item.id}:`, err);
          }
        }
      }
      
      if (boostedCount > 0) {
        console.log(`[data-quality-auditor] Boosted confidence for ${boostedCount} well-performing items`);
      }
    }

    // SCAN 6: Incomplete Data Detection - use unified updateConfidence for penalty
    const { data: allItems } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, value, confidence_score, category')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .limit(500);

    let incompleteCount = 0;
    
    if (allItems && allItems.length > 0) {
      console.log(`[data-quality-auditor] Scanning ${allItems.length} items for incomplete data...`);
      
      const hasPlaceholderText = (value: any): boolean => {
        if (!value) return false;
        const valueStr = JSON.stringify(value).toLowerCase();
        const placeholders = [
          'nog te bepalen', 'in te vullen', 'todo', 'tbd',
          'not available', 'n/a', 'unknown', 'onbekend', 'nvt', '...'
        ];
        return placeholders.some(p => valueStr.includes(p));
      };

      const hasExcessiveNulls = (value: any): boolean => {
        if (!value || typeof value !== 'object') return false;
        const fields = Object.values(value);
        if (fields.length === 0) return false;
        
        const emptyFields = fields.filter(v => 
          v === null || v === undefined || v === '' || 
          (typeof v === 'string' && v.trim() === '')
        );
        return (emptyFields.length / fields.length) > 0.6;
      };

      for (const item of allItems) {
        const isIncomplete = hasPlaceholderText(item.value) || 
                            hasExcessiveNulls(item.value) ||
                            JSON.stringify(item.value).length < 20;
        
        if (isIncomplete) {
          try {
            // Use unified updateConfidence for penalty with atomic RPC - use negative_feedback rule with custom delta
            await updateConfidence(supabase as any, item.id, orgId, {
              ruleKey: 'negative_feedback',
              customDelta: -0.2
            });
            
            // Separate update for needs_review with org_id check
            await supabase
              .from('ai_knowledge_base')
              .update({ needs_review: true })
              .eq('id', item.id)
              .eq('org_id', orgId);
            
            incompleteCount++;
            console.log(`[data-quality-auditor] Incomplete data detected: ${item.key} in ${item.category}`);
          } catch (err) {
            console.error(`[data-quality-auditor] Failed to penalize ${item.id}:`, err);
          }
        }
      }
      
      if (incompleteCount > 0) {
        issues.push(`${incompleteCount} incomplete items (placeholder text or excessive nulls)`);
        console.log(`[data-quality-auditor] Flagged ${incompleteCount} items with incomplete data for review`);
      }
    }

    // Report to business intelligence
    if (issues.length > 0 || fixedItemsCount > 0 || archivedCount > 0 || boostedCount > 0) {
      const summary = [];
      if (fixedItemsCount > 0) summary.push(`${fixedItemsCount} auto-fixed`);
      if (archivedCount > 0) summary.push(`${archivedCount} archived`);
      if (boostedCount > 0) summary.push(`${boostedCount} boosted`);
      if (incompleteCount > 0) summary.push(`${incompleteCount} incomplete`);
      
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
      
      // Report audit results - conditional insert/update to handle partial unique constraint
      const alertTitle = summary.length > 0
        ? `Data Quality Audit: ${issues.length} issues, ${summary.join(', ')}`
        : `Data Quality Audit: ${issues.length} issues found`;

      // Check if active alert exists
      const { data: existingAlert } = await supabase
        .from('business_intelligence')
        .select('id')
        .eq('intelligence_type', 'data_quality_audit')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .maybeSingle();

      if (existingAlert) {
        // Update existing alert
        await supabase
          .from('business_intelligence')
          .update({
            title: alertTitle,
            description: issues.join(', '),
            severity: severity,
            priority: (fixedItemsCount > 0 || archivedCount > 0 || boostedCount > 0) ? 'medium' : 'high',
            impact_score: impactScore,
            last_updated_at: new Date().toISOString(),
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
          })
          .eq('id', existingAlert.id);
      } else {
        // Insert new alert
        await supabase
          .from('business_intelligence')
          .insert({
            org_id: orgId,
            intelligence_type: 'data_quality_audit',
            type: 'data_quality',
            severity: severity,
            title: alertTitle,
            description: issues.join(', '),
            priority: (fixedItemsCount > 0 || archivedCount > 0 || boostedCount > 0) ? 'medium' : 'high',
            status: 'active',
            impact_score: impactScore,
            last_updated_at: new Date().toISOString(),
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

    console.log(`[data-quality-auditor] Complete: ${issues.length} issues, ${fixedItemsCount} fixed, ${archivedCount} archived, ${boostedCount} boosted, ${incompleteCount} incomplete`);

    return new Response(JSON.stringify({
      success: true,
      issues_found: issues.length,
      auto_fixed: fixedItemsCount,
      auto_archived: archivedCount,
      confidence_boosted: boostedCount,
      incomplete_flagged: incompleteCount,
      details: issues,
      items_marked_for_review: (outdated?.length || 0) + (lowConfidence?.length || 0) + unvalidatedItems.length + incompleteCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[data-quality-auditor] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
