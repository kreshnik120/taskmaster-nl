// Apply Meta-Patterns Edge Function
// Applies unapplied meta-patterns to knowledge items to improve categorization and confidence
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { CONFIDENCE_RULES, clampConfidence } from '../_shared/confidence-calculator.ts';

const BATCH_SIZE = 50; // Max patterns per run
const MAX_ITEMS_PER_PATTERN = 20; // Max items affected per pattern
const MIN_PATTERN_CONFIDENCE = 0.85;
const MIN_PATTERN_OCCURRENCES = 100;

interface MetaPattern {
  id: string;
  pattern_description: string;
  suggested_category: string | null;
  confidence: number | null;
  occurrences: number | null;
  org_id: string;
}

interface ApplyResult {
  pattern_id: string;
  items_affected: number;
  category_updated: string | null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log('🔄 [apply-meta-patterns] Starting meta-pattern application...');

  try {
    const supabase = createAdminClient();
    const results: ApplyResult[] = [];
    let totalItemsAffected = 0;
    let patternsProcessed = 0;

    // Step 1: Get unapplied high-confidence patterns
    const { data: patterns, error: patternsError } = await supabase
      .from('ai_meta_patterns')
      .select('id, pattern_description, suggested_category, confidence, occurrences, org_id')
      .is('applied_at', null)
      .gte('confidence', MIN_PATTERN_CONFIDENCE)
      .gte('occurrences', MIN_PATTERN_OCCURRENCES)
      .order('confidence', { ascending: false })
      .order('occurrences', { ascending: false })
      .limit(BATCH_SIZE);

    if (patternsError) {
      console.error('❌ [apply-meta-patterns] Failed to fetch patterns:', patternsError);
      return errorResponse(patternsError.message, 500);
    }

    if (!patterns || patterns.length === 0) {
      console.log('✅ [apply-meta-patterns] No unapplied patterns found');
      return jsonResponse({
        success: true,
        message: 'No unapplied patterns to process',
        patterns_processed: 0,
        items_affected: 0,
        duration_ms: Date.now() - startTime
      });
    }

    console.log(`📋 [apply-meta-patterns] Found ${patterns.length} patterns to process`);

    // Step 2: Process each pattern
    for (const pattern of patterns as MetaPattern[]) {
      try {
        const patternResult = await applyPattern(supabase, pattern);
        results.push(patternResult);
        totalItemsAffected += patternResult.items_affected;
        patternsProcessed++;

        // Mark pattern as applied
        const { error: updateError } = await supabase
          .from('ai_meta_patterns')
          .update({
            applied_at: new Date().toISOString(),
            last_applied_at: new Date().toISOString(),
            items_affected: patternResult.items_affected
          })
          .eq('id', pattern.id);

        if (updateError) {
          console.warn(`⚠️ [apply-meta-patterns] Failed to mark pattern ${pattern.id} as applied:`, updateError);
        }

        console.log(`✓ Pattern ${pattern.id}: ${patternResult.items_affected} items affected`);
      } catch (err) {
        console.error(`❌ [apply-meta-patterns] Error processing pattern ${pattern.id}:`, err);
      }
    }

    // Step 3: Log the run
    try {
      await supabase.from('function_call_logs').insert({
        function_name: 'apply-meta-patterns',
        status: 'success',
        execution_time_ms: Date.now() - startTime,
        input_data: { batch_size: BATCH_SIZE, patterns_found: patterns.length },
        output_data: {
          patterns_processed: patternsProcessed,
          total_items_affected: totalItemsAffected,
          results: results.slice(0, 10) // Top 10 for logging
        },
        org_id: '550e8400-e29b-41d4-a716-446655440000'
      });
    } catch (logErr) {
      console.warn('⚠️ [apply-meta-patterns] Failed to log run:', logErr);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [apply-meta-patterns] Completed in ${duration}ms - ${patternsProcessed} patterns, ${totalItemsAffected} items`);

    return jsonResponse({
      success: true,
      patterns_processed: patternsProcessed,
      total_items_affected: totalItemsAffected,
      results: results,
      duration_ms: duration
    });

  } catch (error) {
    console.error('❌ [apply-meta-patterns] Fatal error:', error);
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});

/**
 * Apply a single meta-pattern to matching knowledge items
 */
async function applyPattern(supabase: any, pattern: MetaPattern): Promise<ApplyResult> {
  const result: ApplyResult = {
    pattern_id: pattern.id,
    items_affected: 0,
    category_updated: pattern.suggested_category
  };

  if (!pattern.suggested_category) {
    return result;
  }

  // Extract keywords from pattern description for matching
  const keywords = extractKeywords(pattern.pattern_description);
  if (keywords.length === 0) {
    return result;
  }

  // Find matching knowledge items that could benefit from category update
  // Target: items with generic categories or low confidence that match pattern keywords
  const { data: items, error: itemsError } = await supabase
    .from('ai_knowledge_base')
    .select('id, key, category, confidence_score, value')
    .eq('org_id', pattern.org_id)
    .is('deleted_at', null)
    .or(`category.eq.algemeen,category.eq.overig,category.eq.unknown,category.is.null`)
    .limit(MAX_ITEMS_PER_PATTERN);

  if (itemsError || !items) {
    console.warn(`⚠️ [apply-meta-patterns] Failed to fetch items for pattern ${pattern.id}:`, itemsError);
    return result;
  }

  // Filter items that match the pattern keywords
  const matchingItems = items.filter((item: any) => {
    const itemText = `${item.key} ${JSON.stringify(item.value)}`.toLowerCase();
    return keywords.some(kw => itemText.includes(kw.toLowerCase()));
  });

  if (matchingItems.length === 0) {
    return result;
  }

  // Update matching items
  for (const item of matchingItems) {
    const newConfidence = clampConfidence(
      (item.confidence_score || CONFIDENCE_RULES.default_confidence) + 0.02
    );

    const { error: updateError } = await supabase
      .from('ai_knowledge_base')
      .update({
        category: pattern.suggested_category,
        confidence_score: newConfidence,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (!updateError) {
      result.items_affected++;

      // Log version for audit trail
      try {
        await supabase.from('ai_knowledge_versions').insert({
          knowledge_id: item.id,
          version_number: 1, // Will be corrected by trigger
          category: pattern.suggested_category,
          key: item.key,
          value: item.value,
          confidence_score: newConfidence,
          change_type: 'meta_pattern_applied',
          change_reason: `Meta-pattern: ${pattern.pattern_description.substring(0, 100)}`,
          ai_action_context: {
            pattern_id: pattern.id,
            pattern_confidence: pattern.confidence,
            pattern_occurrences: pattern.occurrences
          }
        });
      } catch (versionErr) {
        // Non-critical, continue
      }
    }
  }

  return result;
}

/**
 * Extract meaningful keywords from pattern description
 */
function extractKeywords(description: string): string[] {
  // Remove common Dutch stop words and extract meaningful terms
  const stopWords = new Set([
    'de', 'het', 'een', 'van', 'en', 'in', 'is', 'op', 'te', 'dat', 'die',
    'voor', 'met', 'zijn', 'wordt', 'aan', 'er', 'naar', 'of', 'om', 'ook',
    'als', 'maar', 'bij', 'nog', 'wel', 'dan', 'wat', 'kan', 'al', 'uit',
    'pattern', 'detected', 'often', 'appears', 'with', 'frequently', 'common'
  ]);

  const words = description
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  // Return unique keywords (max 5)
  return [...new Set(words)].slice(0, 5);
}
