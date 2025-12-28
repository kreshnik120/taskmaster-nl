/**
 * Unit Tests for Semantic Retrieval Module
 * Verifies include_shared parameter is correctly passed to match_knowledge RPC
 * 
 * Run with: deno test --allow-env --allow-net supabase/functions/_shared/tests/semantic-retrieval.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Type definitions for our mocks
interface MockRpcCall {
  functionName: string;
  params: Record<string, unknown>;
}

interface MockMatch {
  knowledge_id: string;
  category: string;
  key: string;
  value: unknown;
  confidence_score: number;
  similarity: number;
  usage_count?: number;
  role_tags?: string[];
  validation_status?: string;
  is_shared?: boolean;
}

/**
 * Creates an enhanced mock Supabase client that logs RPC parameters
 */
function createSemanticMock(options: {
  primaryResults?: MockMatch[];
  fallbackResults?: MockMatch[];
  shouldError?: boolean;
  errorMessage?: string;
}) {
  const rpcCalls: MockRpcCall[] = [];
  let callCount = 0;

  const mock = {
    rpc: (functionName: string, params: Record<string, unknown>) => {
      rpcCalls.push({ functionName, params });
      callCount++;
      
      if (options.shouldError) {
        return Promise.resolve({
          data: null,
          error: { message: options.errorMessage ?? 'RPC error' }
        });
      }

      // Return primary results on first call, fallback on second
      const results = callCount === 1 
        ? (options.primaryResults ?? []) 
        : (options.fallbackResults ?? []);

      return Promise.resolve({
        data: results,
        error: null
      });
    },
    
    from: (table: string) => ({
      update: () => ({
        in: () => ({
          then: (cb: (result: unknown) => void) => {
            cb({ data: null, error: null });
            return { catch: () => {} };
          },
          catch: () => {}
        })
      })
    }),
    
    _getRpcCalls: () => rpcCalls,
    _getCallCount: () => callCount,
    _clearCalls: () => { rpcCalls.length = 0; callCount = 0; }
  };

  return mock;
}

// Mock fetch for embedding API
const originalFetch = globalThis.fetch;
const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i / 100));

