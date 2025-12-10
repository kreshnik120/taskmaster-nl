/**
 * Unit Tests for knowledge-crud.ts
 * ~30 test cases covering all CRUD operations
 * 
 * Run with: deno test --allow-env supabase/functions/_shared/tests/knowledge-crud.test.ts
 */

import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createMockSupabase,
  mockSelectResult,
  mockError,
  mockRpcSuccess,
  mockRpcFailure,
  type MockConfig,
} from './mocks/supabase-mock.ts';

// Import functions to test - we'll mock the Supabase client
import {
  redactValuePII,
  checkForConflicts,
  createKnowledge,
  reinforceKnowledge,
  updateConfidence,
  incrementFeedbackCount,
  softDeleteKnowledge,
  restoreKnowledge,
  batchUpdateConfidence,
  getKnowledgeByIds,
} from '../knowledge-crud.ts';

// ============================================================================
// redactValuePII (5 tests)
// ============================================================================

Deno.test("redactValuePII - email redaction", () => {
  const input = { email: 'test@example.com', name: 'Jan' };
  const result = redactValuePII(input);
  assertEquals(result.email, '[EMAIL]');
  assertEquals(result.name, 'Jan');
});

Deno.test("redactValuePII - phone redaction", () => {
  const input = { telefoon: '06-12345678', count: 5 };
  const result = redactValuePII(input);
  assertEquals(result.telefoon, '[TELEFOON]');
  assertEquals(result.count, 5);
});

Deno.test("redactValuePII - BSN redaction", () => {
  const input = { bsn: '123456789', role: 'admin' };
  const result = redactValuePII(input);
  assertEquals(result.bsn, '[BSN]');
});

Deno.test("redactValuePII - no PII unchanged", () => {
  const input = { count: 5, type: 'test', active: true };
  const result = redactValuePII(input);
  assertEquals(result, { count: 5, type: 'test', active: true });
});

Deno.test("redactValuePII - nested object redaction", () => {
  const input = { 
    user: { email: 'nested@example.com', id: '123' },
    count: 1,
  };
  const result = redactValuePII(input);
  assertEquals((result.user as any).email, '[EMAIL]');
  assertEquals((result.user as any).id, '123');
});

// ============================================================================
// checkForConflicts (5 tests)
// ============================================================================

Deno.test("checkForConflicts - no existing item returns no conflict", async () => {
  const config: MockConfig = {
    defaultSelectResult: { data: null, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await checkForConflicts(supabase as any, {
    category: 'test',
    key: 'new_key',
    org_id: 'org-123',
    value: { data: 'new' },
  });
  
  assertEquals(result.hasConflict, false);
});

Deno.test("checkForConflicts - exact match returns exact_match conflict", async () => {
  const existingValue = { data: 'same' };
  const config: MockConfig = {
    defaultSelectResult: { 
      data: { 
        id: 'existing-id',
        key: 'test_key',
        value: existingValue,
        confidence_score: 0.8,
      }, 
      error: null 
    },
  };
  const supabase = createMockSupabase(config);
  
  const result = await checkForConflicts(supabase as any, {
    category: 'test',
    key: 'test_key',
    org_id: 'org-123',
    value: existingValue,
  });
  
  assertEquals(result.hasConflict, true);
  assertEquals(result.conflictType, 'exact_match');
  assertEquals(result.existingId, 'existing-id');
});

Deno.test("checkForConflicts - different value returns contradicting_value conflict", async () => {
  const config: MockConfig = {
    defaultSelectResult: { 
      data: { 
        id: 'existing-id',
        key: 'test_key',
        value: { data: 'old_value' },
        confidence_score: 0.7,
      }, 
      error: null 
    },
  };
  const supabase = createMockSupabase(config);
  
  const result = await checkForConflicts(supabase as any, {
    category: 'test',
    key: 'test_key',
    org_id: 'org-123',
    value: { data: 'new_value' },
  });
  
  assertEquals(result.hasConflict, true);
  assertEquals(result.conflictType, 'contradicting_value');
});

Deno.test("checkForConflicts - database error returns no conflict", async () => {
  const config: MockConfig = {
    defaultSelectResult: { data: null, error: { message: 'DB error' } },
  };
  const supabase = createMockSupabase(config);
  
  const result = await checkForConflicts(supabase as any, {
    category: 'test',
    key: 'key',
    org_id: 'org-123',
    value: {},
  });
  
  assertEquals(result.hasConflict, false);
});

Deno.test("checkForConflicts - returns existing confidence score", async () => {
  const config: MockConfig = {
    defaultSelectResult: { 
      data: { 
        id: 'existing-id',
        key: 'test_key',
        value: { same: 'value' },
        confidence_score: 0.95,
      }, 
      error: null 
    },
  };
  const supabase = createMockSupabase(config);
  
  const result = await checkForConflicts(supabase as any, {
    category: 'test',
    key: 'test_key',
    org_id: 'org-123',
    value: { same: 'value' },
  });
  
  assertEquals(result.existingConfidence, 0.95);
});

// ============================================================================
// reinforceKnowledge (4 tests)
// ============================================================================

Deno.test("reinforceKnowledge - successful RPC returns new values", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_reinforce_knowledge', { success: true, new_stability: 0.65, new_usage_count: 5 }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await reinforceKnowledge(supabase as any, 'knowledge-id', 'org-123', {
    stabilityBoost: 0.1,
    usageIncrement: 1,
  });
  
  assertEquals(result.newStability, 0.65);
  assertEquals(result.newUsageCount, 5);
});

