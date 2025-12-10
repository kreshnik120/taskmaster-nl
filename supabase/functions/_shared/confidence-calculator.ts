/**
 * Confidence Calculator - Unified Learning Module
 * Centrale plek voor alle confidence regels en berekeningen
 * 
 * @module _shared/confidence-calculator
 */

// ============================================================================
// CONFIDENCE RULES - Alle magic numbers op één plek
// ============================================================================

export const CONFIDENCE_RULES = {
  // Feedback adjustments
  positive_feedback: 0.05,
  negative_feedback: -0.10,
  
  // Pipeline stage weights (recruitment)
  pipeline_stage_geplaatst: 0.15,
  pipeline_stage_goedgekeurd: 0.08,
  pipeline_stage_interview: 0.05,
  pipeline_stage_screening: 0.02,
  pipeline_stage_nieuw: 0.01,
  pipeline_stage_afgewezen: -0.05,
  
  // Retroactive adjustments
  retroactive_positive: 0.03,
  retroactive_negative: -0.07,
  
  // Evaluation-based weights (assignment evaluations)
  eval_rating_5_rehire: 0.12,
  eval_rating_4_rehire: 0.08,
  eval_rating_3_rehire: 0.04,
  eval_rating_5: 0.04,
  eval_rating_4: 0.02,
  eval_rating_3: 0.00,
  eval_rating_low: -0.05,
  eval_no_rehire: -0.03,
  
  // Boundaries
  min_confidence: 0.30,
  max_confidence: 1.00,
  default_confidence: 0.70,
  
  // Pruning thresholds
  prune_threshold: 0.25,
  harmful_prune_min_votes: 3,
  harmful_prune_ratio: 0.70,
  
  // Reinforcement / Stability
  stability_boost: 0.10,
  max_stability: 1.00,
  usage_boost_per_use: 0.01,
  max_usage_boost: 0.15,
  
  // Auto-apply thresholds
  auto_apply_min_confidence: 0.85,
  retroactive_apply_min: 0.80,
  retroactive_apply_max: 0.85,
} as const;

export type ConfidenceRuleKey = keyof typeof CONFIDENCE_RULES;

// ============================================================================
// PIPELINE STAGE MAPPING
// ============================================================================

