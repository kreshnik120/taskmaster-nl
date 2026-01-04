/**
 * Learn Functie Niveau Patterns
 * 
 * AI Learning Edge Function that:
 * 1. Aggregates unknown functie_niveau values from system_events
 * 2. Uses Levenshtein distance to find closest matches
 * 3. Creates suggestions in ai_knowledge_base for high-confidence patterns
 * 4. Marks processed events to prevent re-processing
 * 
 * Schedule: Daily at 04:00 UTC via master-scheduler
 * Enterprise Version: 1.0.0
 */
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { FUNCTIE_NIVEAU_MAP, VALID_FUNCTIE_NIVEAUS, ORG_IDS } from '../_shared/healthcare-mappings.ts';

const VERSION = '1.0.0';
const MAX_EVENTS_PER_CYCLE = 50;
const MIN_OCCURRENCES = 3;

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Find the closest valid functie_niveau match using Levenshtein distance
 */
function findClosestMatch(input: string): { match: string; similarity: number } {
  const normalized = input.toLowerCase().trim();
  let bestMatch: string = VALID_FUNCTIE_NIVEAUS[0];
  let bestDistance = Infinity;
  
  // Check against all valid values
  for (const valid of VALID_FUNCTIE_NIVEAUS) {
    const distance = levenshtein(normalized, valid.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = valid;
    }
  }
  
  // Also check against all mapping keys (more variations)
  for (const [key, value] of Object.entries(FUNCTIE_NIVEAU_MAP)) {
    const distance = levenshtein(normalized, key);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = value;
    }
  }
  
  // Calculate similarity score (0-1)
  const maxLen = Math.max(normalized.length, bestMatch.length);
  const similarity = maxLen > 0 ? 1 - (bestDistance / maxLen) : 0;
  
  return { match: bestMatch, similarity: Math.max(0, Math.min(1, similarity)) };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  
  console.log(`🧠 [Learn FN Patterns v${VERSION}] Starting pattern learning cycle...`);

  try {
    const supabase = createAdminClient();
    
    // =========================================================================
    // STEP 1: Aggregate unprocessed unknown functie_niveau events
    // =========================================================================
    const { data: events, error: eventsError } = await supabase
      .from('system_events')
      .select('id, event_data, org_id, created_at')
      .eq('event_type', 'functie_niveau_unknown')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(MAX_EVENTS_PER_CYCLE);
    
    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }
    
    console.log(`📊 [Learn FN] Found ${events?.length || 0} unprocessed events`);
    
    if (!events || events.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No unprocessed events found',
        duration_ms: Date.now() - startTime,
      });
    }
    
    // =========================================================================
    // STEP 2: Group events by raw_value and count occurrences
    // =========================================================================
    interface ValueGroup {
      count: number;
      eventIds: string[];
      orgId: string;
      firstSeen: string;
      lastSeen: string;
    }
    
    const valueGroups = new Map<string, ValueGroup>();
    
    for (const event of events) {
      const rawValue = (event.event_data as any)?.raw_value?.toLowerCase()?.trim();
      if (!rawValue || rawValue.length < 2) continue;
      
      const existing = valueGroups.get(rawValue);
      if (existing) {
        existing.count++;
        existing.eventIds.push(event.id);
        existing.lastSeen = event.created_at;
      } else {
        valueGroups.set(rawValue, {
          count: 1,
          eventIds: [event.id],
          orgId: event.org_id || ORG_IDS.CITOZORG,
          firstSeen: event.created_at,
          lastSeen: event.created_at,
        });
      }
    }
    
    console.log(`📈 [Learn FN] Grouped into ${valueGroups.size} unique values`);
    
    // =========================================================================
    // STEP 3: Process eligible values (>= MIN_OCCURRENCES)
    // =========================================================================
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const processedEventIds: string[] = [];
    
    for (const [rawValue, group] of valueGroups) {
      // Collect event IDs regardless of threshold (mark as processed)
      processedEventIds.push(...group.eventIds);
      
      // Skip if not enough occurrences for reliable pattern
      if (group.count < MIN_OCCURRENCES) {
        skipped++;
        console.log(`⏭️ [Learn FN] Skipped "${rawValue}" (${group.count} < ${MIN_OCCURRENCES} occurrences)`);
        continue;
      }
      
      // Generate unique key for this suggestion
      const suggestionKey = `fn_suggestion_${rawValue.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
      
      // Check if suggestion already exists
      const { data: existing } = await supabase
        .from('ai_knowledge_base')
        .select('id, value, occurrence_count')
        .eq('category', 'functie_niveau_mapping_suggestion')
        .eq('key', suggestionKey)
        .is('deleted_at', null)
        .maybeSingle();
      
      if (existing) {
        // Update occurrence count on existing suggestion
        const newCount = (existing.occurrence_count || 0) + group.count;
        const existingValue = existing.value as any;
        
        await supabase
          .from('ai_knowledge_base')
          .update({ 
            occurrence_count: newCount,
            updated_at: new Date().toISOString(),
            value: {
              ...existingValue,
              last_seen: group.lastSeen,
              occurrence_count: newCount,
            }
          })
          .eq('id', existing.id);
        
        updated++;
        console.log(`🔄 [Learn FN] Updated "${rawValue}" (now ${newCount} occurrences)`);
      } else {
        // Find closest match using Levenshtein
        const { match, similarity } = findClosestMatch(rawValue);
        
        // Calculate confidence based on similarity and occurrence count
        // Higher occurrences = more confidence in the pattern
        const occurrenceBonus = Math.min(0.15, (group.count / 20) * 0.15);
        const confidence = Math.min(0.95, similarity * 0.85 + occurrenceBonus);
        
        // Create new suggestion
        const { error: insertError } = await supabase.from('ai_knowledge_base').insert({
          category: 'functie_niveau_mapping_suggestion',
          key: suggestionKey,
          value: {
            raw_value: rawValue,
            suggested_mapping: match,
            similarity_score: similarity,
            first_seen: group.firstSeen,
            last_seen: group.lastSeen,
            occurrence_count: group.count,
            algorithm: 'levenshtein_v1',
          },
          confidence_score: confidence,
          occurrence_count: group.count,
          needs_review: confidence < 0.85,
          org_id: group.orgId,
          source: 'auto_learned',
          source_type: 'ai_pattern_learning',
        });
        
        if (insertError) {
          console.error(`❌ [Learn FN] Failed to create suggestion for "${rawValue}":`, insertError);
        } else {
          created++;
          console.log(`✨ [Learn FN] Created suggestion: "${rawValue}" → "${match}" (confidence: ${(confidence * 100).toFixed(1)}%)`);
        }
      }
    }
    
    // =========================================================================
    // STEP 4: Mark all processed events
    // =========================================================================
    if (processedEventIds.length > 0) {
      const { error: updateError } = await supabase
        .from('system_events')
        .update({ processed_at: new Date().toISOString() })
        .in('id', processedEventIds);
      
      if (updateError) {
        console.error('⚠️ [Learn FN] Failed to mark events as processed:', updateError);
      } else {
        console.log(`✅ [Learn FN] Marked ${processedEventIds.length} events as processed`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // =========================================================================
    // STEP 5: Log function execution
    // =========================================================================
    await supabase.from('function_call_logs').insert({
      function_name: 'learn-functie-niveau-patterns',
      org_id: ORG_IDS.CITOZORG,
      execution_time_ms: duration,
      success: true,
      metadata: {
        version: VERSION,
        events_processed: events.length,
        unique_values: valueGroups.size,
        suggestions_created: created,
        suggestions_updated: updated,
        skipped_low_occurrence: skipped,
      },
    });
    
    console.log(`🏁 [Learn FN v${VERSION}] Complete in ${duration}ms: ${created} created, ${updated} updated, ${skipped} skipped`);
    
    return jsonResponse({
      success: true,
      version: VERSION,
      duration_ms: duration,
      events_processed: events.length,
      unique_values: valueGroups.size,
      suggestions: {
        created,
        updated,
        skipped,
      },
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [Learn FN v${VERSION}] Error:`, error);
    
    // Log failure
    try {
      const supabase = createAdminClient();
      await supabase.from('function_call_logs').insert({
        function_name: 'learn-functie-niveau-patterns',
        org_id: ORG_IDS.CITOZORG,
        execution_time_ms: duration,
        success: false,
        error_message: error instanceof Error ? error.message : String(error),
        metadata: { version: VERSION },
      });
    } catch (logError) {
      console.error('[Learn FN] Failed to log error:', logError);
    }
    
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