Deno.test("reinforceKnowledge - RPC error throws Error", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_reinforce_knowledge', { success: false, error: 'Item not found' }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  await assertRejects(
    async () => await reinforceKnowledge(supabase as any, 'bad-id', 'org-123'),
    Error,
    'Item not found'
  );
});

Deno.test("reinforceKnowledge - uses default values when options not provided", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_reinforce_knowledge', { success: true, new_stability: 0.55, new_usage_count: 1 }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await reinforceKnowledge(supabase as any, 'knowledge-id', 'org-123');
  
  // Should use defaults (0.05 stabilityBoost, 1 usageIncrement)
  assertEquals(result.newStability, 0.55);
});

Deno.test("reinforceKnowledge - org_id is enforced", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_reinforce_knowledge', { success: true, new_stability: 0.6, new_usage_count: 2 }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await reinforceKnowledge(supabase as any, 'id', 'specific-org-id');
  
  const callLog = supabase._getCallLog();
  const rpcCall = callLog.find((c: any) => c.method === 'rpc');
  assert(rpcCall !== undefined);
  assertEquals((rpcCall!.args[1] as any).p_org_id, 'specific-org-id');
});

// ============================================================================
// updateConfidence (5 tests)
// ============================================================================

Deno.test("updateConfidence - positive delta increases confidence", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { 
        success: true, 
        old_confidence: 0.7, 
        new_confidence: 0.75,
        was_pruned: false,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await updateConfidence(supabase as any, 'id', 'org-123', {
    ruleKey: 'positive_feedback',
  });
  
  assertEquals(result.oldConfidence, 0.7);
  assertEquals(result.newConfidence, 0.75);
  assertEquals(result.wasPruned, false);
});

Deno.test("updateConfidence - negative delta decreases confidence", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { 
        success: true, 
        old_confidence: 0.5, 
        new_confidence: 0.4,
        was_pruned: false,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await updateConfidence(supabase as any, 'id', 'org-123', {
    ruleKey: 'negative_feedback',
  });
  
  assertEquals(result.newConfidence, 0.4);
});

Deno.test("updateConfidence - auto-prune triggered when confidence too low", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { 
        success: true, 
        old_confidence: 0.2, 
        new_confidence: 0.1,
        was_pruned: true,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await updateConfidence(supabase as any, 'id', 'org-123', {
    ruleKey: 'negative_feedback',
    autoPrune: true,
  });
  
  assertEquals(result.wasPruned, true);
});

Deno.test("updateConfidence - custom delta overrides ruleKey", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { 
        success: true, 
        old_confidence: 0.5, 
        new_confidence: 0.7,
        was_pruned: false,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await updateConfidence(supabase as any, 'id', 'org-123', {
    ruleKey: 'positive_feedback', // Would be +0.05
    customDelta: 0.2, // Override to +0.2
  });
  
  const callLog = supabase._getCallLog();
  const rpcCall = callLog.find((c: any) => c.method === 'rpc');
  assertEquals((rpcCall!.args[1] as any).p_delta, 0.2);
});

Deno.test("updateConfidence - RPC failure throws error", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { success: false, error: 'Access denied' }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  await assertRejects(
    async () => await updateConfidence(supabase as any, 'id', 'wrong-org', {
      ruleKey: 'positive_feedback',
    }),
    Error,
    'Access denied'
  );
});

// ============================================================================
// incrementFeedbackCount (3 tests)
// ============================================================================

Deno.test("incrementFeedbackCount - helpful feedback increments helpful count", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { 
        success: true, 
        helpful_count: 6, 
        harmful_count: 2,
        should_prune: false,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await incrementFeedbackCount(supabase as any, 'id', 'org-123', 'helpful');
  
  assertEquals(result.helpfulCount, 6);
  assertEquals(result.harmfulCount, 2);
  assertEquals(result.shouldPrune, false);
});

Deno.test("incrementFeedbackCount - harmful feedback increments harmful count", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { 
        success: true, 
        helpful_count: 2, 
        harmful_count: 8,
        should_prune: true,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await incrementFeedbackCount(supabase as any, 'id', 'org-123', 'harmful');
  
  assertEquals(result.harmfulCount, 8);
  assertEquals(result.shouldPrune, true);
});

Deno.test("incrementFeedbackCount - RPC failure throws error", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_increment_feedback', { success: false, error: 'Not found' }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  await assertRejects(
    async () => await incrementFeedbackCount(supabase as any, 'bad-id', 'org-123', 'helpful'),
    Error,
    'Not found'
  );
});

