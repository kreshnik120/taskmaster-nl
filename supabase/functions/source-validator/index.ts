import { handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { isUrlAllowedForScraping, logSecurityEvent } from '../_shared/healthcare-mappings.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createAdminClient();

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (!orgs || orgs.length === 0) {
      throw new Error('No organizations found');
    }

    const orgId = orgs[0].id;
    console.log('🔗 Source Validator checking external sources...');

    // Get all items with external sources - batch size reduced for stability
    const { data: items } = await supabase
      .from('ai_knowledge_base')
      .select('id, key, category, value')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .limit(50);  // Reduced from 500 to prevent gateway timeouts

    if (!items || items.length === 0) {
      return jsonResponse({ success: true, sources_validated: 0 });
    }

    // Extract items with source URLs
    const itemsWithSources = items.filter(item => {
      const value = item.value as any;
      return value?.source_url && typeof value.source_url === 'string';
    });

    console.log(`🔍 Validating ${itemsWithSources.length} sources...`);

    let validatedCount = 0;
    let brokenCount = 0;
    let ssrfBlockedCount = 0;
    const brokenSources: any[] = [];

    for (const item of itemsWithSources) {
      const value = item.value as any;
      const sourceUrl = value.source_url;

      // === SSRF PROTECTION ===
      const urlValidation = isUrlAllowedForScraping(sourceUrl, { 
        allowAnyDutchDomain: true,
        strictMode: false 
      });

      if (!urlValidation.allowed) {
        console.warn(`🚫 SSRF Protection: Blocked source validation for ${sourceUrl} - ${urlValidation.reason}`);
        ssrfBlockedCount++;
        brokenCount++;
        brokenSources.push({
          item_id: item.id,
          key: item.key,
          category: item.category,
          source: sourceUrl,
          error: `SSRF blocked: ${urlValidation.reason}`
        });

        // Log security event
        await logSecurityEvent(supabase, 'ssrf_blocked', 'medium', {
          function_name: 'source-validator',
          blocked_url: sourceUrl,
          blocked_reason: urlValidation.reason,
          org_id: orgId,
          additional_context: {
            item_id: item.id,
            item_key: item.key,
            item_category: item.category,
          }
        });

        // Mark for review
        await supabase
          .from('ai_knowledge_base')
          .update({
            needs_review: true,
            last_validation_error: `SSRF blocked: ${urlValidation.reason}`,
            value: {
              ...value,
              last_verified: new Date().toISOString(),
              validation_status: 'ssrf_blocked'
            }
          })
          .eq('id', item.id);

        continue;
      }

      const safeUrl = urlValidation.sanitizedUrl || sourceUrl;

      try {
        // Check if source is accessible
        const response = await fetch(safeUrl, {
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

    // Report broken sources to business intelligence (FASE 2: Smart Deduplication)
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

      // Check for existing active alert within last 7 days
      const { data: existingAlert } = await supabase
        .from('business_intelligence')
        .select('id, data')
        .eq('org_id', orgId)
        .eq('type', 'broken_sources_structural')
        .eq('status', 'active')
        .gte('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existingAlert) {
        // UPDATE existing alert
        const history = existingAlert.data?.detection_history || [];
        await supabase
          .from('business_intelligence')
          .update({
            data: {
              ...existingAlert.data,
              detection_history: [
                ...history,
                {
                  count: brokenSources.length,
                  timestamp: new Date().toISOString(),
                  percentage: brokenPercentage
                }
              ],
              last_detected: new Date().toISOString(),
              total_detections: (existingAlert.data?.total_detections || 0) + 1,
              avg_broken_sources: Math.round(
                ([...history.map((h: any) => h.count), brokenSources.length].reduce((a: number, b: number) => a + b, 0)) / 
                (history.length + 1)
              ),
              broken_sources: brokenSources,
              total_validated: itemsWithSources.length,
              failure_percentage: brokenPercentage.toFixed(1)
            },
            description: `Source validation detected ${brokenSources.length} unreachable sources (${brokenPercentage.toFixed(1)}%). Issue persisting for ${
              Math.round((Date.now() - new Date(existingAlert.data?.first_detected).getTime()) / (24 * 60 * 60 * 1000))
            } days.`,
            severity: severity
          })
          .eq('id', existingAlert.id);

        console.log(`✅ Updated existing alert ${existingAlert.id} with new detection`);
      } else {
        // CREATE new alert
        await supabase
          .from('business_intelligence')
          .insert({
            org_id: orgId,
            intelligence_type: 'broken_sources',
            type: 'broken_sources_structural',
            severity: severity,
            title: `${brokenSources.length} broken external sources detected`,
            description: `Source validation found ${brokenSources.length} unreachable sources (${brokenPercentage.toFixed(1)}%)`,
            priority: brokenPercentage > 25 ? 'high' : 'medium',
            status: 'active',
            impact_score: impactScore,
            data: {
              category: 'source_issue',
              timestamp: new Date().toISOString(),
              broken_sources: brokenSources,
              total_validated: itemsWithSources.length,
              broken_count: brokenSources.length,
              failure_percentage: brokenPercentage.toFixed(1),
              detection_history: [{
                count: brokenSources.length,
                timestamp: new Date().toISOString(),
                percentage: brokenPercentage
              }],
              first_detected: new Date().toISOString(),
              last_detected: new Date().toISOString(),
              total_detections: 1,
              avg_broken_sources: brokenSources.length
            }
          });

        console.log(`🆕 Created new structural alert for broken sources`);
      }
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

    console.log(`✅ Source validation complete: ${validatedCount} valid, ${brokenCount} broken (${ssrfBlockedCount} SSRF blocked)`);

    return jsonResponse({
      success: true,
      sources_validated: itemsWithSources.length,
      valid_sources: validatedCount,
      broken_sources: brokenCount,
      ssrf_blocked: ssrfBlockedCount,
      broken_details: brokenSources
    });

  } catch (error) {
    console.error('❌ Source Validator error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
