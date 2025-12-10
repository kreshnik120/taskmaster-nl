/**
 * Unit Tests for confidence-calculator.ts
 * ~45 test cases covering all functions
 * 
 * Run with: deno test --allow-env supabase/functions/_shared/tests/confidence-calculator.test.ts
 */

import { assertEquals, assertAlmostEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  CONFIDENCE_RULES,
  applyConfidenceDelta,
  clampConfidence,
  calculatePipelineWeight,
  calculateEvaluationWeight,
  calculateUsageBoost,
  shouldPrune,
  isBelowPruneThreshold,
  isEligibleForAutoApply,
  isEligibleForRetroactiveApply,
  calculateCombinedAdjustment,
  describeRule,
  type ConfidenceRuleKey,
} from '../confidence-calculator.ts';

// ============================================================================
// CONFIDENCE_RULES VALIDATION (5 tests)
// ============================================================================

Deno.test("CONFIDENCE_RULES - min_confidence < max_confidence", () => {
  assert(CONFIDENCE_RULES.min_confidence < CONFIDENCE_RULES.max_confidence);
});

Deno.test("CONFIDENCE_RULES - default_confidence within boundaries", () => {
  assert(CONFIDENCE_RULES.default_confidence >= CONFIDENCE_RULES.min_confidence);
  assert(CONFIDENCE_RULES.default_confidence <= CONFIDENCE_RULES.max_confidence);
});

Deno.test("CONFIDENCE_RULES - prune_threshold below min_confidence", () => {
  assert(CONFIDENCE_RULES.prune_threshold < CONFIDENCE_RULES.min_confidence);
});

Deno.test("CONFIDENCE_RULES - all pipeline weights are numeric", () => {
  const pipelineWeights = [
    CONFIDENCE_RULES.pipeline_stage_geplaatst,
    CONFIDENCE_RULES.pipeline_stage_goedgekeurd,
    CONFIDENCE_RULES.pipeline_stage_interview,
    CONFIDENCE_RULES.pipeline_stage_screening,
    CONFIDENCE_RULES.pipeline_stage_nieuw,
    CONFIDENCE_RULES.pipeline_stage_afgewezen,
  ];
  pipelineWeights.forEach(w => assert(typeof w === 'number'));
});

Deno.test("CONFIDENCE_RULES - all eval weights are numeric", () => {
  const evalWeights = [
    CONFIDENCE_RULES.eval_rating_5_rehire,
    CONFIDENCE_RULES.eval_rating_4_rehire,
    CONFIDENCE_RULES.eval_rating_3_rehire,
    CONFIDENCE_RULES.eval_rating_5,
    CONFIDENCE_RULES.eval_rating_4,
    CONFIDENCE_RULES.eval_rating_3,
    CONFIDENCE_RULES.eval_rating_low,
    CONFIDENCE_RULES.eval_no_rehire,
  ];
  evalWeights.forEach(w => assert(typeof w === 'number'));
});

// ============================================================================
// applyConfidenceDelta (8 tests)
// ============================================================================

Deno.test("applyConfidenceDelta - positive_feedback increases confidence", () => {
  const result = applyConfidenceDelta(0.70, 'positive_feedback');
  assertEquals(result, 0.75); // 0.70 + 0.05
});

Deno.test("applyConfidenceDelta - negative_feedback decreases confidence", () => {
  const result = applyConfidenceDelta(0.70, 'negative_feedback');
  assertEquals(result, 0.60); // 0.70 - 0.10
});

Deno.test("applyConfidenceDelta - pipeline_stage_geplaatst increases confidence", () => {
  const result = applyConfidenceDelta(0.70, 'pipeline_stage_geplaatst');
  assertEquals(result, 0.85); // 0.70 + 0.15
});

Deno.test("applyConfidenceDelta - upper clamp: 0.95 + 0.15 -> 1.00", () => {
  const result = applyConfidenceDelta(0.95, 'pipeline_stage_geplaatst');
  assertEquals(result, 1.00);
});

Deno.test("applyConfidenceDelta - lower clamp: 0.35 - 0.10 -> 0.30", () => {
  const result = applyConfidenceDelta(0.35, 'negative_feedback');
  assertEquals(result, 0.30); // Clamped to min
});

Deno.test("applyConfidenceDelta - at max: 1.00 + 0.05 -> 1.00", () => {
  const result = applyConfidenceDelta(1.00, 'positive_feedback');
  assertEquals(result, 1.00);
});

Deno.test("applyConfidenceDelta - at min: 0.30 - 0.10 -> 0.30", () => {
  const result = applyConfidenceDelta(0.30, 'negative_feedback');
  assertEquals(result, 0.30);
});

Deno.test("applyConfidenceDelta - unknown ruleKey returns unchanged", () => {
  const result = applyConfidenceDelta(0.70, 'unknown_rule' as ConfidenceRuleKey);
  assertEquals(result, 0.70);
});

