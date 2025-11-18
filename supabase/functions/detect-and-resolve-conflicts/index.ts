import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConflictCheckResult {
  hasConflict: boolean;
  shouldReject: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  existingKnowledge?: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { suggestion, org_id } = await req.json();

    console.log('🔍 Checking conflicts for:', {
      category: suggestion.category,
      key: suggestion.key,
      entity: extractEntity(suggestion.key)
    });

    // 1. Check if knowledge item with same key exists
    const { data: existing, error: fetchError } = await supabase
      .from('ai_knowledge_base')
      .select('*')
      .eq('org_id', org_id)
      .eq('category', suggestion.category)
      .eq('key', suggestion.key)
      .is('deleted_at', null)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    // If no existing knowledge, no conflict
    if (!existing) {
      console.log('✅ No existing knowledge found - no conflict');
      return new Response(
        JSON.stringify({
          hasConflict: false,
          shouldReject: false,
          canProceed: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check for conflicts
    const result = await checkForConflicts(supabase, org_id, existing, suggestion);

    // 3. If conflict detected, log it
    if (result.hasConflict) {
      await logConflict(supabase, org_id, existing.id, suggestion, result);
    }

    // 4. If should reject, create business intelligence alert
    if (result.shouldReject) {
      await createAlert(supabase, org_id, existing, suggestion, result);
    }

    console.log('🎯 Conflict check result:', result);

    return new Response(
      JSON.stringify({
        ...result,
        canProceed: !result.shouldReject
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in conflict detection:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function checkForConflicts(
  supabase: any,
  org_id: string,
  existing: any,
  suggestion: any
): Promise<ConflictCheckResult> {
  const entity = extractEntity(suggestion.key);
  const field = extractField(suggestion.key);

  // Check 1: Value mismatch with high stability data
  const valuesDiffer = JSON.stringify(existing.value) !== JSON.stringify(suggestion.value);
  
  if (!valuesDiffer) {
    return {
      hasConflict: false,
      shouldReject: false,
      severity: 'low'
    };
  }

  // Check 2: Stability score check (addresses/KVK = 0.95+)
  const isHighStability = existing.stability_score >= 0.95;
  
  if (isHighStability) {
    console.log('⚠️ High stability data conflict detected');
    
    // Check 3: Source type hierarchy (manual > verified > document > ai_generated)
    const sourceHierarchy = {
      'verified_correction': 4,
      'manual': 3,
      'document': 2,
      'api': 2,
      'ai_generated': 1
    };

    const existingPriority = sourceHierarchy[existing.source_type as keyof typeof sourceHierarchy] || 0;
    const suggestionPriority = sourceHierarchy[suggestion.source_type as keyof typeof sourceHierarchy] || 0;

    if (existingPriority > suggestionPriority) {
      return {
        hasConflict: true,
        shouldReject: true,
        reason: `Existing data has higher authority (${existing.source_type} > ${suggestion.source_type})`,
        severity: 'high',
        existingKnowledge: existing
      };
    }
  }

  // Check 4: Correction patterns - is new value in "always_wrong" patterns?
  const { data: wrongPatterns } = await supabase
    .from('correction_patterns')
    .select('*')
    .eq('org_id', org_id)
    .eq('entity', entity)
    .eq('field', field)
    .eq('pattern_type', 'always_wrong');

  if (wrongPatterns && wrongPatterns.length > 0) {
    for (const pattern of wrongPatterns) {
      if (matchesPattern(suggestion.value, pattern.pattern_value)) {
        console.log('🚫 Suggestion matches "always_wrong" pattern:', pattern);
        return {
          hasConflict: true,
          shouldReject: true,
          reason: `New value matches known incorrect pattern (learned from ${pattern.learned_from_corrections} corrections)`,
          severity: 'critical',
          existingKnowledge: existing
        };
      }
    }
  }

  // Check 5: Is existing value in "always_correct" patterns?
  const { data: correctPatterns } = await supabase
    .from('correction_patterns')
    .select('*')
    .eq('org_id', org_id)
    .eq('entity', entity)
    .eq('field', field)
    .eq('pattern_type', 'always_correct');

  if (correctPatterns && correctPatterns.length > 0) {
    for (const pattern of correctPatterns) {
      if (matchesPattern(existing.value, pattern.pattern_value)) {
        console.log('✅ Existing value matches "always_correct" pattern:', pattern);
        return {
          hasConflict: true,
          shouldReject: true,
          reason: `Existing value is validated as correct (learned from ${pattern.learned_from_corrections} corrections)`,
          severity: 'high',
          existingKnowledge: existing
        };
      }
    }
  }

  // Check 6: Historical usage without complaints (high trust)
  const usageCount = existing.usage_count || 0;
  const harmfulCount = existing.harmful_count || 0;
  const helpfulCount = existing.helpful_count || 0;

  if (usageCount >= 10 && harmfulCount === 0 && helpfulCount > 5) {
    return {
      hasConflict: true,
      shouldReject: true,
      reason: `Existing value has high trust (used ${usageCount}x with ${helpfulCount} positive feedback)`,
      severity: 'medium',
      existingKnowledge: existing
    };
  }

  // Check 7: Recent corrections (less than 7 days ago)
  if (existing.last_correction && existing.correction_count > 0) {
    const lastCorrectionDate = new Date(existing.last_correction.timestamp);
    const daysSinceCorrection = (Date.now() - lastCorrectionDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceCorrection < 7) {
      return {
        hasConflict: true,
        shouldReject: true,
        reason: `Data was manually corrected ${Math.floor(daysSinceCorrection)} days ago`,
        severity: 'high',
        existingKnowledge: existing
      };
    }
  }

  // Default: conflict exists but allow with warning
  return {
    hasConflict: true,
    shouldReject: false,
    reason: 'Value differs but no strong reason to reject',
    severity: 'low',
    existingKnowledge: existing
  };
}

async function logConflict(
  supabase: any,
  org_id: string,
  existing_knowledge_id: string,
  suggestion: any,
  result: ConflictCheckResult
) {
  const { error } = await supabase
    .from('data_conflicts')
    .insert({
      org_id,
      existing_knowledge_id,
      conflicting_suggestion: suggestion,
      conflict_type: determineConflictType(result.reason || ''),
      severity: result.severity,
      resolution_status: result.shouldReject ? 'auto_resolved' : 'pending',
      resolution_action: result.shouldReject ? 'Rejected due to: ' + result.reason : null,
      resolved_at: result.shouldReject ? new Date().toISOString() : null,
      metadata: {
        existing_value: result.existingKnowledge?.value,
        suggested_value: suggestion.value,
        reason: result.reason
      }
    });

  if (error) {
    console.error('Error logging conflict:', error);
  }
}

async function createAlert(
  supabase: any,
  org_id: string,
  existing: any,
  suggestion: any,
  result: ConflictCheckResult
) {
  const { error } = await supabase
    .from('business_intelligence')
    .insert({
      org_id,
      intelligence_type: 'conflict',
      type: 'alert',
      severity: result.severity === 'critical' ? 'high' : result.severity,
      status: 'active',
      title: `🚨 Kennisconflict gedetecteerd: ${existing.key}`,
      description: `AI probeerde ${existing.key} te wijzigen maar dit werd geblokkeerd.\n\nReden: ${result.reason}`,
      data: {
        category: 'knowledge_conflict',
        existing_id: existing.id,
        existing_value: existing.value,
        suggested_value: suggestion.value,
        conflict_reason: result.reason,
        source_type_existing: existing.source_type,
        source_type_suggested: suggestion.source_type,
        stability_score: existing.stability_score
      }
    });

  if (error) {
    console.error('Error creating alert:', error);
  }
}

function extractEntity(key: string): string {
  // Extract entity from key like "CitoZorg_adres" -> "CitoZorg"
  const parts = key.split('_');
  return parts[0] || key;
}

function extractField(key: string): string {
  // Extract field from key like "CitoZorg_adres" -> "adres"
  const parts = key.split('_');
  return parts.slice(1).join('_') || key;
}

function matchesPattern(value: any, pattern: any): boolean {
  if (typeof value === 'string') {
    if (pattern.contains) {
      return value.toLowerCase().includes(pattern.contains.toLowerCase());
    }
    if (pattern.equals) {
      return value.toLowerCase() === pattern.equals.toLowerCase();
    }
    if (pattern.postcode_prefix) {
      return value.startsWith(pattern.postcode_prefix);
    }
  }
  
  if (typeof value === 'object' && value !== null) {
    // For nested values like {bezoekadres: "..."}
    const valueStr = JSON.stringify(value).toLowerCase();
    if (pattern.contains) {
      return valueStr.includes(pattern.contains.toLowerCase());
    }
  }
  
  return false;
}

function determineConflictType(reason: string): string {
  if (reason.includes('authority') || reason.includes('source')) return 'source_unreliable';
  if (reason.includes('stability') || reason.includes('corrected')) return 'stability_violation';
  if (reason.includes('pattern') || reason.includes('incorrect')) return 'pattern_violation';
  return 'value_mismatch';
}