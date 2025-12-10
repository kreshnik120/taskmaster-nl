/**
 * Unit Tests for learning-engine.ts
 * ~25 test cases covering all learning functions
 * 
 * Run with: deno test --allow-env supabase/functions/_shared/tests/learning-engine.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createMockSupabase,
  mockSelectResult,
  mockRpcSuccess,
  type MockConfig,
} from './mocks/supabase-mock.ts';

import {
  analyzeChatLearning,
  processFeedbackLearning,
  pipelineLearning,
  retroactiveScanLearning,
  type AnalyzeChatPayload,
  type ProcessFeedbackPayload,
  type PipelineLearningPayload,
  type RetroactiveScanPayload,
} from '../learning-engine.ts';

// ============================================================================
// analyzeChatLearning (7 tests)
// ============================================================================

Deno.test("analyzeChatLearning - missing question returns error", async () => {
  const supabase = createMockSupabase({});
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: '',
    ai_response: 'test response',
  });
  
  assertEquals(result.success, false);
  assert(result.errors.some(e => e.includes('Missing')));
});

Deno.test("analyzeChatLearning - missing response returns error", async () => {
  const supabase = createMockSupabase({});
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: 'test question',
    ai_response: '',
  });
  
  assertEquals(result.success, false);
});

Deno.test("analyzeChatLearning - helpful feedback updates knowledge", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 5, harmful_count: 0, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.75, was_pruned: false }],
    ]),
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: 'What is recruitment?',
    ai_response: 'Recruitment is...',
    knowledge_used: ['knowledge-1', 'knowledge-2'],
    user_feedback: 'helpful',
    org_id: 'org-123',
  });
  
  assertEquals(result.success, true);
  assertEquals(result.updated, 2);
  assertEquals(result.processed, 2);
});

Deno.test("analyzeChatLearning - harmful feedback decreases confidence", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 0, harmful_count: 5, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.6, was_pruned: false }],
    ]),
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: 'Bad question',
    ai_response: 'Wrong answer',
    knowledge_used: ['knowledge-1'],
    user_feedback: 'harmful',
    org_id: 'org-123',
  });
  
  assertEquals(result.success, true);
  assertEquals(result.updated, 1);
});

Deno.test("analyzeChatLearning - no knowledge_used skips updates", async () => {
  const config: MockConfig = {
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: 'Simple question',
    ai_response: 'Simple response',
    org_id: 'org-123',
  });
  
  assertEquals(result.success, true);
  assertEquals(result.updated, 0);
});

Deno.test("analyzeChatLearning - auto_apply reinforces helpful knowledge", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 5, harmful_count: 0, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.75, was_pruned: false }],
      ['atomic_reinforce_knowledge', { success: true, new_stability: 0.6, new_usage_count: 2 }],
    ]),
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: 'Question',
    ai_response: 'Response',
    knowledge_used: ['knowledge-1'],
    user_feedback: 'helpful',
    org_id: 'org-123',
  }, { auto_apply: true });
  
  assertEquals(result.success, true);
});

Deno.test("analyzeChatLearning - logs event with details", async () => {
  const config: MockConfig = {
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await analyzeChatLearning(supabase as any, {
    user_question: 'Test question with some content',
    ai_response: 'Test response with more content',
    org_id: 'org-123',
  });
  
  assertEquals(result.success, true);
  assertEquals(result.details?.question_analyzed, true);
});

// ============================================================================
// processFeedbackLearning (8 tests)
// ============================================================================

Deno.test("processFeedbackLearning - missing feedback type returns error", async () => {
  const supabase = createMockSupabase({});
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: '' as any, // Invalid
    knowledge_ids: ['id-1'],
  });
  
  assertEquals(result.success, false);
  assert(result.errors.some(e => e.includes('Missing')));
});

Deno.test("processFeedbackLearning - no knowledge_ids returns skipped", async () => {
  const supabase = createMockSupabase({});
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'helpful',
    knowledge_ids: [],
  });
  
  assertEquals(result.skipped, 1);
  assertEquals(result.details?.reason, 'no_knowledge_ids');
});

Deno.test("processFeedbackLearning - extracts knowledge from message_id", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['ai_chat_messages', mockSelectResult({
        used_knowledge: [{ id: 'extracted-id-1' }, { id: 'extracted-id-2' }]
      })],
    ]),
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 1, harmful_count: 0, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.75, was_pruned: false }],
    ]),
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'helpful',
    message_id: 'msg-123',
    org_id: 'org-123',
  });
  
  assertEquals(result.success, true);
  assertEquals(result.processed, 2);
});

Deno.test("processFeedbackLearning - pruning creates alert", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 0, harmful_count: 10, should_prune: true }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.2, new_confidence: 0.1, was_pruned: true }],
    ]),
    defaultInsertResult: { data: { id: 'id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'harmful',
    knowledge_ids: ['bad-knowledge'],
    org_id: 'org-123',
  });
  
  assertEquals(result.pruned, 1);
});

Deno.test("processFeedbackLearning - batch mode processes pending feedback", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['ai_chat_feedback', mockSelectResult([
        { id: 'fb-1', feedback_type: 'helpful', knowledge_ids: ['k1', 'k2'], message_id: 'm1', user_id: 'u1' },
        { id: 'fb-2', feedback_type: 'harmful', knowledge_ids: ['k3'], message_id: 'm2', user_id: 'u2' },
      ])],
    ]),
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 1, harmful_count: 0, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.75, was_pruned: false }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'helpful', // Required but ignored in batch mode
    batch_mode: true,
    org_id: 'org-123',
  });
  
  assertEquals(result.processed, 2); // 2 feedback records
  assertEquals(result.updated, 3); // 3 knowledge items total
});

Deno.test("processFeedbackLearning - handles errors per item", async () => {
  let callCount = 0;
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: false, error: 'Not found' }],
      ['atomic_update_confidence', { success: false, error: 'Not found' }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'helpful',
    knowledge_ids: ['bad-id'],
    org_id: 'org-123',
  });
  
  assert(result.errors.length > 0);
});

Deno.test("processFeedbackLearning - logs learning event", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 1, harmful_count: 0, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.75, was_pruned: false }],
    ]),
    defaultInsertResult: { data: { id: 'event-id' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'helpful',
    knowledge_ids: ['k1'],
    org_id: 'org-123',
    user_id: 'user-123',
  });
  
  assertEquals(result.success, true);
  const callLog = supabase._getCallLog();
  assert(callLog.some((c: any) => c.method === 'insert'));
});

Deno.test("processFeedbackLearning - uses default org_id if not provided", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: true, helpful_count: 1, harmful_count: 0, should_prune: false }],
      ['atomic_update_confidence', { success: true, old_confidence: 0.7, new_confidence: 0.75, was_pruned: false }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await processFeedbackLearning(supabase as any, {
    feedback: 'helpful',
    knowledge_ids: ['k1'],
    // No org_id provided
  });
  
  assertEquals(result.success, true);
});

// ============================================================================
// pipelineLearning (6 tests)
// ============================================================================

Deno.test("pipelineLearning - no events returns processed=0", async () => {
  const config: MockConfig = {
    defaultSelectResult: { data: [], error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await pipelineLearning(supabase as any, { days_back: 7 });
  
  assertEquals(result.processed, 0);
  assertEquals(result.success, true);
});

Deno.test("pipelineLearning - creates new pattern", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['system_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'pipeline_stage_changed',
          event_data: { new_stage: 'geplaatst', functie_niveau: 'VIG', werkvorm: 'ZZP' },
          metadata: {},
          org_id: 'org-123',
          created_at: new Date().toISOString(),
        },
      ])],
      ['ai_knowledge_base', mockSelectResult(null)], // No existing pattern
      ['assignment_evaluations', mockSelectResult([])],
    ]),
    defaultInsertResult: { data: { id: 'new-pattern' }, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await pipelineLearning(supabase as any, { days_back: 7 });
  
  assertEquals(result.created, 1);
  assertEquals(result.processed, 1);
});

Deno.test("pipelineLearning - updates existing pattern", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['system_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'pipeline_stage_changed',
          event_data: { new_stage: 'geplaatst', functie_niveau: 'VIG' },
          metadata: {},
          org_id: 'org-123',
          created_at: new Date().toISOString(),
        },
      ])],
      ['assignment_evaluations', mockSelectResult([])],
    ]),
    // Existing pattern found
    defaultSelectResult: { 
      data: { 
        id: 'existing-pattern',
        confidence_score: 0.7,
        value: { occurrences: 5 },
      }, 
      error: null 
    },
    defaultUpdateResult: { data: null, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await pipelineLearning(supabase as any, { days_back: 7 });
  
  assertEquals(result.updated, 1);
});

Deno.test("pipelineLearning - unknown stage skipped", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['system_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'pipeline_stage_changed',
          event_data: { new_stage: 'unknown_stage', functie_niveau: 'VIG' },
          metadata: {},
          org_id: 'org-123',
          created_at: new Date().toISOString(),
        },
      ])],
      ['assignment_evaluations', mockSelectResult([])],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await pipelineLearning(supabase as any, { days_back: 7 });
  
  assertEquals(result.skipped, 1);
});

Deno.test("pipelineLearning - skips events without functie_niveau", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['system_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'pipeline_stage_changed',
          event_data: { new_stage: 'geplaatst' }, // No functie_niveau
          metadata: {},
          org_id: 'org-123',
          created_at: new Date().toISOString(),
        },
      ])],
      ['assignment_evaluations', mockSelectResult([])],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await pipelineLearning(supabase as any, { days_back: 7 });
  
  assertEquals(result.skipped, 1);
});

Deno.test("pipelineLearning - handles errors per event", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['system_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'pipeline_stage_changed',
          event_data: { new_stage: 'geplaatst', functie_niveau: 'VIG' },
          metadata: {},
          org_id: 'org-123',
          created_at: new Date().toISOString(),
        },
      ])],
      ['assignment_evaluations', mockSelectResult([])],
    ]),
    defaultSelectResult: { data: null, error: { message: 'DB error' } },
    defaultInsertResult: { data: null, error: { message: 'Insert failed' } },
  };
  const supabase = createMockSupabase(config);
  
  const result = await pipelineLearning(supabase as any, { days_back: 7 });
  
  // Should continue processing despite errors
  assertEquals(result.success, true);
});

// ============================================================================
// retroactiveScanLearning (4 tests)
// ============================================================================

Deno.test("retroactiveScanLearning - no eligible events returns processed=0", async () => {
  const config: MockConfig = {
    defaultSelectResult: { data: [], error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await retroactiveScanLearning(supabase as any, {
    min_confidence: 0.8,
    max_confidence: 0.85,
    limit: 50,
  });
  
  assertEquals(result.processed, 0);
});

Deno.test("retroactiveScanLearning - creates knowledge from suggestions", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['ai_learning_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'suggestion',
          context: { 
            suggested_knowledge: {
              category: 'test',
              key: 'new_pattern',
              value: { data: 'learned' },
            }
          },
          confidence_score: 0.82,
          org_id: 'org-123',
          applied_to_knowledge_base: false,
        },
      ])],
    ]),
    defaultInsertResult: { data: { id: 'created-id' }, error: null },
    defaultUpdateResult: { data: null, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await retroactiveScanLearning(supabase as any, {
    min_confidence: 0.8,
    max_confidence: 0.85,
  });
  
  assertEquals(result.created, 1);
});

Deno.test("retroactiveScanLearning - dry_run makes no database changes", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['ai_learning_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'suggestion',
          context: { 
            suggested_knowledge: {
              category: 'test',
              key: 'pattern',
              value: {},
            }
          },
          confidence_score: 0.82,
          org_id: 'org-123',
          applied_to_knowledge_base: false,
        },
      ])],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await retroactiveScanLearning(supabase as any, {
    min_confidence: 0.8,
  }, { dry_run: true });
  
  // Should not create any knowledge
  assertEquals(result.created, 0);
});

Deno.test("retroactiveScanLearning - marks events as applied", async () => {
  const config: MockConfig = {
    selectResults: new Map([
      ['ai_learning_events', mockSelectResult([
        {
          id: 'event-1',
          event_type: 'suggestion',
          context: { 
            suggested_knowledge: {
              category: 'test',
              key: 'pattern',
              value: { data: 'test' },
            }
          },
          confidence_score: 0.83,
          org_id: 'org-123',
          applied_to_knowledge_base: false,
        },
      ])],
    ]),
    defaultInsertResult: { data: { id: 'new-id' }, error: null },
    defaultUpdateResult: { data: null, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await retroactiveScanLearning(supabase as any, {
    min_confidence: 0.8,
    max_confidence: 0.85,
  });
  
  assertEquals(result.success, true);
  const callLog = supabase._getCallLog();
  // Should have called update to mark as applied
  assert(callLog.some((c: any) => c.method === 'update'));
});