function setupFetchMock() {
  globalThis.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    if (urlString.includes('embeddings')) {
      return new Response(JSON.stringify({
        data: [{ embedding: mockEmbedding }]
      }), { status: 200 });
    }
    
    return originalFetch(url, options);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Set mock env
Deno.env.set('LOVABLE_API_KEY', 'test-key');

// ============================================================================
// TEST SUITE: include_shared Parameter Verification
// ============================================================================

Deno.test({
  name: "semanticKnowledgeRetrieval - default includeShared is true",
  async fn() {
    setupFetchMock();
    
    const mock = createSemanticMock({
      primaryResults: [
        { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9, similarity: 0.85 }
      ]
    });

    // Import dynamically to use fresh mocks
    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123'
      // Note: includeShared not specified, should default to true
    });

    const rpcCalls = mock._getRpcCalls();
    assertEquals(rpcCalls.length, 1, 'Should make exactly 1 RPC call');
    assertEquals(rpcCalls[0].functionName, 'match_knowledge');
    assertEquals(rpcCalls[0].params.include_shared, true, 'Default include_shared should be true');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - explicit includeShared true",
  async fn() {
    setupFetchMock();
    
    const mock = createSemanticMock({
      primaryResults: [
        { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9, similarity: 0.85 }
      ]
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123',
      includeShared: true
    });

    const rpcCalls = mock._getRpcCalls();
    assertEquals(rpcCalls[0].params.include_shared, true, 'Explicit include_shared should be true');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - explicit includeShared false",
  async fn() {
    setupFetchMock();
    
    const mock = createSemanticMock({
      primaryResults: [
        { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9, similarity: 0.85 }
      ]
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123',
      includeShared: false
    });

    const rpcCalls = mock._getRpcCalls();
    assertEquals(rpcCalls[0].params.include_shared, false, 'Explicit include_shared should be false');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - fallback preserves includeShared true",
  async fn() {
    setupFetchMock();
    
    // Primary returns < 5 results to trigger fallback
    const mock = createSemanticMock({
      primaryResults: [
        { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9, similarity: 0.85 }
      ],
      fallbackResults: [
        { knowledge_id: 'k2', category: 'hr', key: 'policy2', value: 'test2', confidence_score: 0.8, similarity: 0.60 }
      ]
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123',
      includeShared: true
    });

    const rpcCalls = mock._getRpcCalls();
    assertEquals(rpcCalls.length, 2, 'Should make 2 RPC calls (primary + fallback)');
    assertEquals(rpcCalls[0].params.include_shared, true, 'Primary call should use include_shared: true');
    assertEquals(rpcCalls[1].params.include_shared, true, 'Fallback call should preserve include_shared: true');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - fallback preserves includeShared false",
  async fn() {
    setupFetchMock();
    
    // Primary returns < 5 results to trigger fallback
    const mock = createSemanticMock({
      primaryResults: [
        { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9, similarity: 0.85 }
      ],
      fallbackResults: [
        { knowledge_id: 'k2', category: 'hr', key: 'policy2', value: 'test2', confidence_score: 0.8, similarity: 0.60 }
      ]
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123',
      includeShared: false
    });

    const rpcCalls = mock._getRpcCalls();
    assertEquals(rpcCalls.length, 2, 'Should make 2 RPC calls (primary + fallback)');
    assertEquals(rpcCalls[0].params.include_shared, false, 'Primary call should use include_shared: false');
    assertEquals(rpcCalls[1].params.include_shared, false, 'Fallback call should preserve include_shared: false');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - returns is_shared flag from match results",
  async fn() {
    setupFetchMock();
    
    const mock = createSemanticMock({
      primaryResults: [
        { knowledge_id: 'k1', category: 'wetgeving', key: 'cao', value: 'shared data', confidence_score: 0.9, similarity: 0.85, is_shared: true },
        { knowledge_id: 'k2', category: 'hr', key: 'policy', value: 'org data', confidence_score: 0.8, similarity: 0.80, is_shared: false }
      ]
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    const results = await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123'
    });

    assertEquals(results.length, 2, 'Should return 2 results');
    assertEquals(results[0].is_shared, true, 'First result should have is_shared: true');
    assertEquals(results[1].is_shared, false, 'Second result should have is_shared: false');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - handles empty results gracefully",
  async fn() {
    setupFetchMock();
    
    const mock = createSemanticMock({
      primaryResults: [],
      fallbackResults: []
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    const results = await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123'
    });

    assertEquals(results.length, 0, 'Should return empty array');
    assertEquals(Array.isArray(results), true, 'Should return an array');
    
    restoreFetch();
  }
});

Deno.test({
  name: "semanticKnowledgeRetrieval - handles RPC error gracefully",
  async fn() {
    setupFetchMock();
    
    const mock = createSemanticMock({
      shouldError: true,
      errorMessage: 'Database connection failed'
    });

    const { semanticKnowledgeRetrieval } = await import('../semantic-retrieval.ts');
    
    const results = await semanticKnowledgeRetrieval('test question', mock, {
      orgId: 'org-123'
    });

    assertEquals(results.length, 0, 'Should return empty array on error');
    assertEquals(Array.isArray(results), true, 'Should return an array');
    
    restoreFetch();
  }
});

// ============================================================================
// TEST SUITE: calculateSemanticConfidence
// ============================================================================

Deno.test({
  name: "calculateSemanticConfidence - high confidence with verified sources",
  async fn() {
    const { calculateSemanticConfidence } = await import('../semantic-retrieval.ts');
    
    const knowledgeUsed: MockMatch[] = [
      { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.95, similarity: 0.90, validation_status: 'verified' },
      { knowledge_id: 'k2', category: 'hr', key: 'rule', value: 'test2', confidence_score: 0.92, similarity: 0.88, validation_status: 'verified' }
    ];

    const result = calculateSemanticConfidence(
      'What is the policy?',
      'The policy states that employees must follow these guidelines for professional conduct and workplace safety.',
      knowledgeUsed
    );

    assertEquals(result.confidence > 0.7, true, 'Should have high confidence');
    assertEquals(result.gaps.length, 0, 'Should have no gaps');
    assertExists(result.reasoning, 'Should have reasoning');
  }
});

Deno.test({
  name: "calculateSemanticConfidence - low confidence with no knowledge",
  async fn() {
    const { calculateSemanticConfidence } = await import('../semantic-retrieval.ts');
    
    const result = calculateSemanticConfidence(
      'What is the policy?',
      'I am not sure.',
      []
    );

    assertEquals(result.confidence < 0.5, true, 'Should have low confidence');
    assertEquals(result.gaps.includes('No knowledge base items used'), true, 'Should identify knowledge gap');
  }
});

// ============================================================================
// TEST SUITE: mergeSemanticAndCategoryResults
// ============================================================================

Deno.test({
  name: "mergeSemanticAndCategoryResults - deduplicates by knowledge_id",
  async fn() {
    const { mergeSemanticAndCategoryResults } = await import('../semantic-retrieval.ts');
    
    const semanticMatches: MockMatch[] = [
      { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9, similarity: 0.85 }
    ];

    const categoryMatches = [
      { id: 'k1', category: 'hr', key: 'policy', value: 'test', confidence_score: 0.9 },
      { id: 'k2', category: 'hr', key: 'rule', value: 'test2', confidence_score: 0.8 }
    ];

    const results = mergeSemanticAndCategoryResults(semanticMatches, categoryMatches);

    assertEquals(results.length, 2, 'Should deduplicate k1 and include both unique items');
    assertEquals(results.filter(r => r.knowledge_id === 'k1').length, 1, 'k1 should appear only once');
  }
});

Deno.test({
  name: "mergeSemanticAndCategoryResults - prioritizes semantic matches",
  async fn() {
    const { mergeSemanticAndCategoryResults } = await import('../semantic-retrieval.ts');
    
    const semanticMatches: MockMatch[] = [
      { knowledge_id: 'k1', category: 'hr', key: 'policy', value: 'semantic value', confidence_score: 0.9, similarity: 0.95 }
    ];

    const categoryMatches = [
      { id: 'k1', category: 'hr', key: 'policy', value: 'category value', confidence_score: 0.9 }
    ];

    const results = mergeSemanticAndCategoryResults(semanticMatches, categoryMatches);

    assertEquals(results[0].value, 'semantic value', 'Semantic match value should be preserved');
    assertEquals(results[0].retrieval_method, 'semantic', 'Should be marked as semantic retrieval');
  }
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        Semantic Retrieval Test Suite - 12 test cases          ║
╠═══════════════════════════════════════════════════════════════╣
║  Tests verify:                                                ║
║  • Default includeShared = true                               ║
║  • Explicit includeShared true/false                          ║
║  • Fallback call parameter consistency                        ║
║  • is_shared flag in return values                            ║
║  • Empty result handling                                      ║
║  • RPC error handling                                         ║
║  • Confidence calculation                                     ║
║  • Result merging and deduplication                           ║
╚═══════════════════════════════════════════════════════════════╝
`);