// ============================================================================
// clampConfidence (4 tests)
// ============================================================================

Deno.test("clampConfidence - value within range unchanged", () => {
  assertEquals(clampConfidence(0.75), 0.75);
});

Deno.test("clampConfidence - value above max clamped to 1.00", () => {
  assertEquals(clampConfidence(1.50), 1.00);
});

Deno.test("clampConfidence - value below min clamped to 0.30", () => {
  assertEquals(clampConfidence(0.10), 0.30);
});

Deno.test("clampConfidence - negative value clamped to 0.30", () => {
  assertEquals(clampConfidence(-0.50), 0.30);
});

// ============================================================================
// calculatePipelineWeight (7 tests)
// ============================================================================

Deno.test("calculatePipelineWeight - geplaatst returns 0.15", () => {
  assertEquals(calculatePipelineWeight('geplaatst'), 0.15);
});

Deno.test("calculatePipelineWeight - goedgekeurd returns 0.08", () => {
  assertEquals(calculatePipelineWeight('goedgekeurd'), 0.08);
});

Deno.test("calculatePipelineWeight - interview returns 0.05", () => {
  assertEquals(calculatePipelineWeight('interview'), 0.05);
});

Deno.test("calculatePipelineWeight - screening returns 0.02", () => {
  assertEquals(calculatePipelineWeight('screening'), 0.02);
});

Deno.test("calculatePipelineWeight - nieuw returns 0.01", () => {
  assertEquals(calculatePipelineWeight('nieuw'), 0.01);
});

Deno.test("calculatePipelineWeight - afgewezen returns -0.05", () => {
  assertEquals(calculatePipelineWeight('afgewezen'), -0.05);
});

Deno.test("calculatePipelineWeight - case insensitive: GEPLAATST returns 0.15", () => {
  assertEquals(calculatePipelineWeight('GEPLAATST'), 0.15);
});

Deno.test("calculatePipelineWeight - unknown stage returns 0", () => {
  assertEquals(calculatePipelineWeight('unknown_stage'), 0);
});

Deno.test("calculatePipelineWeight - whitespace trimming", () => {
  assertEquals(calculatePipelineWeight('  geplaatst  '), 0.15);
});

// ============================================================================
// calculateEvaluationWeight (9 tests)
// ============================================================================

Deno.test("calculateEvaluationWeight - rating 5 + rehire=true -> 0.12", () => {
  assertEquals(calculateEvaluationWeight(5, true), 0.12);
});

Deno.test("calculateEvaluationWeight - rating 5 + rehire=false -> 0.04", () => {
  assertEquals(calculateEvaluationWeight(5, false), 0.04);
});

Deno.test("calculateEvaluationWeight - rating 5 + rehire=null -> 0.04", () => {
  assertEquals(calculateEvaluationWeight(5, null), 0.04);
});

Deno.test("calculateEvaluationWeight - rating 4 + rehire=true -> 0.08", () => {
  assertEquals(calculateEvaluationWeight(4, true), 0.08);
});

Deno.test("calculateEvaluationWeight - rating 3 + rehire=true -> 0.04", () => {
  assertEquals(calculateEvaluationWeight(3, true), 0.04);
});

Deno.test("calculateEvaluationWeight - rating 3 + rehire=null -> 0.00", () => {
  assertEquals(calculateEvaluationWeight(3, null), 0.00);
});

Deno.test("calculateEvaluationWeight - rating 2 + rehire=null -> -0.05", () => {
  assertEquals(calculateEvaluationWeight(2, null), -0.05);
});

Deno.test("calculateEvaluationWeight - rating 2 + rehire=false -> -0.08", () => {
  assertEquals(calculateEvaluationWeight(2, false), -0.08);
});

Deno.test("calculateEvaluationWeight - rating 1 + rehire=false -> -0.08", () => {
  assertEquals(calculateEvaluationWeight(1, false), -0.08);
});

// ============================================================================
// calculateUsageBoost (4 tests)
// ============================================================================

Deno.test("calculateUsageBoost - usageCount=0 returns 0", () => {
  assertEquals(calculateUsageBoost(0), 0);
});

Deno.test("calculateUsageBoost - usageCount=5 returns 0.05", () => {
  assertEquals(calculateUsageBoost(5), 0.05); // 5 × 0.01
});

Deno.test("calculateUsageBoost - usageCount=15 returns max 0.15", () => {
  assertEquals(calculateUsageBoost(15), 0.15);
});

Deno.test("calculateUsageBoost - usageCount=100 capped at 0.15", () => {
  assertEquals(calculateUsageBoost(100), 0.15);
});

// ============================================================================
// shouldPrune (5 tests)
// ============================================================================

Deno.test("shouldPrune - under min votes (1, 1) returns false", () => {
  assertEquals(shouldPrune(1, 1), false); // total=2 < 3
});

