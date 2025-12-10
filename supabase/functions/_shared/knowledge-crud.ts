/**
 * Knowledge CRUD - Unified Learning Module
 * Uniforme database operaties voor AI Knowledge Base
 * 
 * FASE 2: Nu met atomische RPC's voor race condition prevention
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
import { anonymizePII } from './telemetry.ts';

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
// PII REDACTION - Uses telemetry.ts as single source of truth
// ============================================================================

/**
 * Redact PII from knowledge value object
 * Uses anonymizePII from telemetry.ts for consistency
 */
export function redactValuePII(value: Record<string, unknown>): Record<string, unknown> {
  return anonymizePII(value) as Record<string, unknown>;
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
// CRUD OPERATIONS - Now using atomic RPCs
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
  
  // Redact PII unless skipped - uses telemetry.ts
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
 * Reinforce existing knowledge using ATOMIC RPC
 * Prevents race conditions with concurrent reinforcements
 */
export async function reinforceKnowledge(
  supabase: SupabaseClient,
  id: string,
  options: ReinforceOptions = {}
): Promise<{ newStability: number; newUsageCount: number }> {
  const { data, error } = await supabase.rpc('atomic_reinforce_knowledge', {
    p_knowledge_id: id,
    p_stability_boost: options.stabilityBoost ?? 0.05,
    p_increment_usage: options.incrementUsage ?? true,
    p_max_stability: CONFIDENCE_RULES.max_stability,
  });
  
  if (error) {
    console.error('[knowledge-crud] Reinforce error:', error);
    throw new Error(`Failed to reinforce knowledge: ${error.message}`);
  }
  
  const result = data?.[0] ?? { new_stability: 0.5, new_usage_count: 0 };
  console.log(`[knowledge-crud] Reinforced: ${id} -> stability=${result.new_stability}`);
  
  return { 
    newStability: result.new_stability, 
    newUsageCount: result.new_usage_count 
  };
}

/**
 * Update confidence score using ATOMIC RPC
 * Prevents race conditions with concurrent confidence updates
 */
export async function updateConfidence(
  supabase: SupabaseClient,
  id: string,
  options: UpdateConfidenceOptions
): Promise<{ newConfidence: number; wasPruned: boolean; oldConfidence: number }> {
  // Get delta from rule
  const delta = CONFIDENCE_RULES[options.ruleKey] ?? 0;
  
  const { data, error } = await supabase.rpc('atomic_update_confidence', {
    p_knowledge_id: id,
    p_delta: delta,
    p_min_confidence: CONFIDENCE_RULES.min_confidence,
    p_max_confidence: CONFIDENCE_RULES.max_confidence,
    p_prune_threshold: CONFIDENCE_RULES.prune_threshold,
    p_reason: options.reason ?? `Rule applied: ${options.ruleKey}`,
  });
  
  if (error) {
    console.error('[knowledge-crud] updateConfidence error:', error);
    throw new Error(`Failed to update confidence: ${error.message}`);
  }
  
  const result = data?.[0] ?? { new_confidence: 0.7, was_pruned: false, old_confidence: 0.7 };
  
  console.log(`[knowledge-crud] Confidence updated: ${id} ${result.old_confidence} -> ${result.new_confidence} (${options.ruleKey})`);
  
  return { 
    newConfidence: result.new_confidence, 
    wasPruned: result.was_pruned,
    oldConfidence: result.old_confidence,
  };
}

/**
 * Increment feedback count using ATOMIC RPC
 * Prevents race conditions with concurrent feedback
 */
export async function incrementFeedbackCount(
  supabase: SupabaseClient,
  id: string,
  type: 'helpful' | 'harmful'
): Promise<{ shouldPrune: boolean; helpfulCount: number; harmfulCount: number }> {
  const { data, error } = await supabase.rpc('atomic_increment_feedback', {
    p_knowledge_id: id,
    p_feedback_type: type,
    p_harmful_prune_min_votes: CONFIDENCE_RULES.harmful_prune_min_votes,
    p_harmful_prune_ratio: CONFIDENCE_RULES.harmful_prune_ratio,
  });
  
  if (error) {
    console.error('[knowledge-crud] incrementFeedbackCount error:', error);
    throw new Error(`Failed to increment feedback: ${error.message}`);
  }
  
  const result = data?.[0] ?? { new_helpful_count: 0, new_harmful_count: 0, should_prune: false };
  
  console.log(`[knowledge-crud] Feedback ${type}: helpful=${result.new_helpful_count}, harmful=${result.new_harmful_count}`);
  
  return { 
    shouldPrune: result.should_prune,
    helpfulCount: result.new_helpful_count,
    harmfulCount: result.new_harmful_count,
  };
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
 * Uses individual atomic calls to prevent race conditions
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
    } catch (e) {
      console.error(`[knowledge-crud] Batch update failed for ${id}:`, e);
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
    console.error('[knowledge-crud] getKnowledgeByIds error:', error);
    return [];
  }
  
  return (data ?? []) as KnowledgeItem[];
}
