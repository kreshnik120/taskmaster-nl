/**
 * Knowledge CRUD - Unified Learning Module
 * Uniforme database operaties voor AI Knowledge Base
 * 
 * @module _shared/knowledge-crud
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { 
  CONFIDENCE_RULES, 
  applyConfidenceDelta, 
  clampConfidence,
  shouldPrune,
  type ConfidenceRuleKey 
} from './confidence-calculator.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgePayload {
  category: string;
  key: string;
  value: Record<string, unknown>;
  org_id: string;
  confidence_score?: number;
  user_id?: string;
  source?: string;
  source_type?: string;
  source_url?: string;
  source_reference?: string;
  role_tags?: string[];
  jurisdiction?: string;
  valid_from?: string;
  valid_to?: string;
  client_id?: string;
  training_document_id?: string;
  validation_status?: string;
  needs_review?: boolean;
}

export interface ReinforceOptions {
  stabilityBoost?: number;
  incrementUsage?: boolean;
  updateTimestamp?: boolean;
}

export interface UpdateConfidenceOptions {
  ruleKey: ConfidenceRuleKey;
  reason?: string;
}

export interface SoftDeleteOptions {
  reason: string;
  deletedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  existingId?: string;
  existingValue?: Record<string, unknown>;
  existingConfidence?: number;
  conflictType?: 'exact_match' | 'similar_key' | 'contradicting_value';
}

export interface KnowledgeItem {
  id: string;
  category: string;
  key: string;
  value: Record<string, unknown>;
  confidence_score: number;
  org_id: string;
  helpful_count: number;
  harmful_count: number;
  usage_count: number;
  deleted_at: string | null;
  validation_status: string;
}

// ============================================================================
// PII REDACTION
// ============================================================================

const PII_PATTERNS = [
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[EMAIL]' },
  { pattern: /\b06[-\s]?\d{8}\b/g, replacement: '[TELEFOON]' },
  { pattern: /\b0\d{1,3}[-\s]?\d{6,8}\b/g, replacement: '[TELEFOON]' },
  { pattern: /\+31[-\s]?\d{9,10}/g, replacement: '[TELEFOON]' },
  { pattern: /\b\d{4}\s?[A-Z]{2}\b/gi, replacement: '[POSTCODE]' },
  { pattern: /\b\d{9}\b/g, replacement: '[BSN]' },
  { pattern: /\bNL\d{2}[A-Z]{4}\d{10}\b/gi, replacement: '[IBAN]' },
];

/**
 * Redact PII from text
 */
export function redactPII(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redact PII from knowledge value object
 */
export function redactValuePII(value: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') {
      redacted[key] = redactPII(val);
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      redacted[key] = redactValuePII(val as Record<string, unknown>);
    } else {
      redacted[key] = val;
    }
  }
  
  return redacted;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Check for conflicts with existing knowledge
 */