Deno.test("shouldPrune - under min votes (1, 0) returns false", () => {
  assertEquals(shouldPrune(1, 0), false); // total=1 < 3
});

Deno.test("shouldPrune - at threshold (1, 2) returns false", () => {
  assertEquals(shouldPrune(1, 2), false); // 67% < 70%
});

Deno.test("shouldPrune - above threshold (1, 4) returns true", () => {
  assertEquals(shouldPrune(1, 4), true); // 80% >= 70%
});

Deno.test("shouldPrune - all harmful (0, 5) returns true", () => {
  assertEquals(shouldPrune(0, 5), true); // 100% >= 70%
});

Deno.test("shouldPrune - equal votes (5, 5) returns false", () => {
  assertEquals(shouldPrune(5, 5), false); // 50% < 70%
});

// ============================================================================
// Threshold functions (3 tests each = 9 tests)
// ============================================================================

Deno.test("isBelowPruneThreshold - 0.24 returns true", () => {
  assertEquals(isBelowPruneThreshold(0.24), true);
});

Deno.test("isBelowPruneThreshold - 0.25 returns false", () => {
  assertEquals(isBelowPruneThreshold(0.25), false);
});

Deno.test("isBelowPruneThreshold - 0.30 returns false", () => {
  assertEquals(isBelowPruneThreshold(0.30), false);
});

Deno.test("isEligibleForAutoApply - 0.84 returns false", () => {
  assertEquals(isEligibleForAutoApply(0.84), false);
});

Deno.test("isEligibleForAutoApply - 0.85 returns true", () => {
  assertEquals(isEligibleForAutoApply(0.85), true);
});

Deno.test("isEligibleForAutoApply - 0.90 returns true", () => {
  assertEquals(isEligibleForAutoApply(0.90), true);
});

Deno.test("isEligibleForRetroactiveApply - 0.79 returns false", () => {
  assertEquals(isEligibleForRetroactiveApply(0.79), false);
});

Deno.test("isEligibleForRetroactiveApply - 0.80 returns true", () => {
  assertEquals(isEligibleForRetroactiveApply(0.80), true);
});

Deno.test("isEligibleForRetroactiveApply - 0.86 returns false", () => {
  assertEquals(isEligibleForRetroactiveApply(0.86), false);
});

// ============================================================================
// calculateCombinedAdjustment (6 tests)
// ============================================================================

Deno.test("calculateCombinedAdjustment - empty object returns 0", () => {
  assertEquals(calculateCombinedAdjustment({}), 0);
});

Deno.test("calculateCombinedAdjustment - only helpful feedback returns +0.05", () => {
  const result = calculateCombinedAdjustment({ feedbackType: 'helpful' });
  assertEquals(result, 0.05);
});

Deno.test("calculateCombinedAdjustment - only harmful feedback returns -0.10", () => {
  const result = calculateCombinedAdjustment({ feedbackType: 'harmful' });
  assertEquals(result, -0.10);
});

Deno.test("calculateCombinedAdjustment - pipeline + feedback combined", () => {
  const result = calculateCombinedAdjustment({
    feedbackType: 'helpful',
    pipelineStage: 'geplaatst',
  });
  assertEquals(result, 0.20); // 0.05 + 0.15
});

Deno.test("calculateCombinedAdjustment - full combination", () => {
  const result = calculateCombinedAdjustment({
    feedbackType: 'helpful',
    pipelineStage: 'goedgekeurd',
    evaluationRating: 5,
    wouldRehire: true,
    usageCount: 10,
  });
  // 0.05 (feedback) + 0.08 (pipeline) + 0.12 (eval) + 0.10 (usage)
  assertEquals(result, 0.35);
});

Deno.test("calculateCombinedAdjustment - partial factors (some undefined)", () => {
  const result = calculateCombinedAdjustment({
    pipelineStage: 'interview',
    usageCount: 5,
  });
  assertEquals(result, 0.10); // 0.05 + 0.05
});

// ============================================================================
// describeRule (4 tests)
// ============================================================================

Deno.test("describeRule - known rule returns Nederlandse beschrijving", () => {
  const result = describeRule('positive_feedback');
  assertEquals(result, 'Positieve gebruikersfeedback');
});

Deno.test("describeRule - unknown rule returns ruleKey", () => {
  const result = describeRule('unknown_rule' as ConfidenceRuleKey);
  assertEquals(result, 'unknown_rule');
});

Deno.test("describeRule - pipeline stage rule returns correct description", () => {
  const result = describeRule('pipeline_stage_geplaatst');
  assertEquals(result, 'Kandidaat geplaatst');
});

Deno.test("describeRule - evaluation rule returns correct description", () => {
  const result = describeRule('eval_rating_5_rehire');
  assertEquals(result, 'Evaluatie 5/5 met herplaatsing');
});