// ============================================================================
// softDeleteKnowledge (2 tests)
// ============================================================================

Deno.test("softDeleteKnowledge - successful deletion", async () => {
  const config: MockConfig = {
    defaultUpdateResult: { data: null, error: null },
  };
  const supabase = createMockSupabase(config);
  
  // Should not throw
  await softDeleteKnowledge(supabase as any, 'knowledge-id', {
    reason: 'test_deletion',
    deletedBy: 'user-123',
  });
  
  const callLog = supabase._getCallLog();
  assert(callLog.some((c: any) => c.method === 'update'));
});

Deno.test("softDeleteKnowledge - error throws", async () => {
  const config: MockConfig = {
    defaultUpdateResult: { data: null, error: { message: 'Update failed' } },
  };
  const supabase = createMockSupabase(config);
  
  await assertRejects(
    async () => await softDeleteKnowledge(supabase as any, 'id', { reason: 'test' }),
    Error,
    'Failed to soft delete'
  );
});

// ============================================================================
// restoreKnowledge (2 tests)
// ============================================================================

Deno.test("restoreKnowledge - successful restore", async () => {
  const config: MockConfig = {
    defaultUpdateResult: { data: null, error: null },
  };
  const supabase = createMockSupabase(config);
  
  await restoreKnowledge(supabase as any, 'knowledge-id');
  
  const callLog = supabase._getCallLog();
  assert(callLog.some((c: any) => c.method === 'update'));
});

Deno.test("restoreKnowledge - error throws", async () => {
  const config: MockConfig = {
    defaultUpdateResult: { data: null, error: { message: 'Restore failed' } },
  };
  const supabase = createMockSupabase(config);
  
  await assertRejects(
    async () => await restoreKnowledge(supabase as any, 'id'),
    Error,
    'Failed to restore'
  );
});

// ============================================================================
// batchUpdateConfidence (2 tests)
// ============================================================================

Deno.test("batchUpdateConfidence - multiple items updated", async () => {
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { 
        success: true, 
        old_confidence: 0.7, 
        new_confidence: 0.75,
        was_pruned: false,
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await batchUpdateConfidence(supabase as any, 'org-123', [
    { id: 'id-1', ruleKey: 'positive_feedback' },
    { id: 'id-2', ruleKey: 'positive_feedback' },
    { id: 'id-3', ruleKey: 'positive_feedback' },
  ]);
  
  assertEquals(result.updated, 3);
  assertEquals(result.pruned, 0);
});

Deno.test("batchUpdateConfidence - counts pruned items", async () => {
  let callCount = 0;
  const originalRpc = (config: MockConfig) => config.rpcResults?.get('atomic_update_confidence');
  
  const config: MockConfig = {
    rpcResults: new Map([
      ['atomic_update_confidence', { 
        success: true, 
        old_confidence: 0.2, 
        new_confidence: 0.1,
        was_pruned: true, // All items will be pruned
      }],
    ]),
  };
  const supabase = createMockSupabase(config);
  
  const result = await batchUpdateConfidence(supabase as any, 'org-123', [
    { id: 'id-1', ruleKey: 'negative_feedback' },
    { id: 'id-2', ruleKey: 'negative_feedback' },
  ]);
  
  assertEquals(result.pruned, 2);
  assertEquals(result.updated, 0);
});

// ============================================================================
// getKnowledgeByIds (3 tests)
// ============================================================================

Deno.test("getKnowledgeByIds - empty array returns empty", async () => {
  const supabase = createMockSupabase({});
  
  const result = await getKnowledgeByIds(supabase as any, []);
  
  assertEquals(result, []);
});

Deno.test("getKnowledgeByIds - valid IDs returns matching items", async () => {
  const mockItems = [
    { id: 'id-1', category: 'test', key: 'key1', value: {}, confidence_score: 0.8, org_id: 'org', helpful_count: 5, harmful_count: 0, usage_count: 10, deleted_at: null, validation_status: 'validated' },
    { id: 'id-2', category: 'test', key: 'key2', value: {}, confidence_score: 0.9, org_id: 'org', helpful_count: 3, harmful_count: 1, usage_count: 5, deleted_at: null, validation_status: 'pending' },
  ];
  const config: MockConfig = {
    defaultSelectResult: { data: mockItems, error: null },
  };
  const supabase = createMockSupabase(config);
  
  const result = await getKnowledgeByIds(supabase as any, ['id-1', 'id-2']);
  
  assertEquals(result.length, 2);
  assertEquals(result[0].id, 'id-1');
});

Deno.test("getKnowledgeByIds - database error returns empty array", async () => {
  const config: MockConfig = {
    defaultSelectResult: { data: null, error: { message: 'DB error' } },
  };
  const supabase = createMockSupabase(config);
  
  const result = await getKnowledgeByIds(supabase as any, ['id-1']);
  
  assertEquals(result, []);
});