export async function checkForConflicts(
  supabase: SupabaseClient,
  payload: Pick<KnowledgePayload, 'category' | 'key' | 'org_id' | 'value'>
): Promise<ConflictCheckResult> {
  // Check for exact key match
  const { data: exactMatch, error } = await supabase
    .from('ai_knowledge_base')
    .select('id, key, value, confidence_score')
    .eq('org_id', payload.org_id)
    .eq('category', payload.category)
    .eq('key', payload.key)
    .is('deleted_at', null)
    .maybeSingle();
  
  if (error) {
    console.error('[knowledge-crud] Conflict check error:', error);
    return { hasConflict: false };
  }
  
  if (exactMatch) {
    // Check if values are the same
    const existingValueStr = JSON.stringify(exactMatch.value);
    const newValueStr = JSON.stringify(payload.value);
    
    if (existingValueStr === newValueStr) {
      return {
        hasConflict: true,
        existingId: exactMatch.id,
        existingValue: exactMatch.value,
        existingConfidence: exactMatch.confidence_score,
        conflictType: 'exact_match',
      };
    }
    
    return {
      hasConflict: true,
      existingId: exactMatch.id,
      existingValue: exactMatch.value,
      existingConfidence: exactMatch.confidence_score,
      conflictType: 'contradicting_value',
    };
  }
  
  return { hasConflict: false };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new knowledge item
 * Automatically redacts PII and checks for conflicts
 */
export async function createKnowledge(
  supabase: SupabaseClient,
  payload: KnowledgePayload,
  options?: { skipConflictCheck?: boolean; skipPIIRedaction?: boolean }
): Promise<{ id: string; wasReinforced?: boolean; existingId?: string }> {
  
  // Redact PII unless skipped
  const safeValue = options?.skipPIIRedaction 
    ? payload.value 
    : redactValuePII(payload.value);
  
  // Check for conflicts unless skipped
  if (!options?.skipConflictCheck) {
    const conflict = await checkForConflicts(supabase, {
      category: payload.category,
      key: payload.key,
      org_id: payload.org_id,
      value: safeValue,
    });
    
    if (conflict.hasConflict && conflict.existingId) {
      if (conflict.conflictType === 'exact_match') {
        // Reinforce existing instead of creating duplicate
        await reinforceKnowledge(supabase, conflict.existingId, {
          incrementUsage: true,
          stabilityBoost: 0.05,
        });
        return { 
          id: conflict.existingId, 
          wasReinforced: true, 
          existingId: conflict.existingId 
        };
      }
      
      // For contradicting values, create conflict record
      await supabase.from('data_conflicts').insert({
        org_id: payload.org_id,
        existing_knowledge_id: conflict.existingId,
        conflict_type: 'value_contradiction',
        severity: 'medium',
        conflicting_suggestion: {
          category: payload.category,
          key: payload.key,
          new_value: safeValue,
          existing_value: conflict.existingValue,
        },
        resolution_status: 'pending',
      });
      
      console.log(`[knowledge-crud] Conflict detected for key: ${payload.key}`);
    }
  }
  
  // Insert new knowledge
  const { data, error } = await supabase
    .from('ai_knowledge_base')
    .insert({
      category: payload.category,
      key: payload.key,
      value: safeValue,
      org_id: payload.org_id,
      confidence_score: payload.confidence_score ?? CONFIDENCE_RULES.default_confidence,
      user_id: payload.user_id,
      source: payload.source ?? 'unified-learner',
      source_type: payload.source_type ?? 'auto_learned',
      source_url: payload.source_url,
      source_reference: payload.source_reference,
      role_tags: payload.role_tags ?? [],
      jurisdiction: payload.jurisdiction ?? 'NL',
      valid_from: payload.valid_from ?? new Date().toISOString().split('T')[0],
      valid_to: payload.valid_to,
      client_id: payload.client_id,
      training_document_id: payload.training_document_id,
      validation_status: payload.validation_status ?? 'pending',
      needs_review: payload.needs_review ?? true,
      usage_count: 0,
      helpful_count: 0,
      harmful_count: 0,
      stability_score: 0.5,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('[knowledge-crud] Create error:', error);
    throw new Error(`Failed to create knowledge: ${error.message}`);
  }
  
  console.log(`[knowledge-crud] Created knowledge: ${data.id} (${payload.key})`);
  return { id: data.id };
}

/**
 * Reinforce existing knowledge (increase stability/usage)
 */
export async function reinforceKnowledge(
  supabase: SupabaseClient,
  id: string,
  options: ReinforceOptions = {}
): Promise<void> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  
  if (options.stabilityBoost) {
    // Use RPC or raw SQL for atomic increment
    const { data: current } = await supabase
      .from('ai_knowledge_base')
      .select('stability_score')
      .eq('id', id)
      .single();
    
    const currentStability = current?.stability_score ?? 0.5;
    updates.stability_score = Math.min(
      CONFIDENCE_RULES.max_stability,
      currentStability + options.stabilityBoost
    );
  }
  
  if (options.incrementUsage) {
    // Atomic increment for usage_count
    const { data: current } = await supabase
      .from('ai_knowledge_base')
      .select('usage_count')
      .eq('id', id)
      .single();
    
    updates.usage_count = (current?.usage_count ?? 0) + 1;
    updates.last_used_at = new Date().toISOString();
  }
  
  const { error } = await supabase
    .from('ai_knowledge_base')
    .update(updates)
    .eq('id', id);
  
  if (error) {
    console.error('[knowledge-crud] Reinforce error:', error);
    throw new Error(`Failed to reinforce knowledge: ${error.message}`);
  }
  
  console.log(`[knowledge-crud] Reinforced knowledge: ${id}`);
}

/**
 * Update confidence score based on a rule
 */
export async function updateConfidence(
  supabase: SupabaseClient,
  id: string,
  options: UpdateConfidenceOptions
): Promise<{ newConfidence: number; wasPruned: boolean }> {
  // Get current confidence
  const { data: current, error: fetchError } = await supabase
    .from('ai_knowledge_base')
    .select('confidence_score, helpful_count, harmful_count')
    .eq('id', id)
    .single();
  
  if (fetchError || !current) {
    throw new Error(`Failed to fetch knowledge for confidence update: ${fetchError?.message}`);
  }
  
  const newConfidence = applyConfidenceDelta(
    current.confidence_score ?? CONFIDENCE_RULES.default_confidence,
    options.ruleKey
  );
  
  // Check if should be pruned
  const wasPruned = shouldPrune(
    current.helpful_count ?? 0,
    current.harmful_count ?? 0
  ) || newConfidence < CONFIDENCE_RULES.prune_threshold;
  
  if (wasPruned) {
    // Soft delete instead of hard delete
    await softDeleteKnowledge(supabase, id, {
      reason: `Auto-pruned: confidence=${newConfidence.toFixed(2)}, rule=${options.ruleKey}`,
    });
    return { newConfidence, wasPruned: true };
  }
  
  // Update confidence
  const { error: updateError } = await supabase
    .from('ai_knowledge_base')
    .update({
      confidence_score: newConfidence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (updateError) {
    throw new Error(`Failed to update confidence: ${updateError.message}`);
  }
  
  console.log(`[knowledge-crud] Updated confidence: ${id} -> ${newConfidence.toFixed(2)} (${options.ruleKey})`);
  return { newConfidence, wasPruned: false };
}

/**
 * Increment feedback count (helpful or harmful)
 */
export async function incrementFeedbackCount(
  supabase: SupabaseClient,
  id: string,
  type: 'helpful' | 'harmful'
): Promise<{ shouldPrune: boolean }> {
  const column = type === 'helpful' ? 'helpful_count' : 'harmful_count';
  
  // Get current counts
  const { data: current, error: fetchError } = await supabase
    .from('ai_knowledge_base')
    .select('helpful_count, harmful_count')
    .eq('id', id)
    .single();
  
  if (fetchError || !current) {
    throw new Error(`Failed to fetch knowledge for feedback: ${fetchError?.message}`);
  }
  
  const newHelpful = type === 'helpful' 
    ? (current.helpful_count ?? 0) + 1 
    : (current.helpful_count ?? 0);
  const newHarmful = type === 'harmful' 
    ? (current.harmful_count ?? 0) + 1 
    : (current.harmful_count ?? 0);
  
  // Update count
  const { error: updateError } = await supabase
    .from('ai_knowledge_base')
    .update({
      [column]: type === 'helpful' ? newHelpful : newHarmful,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (updateError) {
    throw new Error(`Failed to increment feedback: ${updateError.message}`);
  }
  
  const shouldPruneNow = shouldPrune(newHelpful, newHarmful);
  
  console.log(`[knowledge-crud] Feedback ${type} for ${id}: helpful=${newHelpful}, harmful=${newHarmful}`);
  return { shouldPrune: shouldPruneNow };
}

/**
 * Soft delete a knowledge item
 */
export async function softDeleteKnowledge(
  supabase: SupabaseClient,
  id: string,
  options: SoftDeleteOptions
): Promise<void> {
  const { error } = await supabase
    .from('ai_knowledge_base')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: options.deletedBy,
      deletion_reason: {
        reason: options.reason,
        metadata: options.metadata,
        timestamp: new Date().toISOString(),
      },
    })
    .eq('id', id);
  
  if (error) {
    throw new Error(`Failed to soft delete knowledge: ${error.message}`);
  }
  
  console.log(`[knowledge-crud] Soft deleted: ${id} (${options.reason})`);
}

/**
 * Restore a soft-deleted knowledge item
 */
export async function restoreKnowledge(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('ai_knowledge_base')
    .update({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (error) {
    throw new Error(`Failed to restore knowledge: ${error.message}`);
  }
  
  console.log(`[knowledge-crud] Restored: ${id}`);
}

/**
 * Batch update confidence for multiple items
 */
export async function batchUpdateConfidence(
  supabase: SupabaseClient,
  updates: Array<{ id: string; ruleKey: ConfidenceRuleKey }>
): Promise<{ updated: number; pruned: number }> {
  let updated = 0;
  let pruned = 0;
  
  for (const { id, ruleKey } of updates) {
    try {
      const result = await updateConfidence(supabase, id, { ruleKey });
      if (result.wasPruned) {
        pruned++;
      } else {
        updated++;
      }
    } catch (error) {
      console.error(`[knowledge-crud] Batch update failed for ${id}:`, error);
    }
  }
  
  return { updated, pruned };
}

/**
 * Get knowledge items by IDs
 */
export async function getKnowledgeByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<KnowledgeItem[]> {
  if (ids.length === 0) return [];
  
  const { data, error } = await supabase
    .from('ai_knowledge_base')
    .select('id, category, key, value, confidence_score, org_id, helpful_count, harmful_count, usage_count, deleted_at, validation_status')
    .in('id', ids);
  
  if (error) {
    console.error('[knowledge-crud] Get by IDs error:', error);
    return [];
  }
  
  return data ?? [];
}