const PIPELINE_STAGE_WEIGHTS: Record<string, number> = {
  'geplaatst': CONFIDENCE_RULES.pipeline_stage_geplaatst,
  'goedgekeurd': CONFIDENCE_RULES.pipeline_stage_goedgekeurd,
  'interview': CONFIDENCE_RULES.pipeline_stage_interview,
  'screening': CONFIDENCE_RULES.pipeline_stage_screening,
  'nieuw': CONFIDENCE_RULES.pipeline_stage_nieuw,
  'afgewezen': CONFIDENCE_RULES.pipeline_stage_afgewezen,
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Apply a confidence delta based on a rule key
 * Returns the new confidence value, clamped to valid range
 */
export function applyConfidenceDelta(
  currentConfidence: number, 
  ruleKey: ConfidenceRuleKey
): number {
  const delta = CONFIDENCE_RULES[ruleKey];
  
  if (typeof delta !== 'number') {
    console.warn(`[confidence-calculator] Unknown rule key: ${ruleKey}`);
    return currentConfidence;
  }
  
  const newConfidence = currentConfidence + delta;
  return clampConfidence(newConfidence);
}

/**
 * Clamp confidence to valid range [min, max]
 */
export function clampConfidence(confidence: number): number {
  return Math.max(
    CONFIDENCE_RULES.min_confidence,
    Math.min(CONFIDENCE_RULES.max_confidence, confidence)
  );
}

/**
 * Calculate pipeline weight for a given stage
 */
export function calculatePipelineWeight(stage: string): number {
  const normalizedStage = stage.toLowerCase().trim();
  return PIPELINE_STAGE_WEIGHTS[normalizedStage] ?? 0;
}

/**
 * Calculate evaluation weight based on rating and rehire status
 */
export function calculateEvaluationWeight(
  rating: number, 
  wouldRehire: boolean | null
): number {
  if (rating >= 5 && wouldRehire === true) {
    return CONFIDENCE_RULES.eval_rating_5_rehire;
  }
  if (rating >= 4 && wouldRehire === true) {
    return CONFIDENCE_RULES.eval_rating_4_rehire;
  }
  if (rating >= 3 && wouldRehire === true) {
    return CONFIDENCE_RULES.eval_rating_3_rehire;
  }
  if (rating >= 5) {
    return CONFIDENCE_RULES.eval_rating_5;
  }
  if (rating >= 4) {
    return CONFIDENCE_RULES.eval_rating_4;
  }
  if (rating >= 3) {
    return CONFIDENCE_RULES.eval_rating_3;
  }
  
  // Low rating
  let weight = CONFIDENCE_RULES.eval_rating_low;
  if (wouldRehire === false) {
    weight += CONFIDENCE_RULES.eval_no_rehire;
  }
  return weight;
}

/**
 * Calculate usage-based boost
 * More usage = higher confidence (capped)
 */
export function calculateUsageBoost(usageCount: number): number {
  const boost = usageCount * CONFIDENCE_RULES.usage_boost_per_use;
  return Math.min(boost, CONFIDENCE_RULES.max_usage_boost);
}

/**
 * Determine if a knowledge item should be pruned based on feedback
 */
export function shouldPrune(helpfulCount: number, harmfulCount: number): boolean {
  const totalVotes = helpfulCount + harmfulCount;
  
  if (totalVotes < CONFIDENCE_RULES.harmful_prune_min_votes) {
    return false;
  }
  
  const harmfulRatio = harmfulCount / totalVotes;
  return harmfulRatio >= CONFIDENCE_RULES.harmful_prune_ratio;
}

/**
 * Check if confidence is below prune threshold
 */
export function isBelowPruneThreshold(confidence: number): boolean {
  return confidence < CONFIDENCE_RULES.prune_threshold;
}

/**
 * Check if knowledge item is eligible for auto-apply
 */
export function isEligibleForAutoApply(confidence: number): boolean {
  return confidence >= CONFIDENCE_RULES.auto_apply_min_confidence;
}

/**
 * Check if knowledge item is eligible for retroactive application
 */
export function isEligibleForRetroactiveApply(confidence: number): boolean {
  return confidence >= CONFIDENCE_RULES.retroactive_apply_min 
      && confidence <= CONFIDENCE_RULES.retroactive_apply_max;
}

/**
 * Calculate combined confidence adjustment from multiple factors
 */
export function calculateCombinedAdjustment(factors: {
  feedbackType?: 'helpful' | 'harmful' | null;
  pipelineStage?: string;
  evaluationRating?: number;
  wouldRehire?: boolean | null;
  usageCount?: number;
}): number {
  let adjustment = 0;
  
  // Feedback adjustment
  if (factors.feedbackType === 'helpful') {
    adjustment += CONFIDENCE_RULES.positive_feedback;
  } else if (factors.feedbackType === 'harmful') {
    adjustment += CONFIDENCE_RULES.negative_feedback;
  }
  
  // Pipeline stage adjustment
  if (factors.pipelineStage) {
    adjustment += calculatePipelineWeight(factors.pipelineStage);
  }
  
  // Evaluation adjustment
  if (factors.evaluationRating !== undefined) {
    adjustment += calculateEvaluationWeight(
      factors.evaluationRating, 
      factors.wouldRehire ?? null
    );
  }
  
  // Usage boost
  if (factors.usageCount !== undefined && factors.usageCount > 0) {
    adjustment += calculateUsageBoost(factors.usageCount);
  }
  
  return adjustment;
}

/**
 * Get human-readable description of a confidence rule
 */
export function describeRule(ruleKey: ConfidenceRuleKey): string {
  const descriptions: Record<string, string> = {
    positive_feedback: 'Positieve gebruikersfeedback',
    negative_feedback: 'Negatieve gebruikersfeedback',
    pipeline_stage_geplaatst: 'Kandidaat geplaatst',
    pipeline_stage_goedgekeurd: 'Kandidaat goedgekeurd',
    pipeline_stage_interview: 'Interview gepland',
    pipeline_stage_screening: 'Screening fase',
    pipeline_stage_afgewezen: 'Kandidaat afgewezen',
    eval_rating_5_rehire: 'Evaluatie 5/5 met herplaatsing',
    eval_rating_4_rehire: 'Evaluatie 4/5 met herplaatsing',
    stability_boost: 'Stabiliteitsversterking',
  };
  
  return descriptions[ruleKey] ?? ruleKey;
}
