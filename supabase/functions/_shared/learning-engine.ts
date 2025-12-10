/**
 * Learning Engine - Unified Learning Module
 * Abstractie van alle leerlogica voor AI systeem
 * 
 * @module _shared/learning-engine
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { 
  CONFIDENCE_RULES,
  applyConfidenceDelta,
  calculatePipelineWeight,
  calculateEvaluationWeight,
  isEligibleForAutoApply,
  isEligibleForRetroactiveApply,
} from './confidence-calculator.ts';
import {
  createKnowledge,
  reinforceKnowledge,
  updateConfidence,
  incrementFeedbackCount,
  softDeleteKnowledge,
  getKnowledgeByIds,
  redactPII,
  redactValuePII,
  type KnowledgePayload,
} from './knowledge-crud.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface AnalyzeChatPayload {
  user_question: string;
  ai_response: string;
  knowledge_used?: string[];
  user_feedback?: 'helpful' | 'harmful' | null;
  org_id?: string;
  user_id?: string;
  conversation_id?: string;
}

export interface ProcessFeedbackPayload {
  message_id?: string;
  feedback: 'helpful' | 'harmful';
  knowledge_ids?: string[];
  context?: Record<string, unknown>;
  org_id?: string;
  user_id?: string;
  batch_mode?: boolean;
}

export interface PipelineLearningPayload {
  days_back?: number;
  org_id?: string;
}

export interface RetroactiveScanPayload {
  min_confidence?: number;
  max_confidence?: number;
  limit?: number;
}

export interface LearningOptions {
  auto_apply?: boolean;
  dry_run?: boolean;
  skip_conflict_check?: boolean;
}

export interface LearningResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  pruned: number;
  skipped: number;
  errors: string[];
  details?: Record<string, unknown>;
}

// ============================================================================
// ANALYZE CHAT LEARNING
// Leert van chat interacties - vervangt continuous-learner logica
// ============================================================================

export async function analyzeChatLearning(
  supabase: SupabaseClient,
  payload: AnalyzeChatPayload,
  options: LearningOptions = {}
): Promise<LearningResult> {
  const result: LearningResult = {
    success: true,
    processed: 0,
    created: 0,
    updated: 0,
    pruned: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const { user_question, ai_response, knowledge_used, user_feedback, org_id, user_id } = payload;

    if (!user_question || !ai_response) {
      return { ...result, success: false, errors: ['Missing user_question or ai_response'] };
    }

    // Redact PII from question and response
    const safeQuestion = redactPII(user_question);
    const safeResponse = redactPII(ai_response);

    // Process user feedback if provided
    if (user_feedback && knowledge_used && knowledge_used.length > 0) {
      const ruleKey = user_feedback === 'helpful' ? 'positive_feedback' : 'negative_feedback';
      
      for (const knowledgeId of knowledge_used) {
        try {
          // Increment feedback count
          const feedbackResult = await incrementFeedbackCount(supabase, knowledgeId, user_feedback);
          
          // Update confidence
          const confidenceResult = await updateConfidence(supabase, knowledgeId, { ruleKey });
          
          result.updated++;
          result.processed++;
          
          if (confidenceResult.wasPruned || feedbackResult.shouldPrune) {
            result.pruned++;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to update ${knowledgeId}: ${errorMessage}`);
        }
      }
    }

    // Log learning event
    if (org_id) {
      await supabase.from('ai_learning_events').insert({
        org_id,
        user_id,
        event_type: 'chat_learning',
        context: {
          question_length: safeQuestion.length,
          response_length: safeResponse.length,
          knowledge_used_count: knowledge_used?.length ?? 0,
          feedback: user_feedback,
        },
        confidence_score: user_feedback === 'helpful' ? 0.8 : user_feedback === 'harmful' ? 0.4 : 0.6,
        applied_to_knowledge_base: result.updated > 0,
      });
    }

    // If auto_apply and we have enough context, try to extract new knowledge
    if (options.auto_apply && org_id && !options.dry_run) {
      // Simple pattern: if feedback is helpful, boost used knowledge
      // More complex AI analysis would go here in production
      if (user_feedback === 'helpful' && knowledge_used && knowledge_used.length > 0) {
        for (const knowledgeId of knowledge_used) {
          try {
            await reinforceKnowledge(supabase, knowledgeId, {
              stabilityBoost: CONFIDENCE_RULES.stability_boost * 0.5,
              incrementUsage: true,
            });
          } catch (error) {
            console.warn(`[learning-engine] Reinforce failed for ${knowledgeId}:`, error);
          }
        }
      }
    }

    result.details = {
      question_analyzed: true,
      feedback_processed: !!user_feedback,
      knowledge_items_affected: knowledge_used?.length ?? 0,
    };

  } catch (error: unknown) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error('[learning-engine] analyzeChatLearning error:', error);
  }

  return result;
}

// ============================================================================
// PROCESS FEEDBACK LEARNING
// Verwerkt directe feedback - vervangt feedback-processor en process-feedback
// ============================================================================

export async function processFeedbackLearning(
  supabase: SupabaseClient,
  payload: ProcessFeedbackPayload,
  options: LearningOptions = {}
): Promise<LearningResult> {
  const result: LearningResult = {
    success: true,
    processed: 0,
    created: 0,
    updated: 0,
    pruned: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const { feedback, knowledge_ids, message_id, org_id, user_id, batch_mode } = payload;

    // Batch mode: process all pending feedback
    if (batch_mode) {
      const { data: pendingFeedback, error: fetchError } = await supabase
        .from('ai_chat_feedback')
        .select('id, feedback_type, knowledge_ids, message_id, user_id')
        .order('created_at', { ascending: true })
        .limit(100);

      if (fetchError) {
        return { ...result, success: false, errors: [fetchError.message] };
      }

      for (const fb of pendingFeedback ?? []) {
        const knowledgeIds = fb.knowledge_ids ?? [];
        const feedbackType = fb.feedback_type as 'helpful' | 'harmful';
        
        for (const kId of knowledgeIds) {
          try {
            await incrementFeedbackCount(supabase, kId, feedbackType);
            const ruleKey = feedbackType === 'helpful' ? 'positive_feedback' : 'negative_feedback';
            const confResult = await updateConfidence(supabase, kId, { ruleKey });
            
            result.updated++;
            if (confResult.wasPruned) result.pruned++;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(`Batch update failed for ${kId}: ${errorMessage}`);
          }
        }
        result.processed++;
      }

      return result;
    }

    // Single feedback processing
    if (!feedback) {
      return { ...result, success: false, errors: ['Missing feedback type'] };
    }

    const targetKnowledgeIds = knowledge_ids ?? [];

    // If message_id provided, get knowledge from message metadata
    if (message_id && targetKnowledgeIds.length === 0) {
      const { data: message } = await supabase
        .from('ai_chat_messages')
        .select('used_knowledge')
        .eq('message_id', message_id)
        .maybeSingle();

      if (message?.used_knowledge) {
        const usedKnowledge = message.used_knowledge as Array<{ id?: string }>;
        for (const k of usedKnowledge) {
          if (k.id) targetKnowledgeIds.push(k.id);
        }
      }
    }

    if (targetKnowledgeIds.length === 0) {
      return { ...result, skipped: 1, details: { reason: 'no_knowledge_ids' } };
    }

    const ruleKey = feedback === 'helpful' ? 'positive_feedback' : 'negative_feedback';

    for (const knowledgeId of targetKnowledgeIds) {
      try {
        await incrementFeedbackCount(supabase, knowledgeId, feedback);
        const confResult = await updateConfidence(supabase, knowledgeId, { ruleKey });
        
        result.updated++;
        result.processed++;
        
        if (confResult.wasPruned) {
          result.pruned++;
          
          // Create alert for pruned knowledge
          if (org_id) {
            await supabase.from('business_intelligence').insert({
              org_id,
              intelligence_type: 'knowledge_pruned',
              title: 'Kennisitem automatisch verwijderd',
              description: `Item ${knowledgeId} is verwijderd door negatieve feedback`,
              severity: 'info',
              status: 'active',
              data: { knowledge_id: knowledgeId, reason: 'harmful_feedback_threshold' },
            });
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to process ${knowledgeId}: ${errorMessage}`);
      }
    }

    // Log learning event
    if (org_id) {
      await supabase.from('ai_learning_events').insert({
        org_id,
        user_id,
        event_type: 'feedback_learning',
        context: {
          feedback_type: feedback,
          knowledge_count: targetKnowledgeIds.length,
          message_id,
        },
        confidence_score: feedback === 'helpful' ? 0.9 : 0.3,
        applied_to_knowledge_base: true,
      });
    }

  } catch (error: unknown) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error('[learning-engine] processFeedbackLearning error:', error);
  }

  return result;
}

// ============================================================================
// PIPELINE LEARNING
// Leert van recruitment pipeline events - vervangt learn-from-pipeline
// ============================================================================

export async function pipelineLearning(
  supabase: SupabaseClient,
  payload: PipelineLearningPayload,
  options: LearningOptions = {}
): Promise<LearningResult> {
  const result: LearningResult = {
    success: true,
    processed: 0,
    created: 0,
    updated: 0,
    pruned: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const daysBack = payload.days_back ?? 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Fetch recent pipeline events
    const { data: events, error: eventsError } = await supabase
      .from('system_events')
      .select('id, event_type, event_data, metadata, org_id, created_at')
      .gte('created_at', cutoffDate.toISOString())
      .in('event_type', ['application_stage_changed', 'pipeline_stage_changed'])
      .eq('is_test_data', false)
      .order('created_at', { ascending: true })
      .limit(500);

    if (eventsError) {
      return { ...result, success: false, errors: [eventsError.message] };
    }

    // Process each event
    for (const event of events ?? []) {
      try {
        const eventData = event.event_data as Record<string, unknown>;
        const newStage = (eventData?.new_stage ?? eventData?.pipeline_stage ?? '') as string;
        const weight = calculatePipelineWeight(newStage);

        if (Math.abs(weight) < 0.01) {
          result.skipped++;
          continue;
        }

        // Extract pattern characteristics
        const functieNiveau = eventData?.functie_niveau ?? eventData?.function_level;
        const werkvorm = eventData?.werkvorm ?? eventData?.work_type;
        const regio = eventData?.regio ?? eventData?.region;

        if (!functieNiveau) {
          result.skipped++;
          continue;
        }

        const patternKey = `recruitment_pattern_${functieNiveau}_${werkvorm ?? 'any'}_${regio ?? 'any'}`.toLowerCase().replace(/\s+/g, '_');

        // Check if pattern exists
        const { data: existing } = await supabase
          .from('ai_knowledge_base')
          .select('id, confidence_score, value')
          .eq('key', patternKey)
          .eq('category', 'recruitment_pattern')
          .is('deleted_at', null)
          .maybeSingle();

        if (existing) {
          // Update existing pattern
          const currentValue = existing.value as Record<string, unknown>;
          const occurrences = ((currentValue?.occurrences as number) ?? 0) + 1;
          const newConfidence = Math.min(
            CONFIDENCE_RULES.max_confidence,
            (existing.confidence_score ?? 0.5) + (weight * 0.5)
          );

          await supabase
            .from('ai_knowledge_base')
            .update({
              value: { ...currentValue, occurrences, last_stage: newStage },
              confidence_score: newConfidence,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          result.updated++;
        } else if (options.auto_apply !== false && !options.dry_run) {
          // Create new pattern
          await createKnowledge(supabase, {
            category: 'recruitment_pattern',
            key: patternKey,
            value: {
              functie_niveau: functieNiveau,
              werkvorm,
              regio,
              occurrences: 1,
              last_stage: newStage,
              first_seen: event.created_at,
            },
            org_id: event.org_id,
            confidence_score: CONFIDENCE_RULES.default_confidence + weight,
            source: 'unified-learner',
            source_type: 'pipeline_learning',
          }, { skipConflictCheck: true });

          result.created++;
        }

        result.processed++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Event ${event.id}: ${errorMessage}`);
      }
    }

    // Process assignment evaluations
    const { data: evaluations, error: evalError } = await supabase
      .from('assignment_evaluations')
      .select('id, rating, would_rehire, feedback, assignment_id, created_at')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(100);

    if (!evalError && evaluations) {
      for (const evaluation of evaluations) {
        try {
          const weight = calculateEvaluationWeight(
            evaluation.rating ?? 3,
            evaluation.would_rehire
          );

          // Get assignment details for pattern
          const { data: assignment } = await supabase
            .from('assignments')
            .select('professional_id, sublocation_id')
            .eq('id', evaluation.assignment_id)
            .maybeSingle();

          if (!assignment) continue;

          const patternKey = `evaluation_pattern_${assignment.sublocation_id}`.toLowerCase();

          const { data: existing } = await supabase
            .from('ai_knowledge_base')
            .select('id, confidence_score, value')
            .eq('key', patternKey)
            .eq('category', 'evaluation_pattern')
            .is('deleted_at', null)
            .maybeSingle();

          if (existing) {
            const currentValue = existing.value as Record<string, unknown>;
            const evalCount = ((currentValue?.evaluation_count as number) ?? 0) + 1;
            const avgRating = (((currentValue?.avg_rating as number) ?? 3) * (evalCount - 1) + evaluation.rating) / evalCount;

            await supabase
              .from('ai_knowledge_base')
              .update({
                value: { ...currentValue, evaluation_count: evalCount, avg_rating: avgRating },
                confidence_score: Math.min(1.0, (existing.confidence_score ?? 0.5) + (weight * 0.3)),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            result.updated++;
          }

          result.processed++;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Evaluation ${evaluation.id}: ${errorMessage}`);
        }
      }
    }

    result.details = {
      events_analyzed: events?.length ?? 0,
      evaluations_analyzed: evaluations?.length ?? 0,
      days_back: daysBack,
    };

  } catch (error: unknown) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error('[learning-engine] pipelineLearning error:', error);
  }

  return result;
}

// ============================================================================
// RETROACTIVE SCAN LEARNING
// Herbeoordeelt eerder afgewezen knowledge - vervangt retroactive-training-evaluator
// ============================================================================

export async function retroactiveScanLearning(
  supabase: SupabaseClient,
  payload: RetroactiveScanPayload,
  options: LearningOptions = {}
): Promise<LearningResult> {
  const result: LearningResult = {
    success: true,
    processed: 0,
    created: 0,
    updated: 0,
    pruned: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const minConfidence = payload.min_confidence ?? CONFIDENCE_RULES.retroactive_apply_min;
    const maxConfidence = payload.max_confidence ?? CONFIDENCE_RULES.retroactive_apply_max;
    const limit = payload.limit ?? 50;

    // Find learning events that were not applied but might be eligible
    const { data: events, error: eventsError } = await supabase
      .from('ai_learning_events')
      .select('id, context, confidence_score, org_id')
      .eq('event_type', 'self_training')
      .eq('applied_to_knowledge_base', false)
      .gte('confidence_score', minConfidence)
      .lte('confidence_score', maxConfidence)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (eventsError) {
      return { ...result, success: false, errors: [eventsError.message] };
    }

    for (const event of events ?? []) {
      try {
        const context = event.context as Record<string, unknown>;
        const suggestions = (context?.new_knowledge_suggestions ?? []) as Array<{
          category: string;
          key: string;
          value: Record<string, unknown>;
          confidence?: number;
        }>;

        if (suggestions.length === 0) {
          result.skipped++;
          continue;
        }

        for (const suggestion of suggestions) {
          if (options.dry_run) {
            result.processed++;
            continue;
          }

          try {
            const confidence = suggestion.confidence ?? event.confidence_score ?? 0.8;

            if (!isEligibleForRetroactiveApply(confidence)) {
              result.skipped++;
              continue;
            }

            await createKnowledge(supabase, {
              category: suggestion.category,
              key: suggestion.key,
              value: suggestion.value,
              org_id: event.org_id,
              confidence_score: confidence,
              source: 'unified-learner',
              source_type: 'retroactive_application',
              validation_status: 'pending',
              needs_review: true,
            });

            result.created++;
          } catch (error) {
            // Likely conflict, skip
            result.skipped++;
          }
        }

        // Mark event as applied
        if (!options.dry_run && result.created > 0) {
          await supabase
            .from('ai_learning_events')
            .update({ applied_to_knowledge_base: true })
            .eq('id', event.id);
        }

        result.processed++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Event ${event.id}: ${errorMessage}`);
      }
    }

    result.details = {
      events_scanned: events?.length ?? 0,
      confidence_range: { min: minConfidence, max: maxConfidence },
    };

  } catch (error: unknown) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error('[learning-engine] retroactiveScanLearning error:', error);
  }

  return result;
}
