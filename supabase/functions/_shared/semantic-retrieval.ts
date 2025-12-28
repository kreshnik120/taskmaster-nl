/**
 * Semantic Knowledge Retrieval Module
 * 
 * Uses vector embeddings for semantic matching instead of keyword-based matching.
 * Provides a two-phase search with automatic fallback for sparse results.
 * 
 * @module semantic-retrieval
 * @see {@link ./docs/DATABASE_RPC_FUNCTIONS.md} for `match_knowledge` RPC documentation
 */

/**
 * Configuration options for semantic knowledge retrieval.
 */
interface SemanticRetrievalOptions {
  /** Organization UUID to filter results */
  orgId: string;
  /** Minimum similarity score (0.0-1.0), default 0.65 */
  threshold?: number;
  /** Maximum items to return, default 20 */
  maxResults?: number;
  /** Array of role tags to filter by (e.g., ['recruiter', 'planner']) */
  roleFilter?: string[];
  /** Only return verified knowledge items, default false */
  requireVerified?: boolean;
  /** 
   * Include shared knowledge from other organizations (wetgeving, CAO, compliance).
   * 
   * **IMPORTANT:** Should be `true` for all user-facing AI responses to ensure
   * compliance-critical knowledge is included. Set to `false` only for health
   * checks or organization-specific analytics.
   * 
   * @default true
   */
  includeShared?: boolean;
}

/**
 * Represents a knowledge item matched via semantic search.
 */
interface SemanticMatch {
  /** Unique identifier of the knowledge item */
  knowledge_id: string;
  /** Knowledge category (e.g., 'wetgeving', 'cao', 'bedrijfsinfo') */
  category: string;
  /** Knowledge key/title */
  key: string;
  /** Full knowledge content as JSONB */
  value: any;
  /** Source confidence score (0.0-1.0) */
  confidence_score: number;
  /** Cosine similarity to query (0.0-1.0) */
  similarity: number;
  /** Applicable roles for this knowledge */
  role_tags?: string[];
  /** Verification status ('verified', 'pending', 'rejected') */
  validation_status?: string;
  /** Whether this is shared cross-organization knowledge */
  is_shared?: boolean;
}

/**
 * Generate embedding for a text query using Lovable AI gateway.
 * 
 * @param text - The text to generate an embedding for
 * @returns 1536-dimensional embedding vector
 * @throws Error if the embedding API call fails
 */
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Retrieve knowledge using semantic search via the `match_knowledge` RPC function.
 * 
 * @description
 * Performs a two-phase semantic search:
 * 1. Primary search with configured threshold (default 0.65)
 * 2. Fallback search at 0.55 if primary returns < 5 results
 * 
 * The function uses the V3 (9-parameter) version of `match_knowledge` which
 * supports verified-only filtering and shared knowledge control.
 * 
 * @param question - The user's question or query text
 * @param supabase - Supabase client instance
 * @param options - Search configuration options
 * 
 * @returns Promise<SemanticMatch[]> - Array of matching knowledge items sorted by similarity
 * 
 * @example
 * ```typescript
 * // Standard user-facing query (includes shared knowledge)
 * const matches = await semanticKnowledgeRetrieval(
 *   "Wat is de CAO-verhoging voor 2024?",
 *   supabase,
 *   { 
 *     orgId: "550e8400-e29b-41d4-a716-446655440000",
 *     includeShared: true // Default, ensures wetgeving/CAO is included
 *   }
 * );
 * 
 * // Health check (excludes shared for speed)
 * const healthCheck = await semanticKnowledgeRetrieval(
 *   "test",
 *   supabase,
 *   { 
 *     orgId: orgId,
 *     threshold: 0.99,
 *     maxResults: 1,
 *     includeShared: false // Faster, org-specific only
 *   }
 * );
 * ```
 * 
 * @see {@link ./docs/DATABASE_RPC_FUNCTIONS.md} for `match_knowledge` parameter details
 */
export async function semanticKnowledgeRetrieval(
  question: string,
  supabase: any,
  options: SemanticRetrievalOptions
): Promise<SemanticMatch[]> {
  const {
    orgId,
    threshold = 0.65, // ⬇️ LOWERED from 0.75 to 0.65 (allows more matches)
    maxResults = 20,
    roleFilter = [],
    requireVerified = false,
    includeShared = true // ✅ Default: include shared knowledge (wetgeving, CAO, etc.)
  } = options;

  console.log(`🔍 Semantic retrieval for: "${question.substring(0, 100)}..."`);

  try {
    // Generate embedding for the question
    const questionEmbedding = await generateQueryEmbedding(question);

    // 🎯 PHASE 1: Primary semantic search with standard threshold
    // Uses V3 of match_knowledge with include_shared parameter
    const { data: primaryMatches, error } = await supabase.rpc('match_knowledge', {
      query_embedding: questionEmbedding,
      match_threshold: threshold,
      match_count: maxResults,
      filter_org_id: orgId,
      filter_role_tags: roleFilter.length > 0 ? roleFilter : null,
      require_verified: requireVerified,
      include_shared: includeShared // ✅ Include shared knowledge (wetgeving, CAO, compliance)
    });

    if (error) {
      console.error('❌ Semantic retrieval error:', error);
      return [];
    }

    // 🎯 PHASE 2: If insufficient results, try with lower threshold (0.55)
    let allMatches = primaryMatches || [];
    if (allMatches.length < 5) {
      console.log(`⚠️ Only ${allMatches.length} primary matches, trying lower threshold (0.55)...`);
      
      const { data: fallbackMatches } = await supabase.rpc('match_knowledge', {
        query_embedding: questionEmbedding,
        match_threshold: 0.55,
        match_count: maxResults,
        filter_org_id: orgId,
        filter_role_tags: roleFilter.length > 0 ? roleFilter : null,
        require_verified: false, // ⬇️ More lenient for fallback
        include_shared: includeShared // ✅ Keep shared knowledge in fallback
      });

      if (fallbackMatches && fallbackMatches.length > 0) {
        // Merge and deduplicate
        const existingIds = new Set(allMatches.map((m: any) => m.knowledge_id));
        const newMatches = fallbackMatches.filter((m: any) => !existingIds.has(m.knowledge_id));
        allMatches = [...allMatches, ...newMatches];
        console.log(`✅ Added ${newMatches.length} fallback matches (total: ${allMatches.length})`);
      }
    }

    if (!allMatches || allMatches.length === 0) {
      console.log('⚠️ No semantic matches found (even with fallback)');
      return [];
    }

    console.log(`✅ Found ${allMatches.length} semantic matches (avg similarity: ${
      (allMatches.reduce((sum: number, m: any) => sum + m.similarity, 0) / allMatches.length).toFixed(3)
    })`);

    // 🎯 PHASE 3: Boost scores for high-usage items (proven relevance)
    const matchIds = allMatches.map((m: any) => m.knowledge_id);
    
    // 🎯 PHASE 4: UPDATE USAGE TRACKING (fire-and-forget)
    if (matchIds.length > 0) {
      console.log(`📊 Tracking usage for ${matchIds.length} knowledge items...`);
      supabase
        .from('ai_knowledge_base')
        .update({ 
          usage_count: supabase.rpc ? undefined : 1, // Fallback
          last_used_at: new Date().toISOString()
        })
        .in('id', matchIds)
        .then(async () => {
          // Use RPC for atomic increment
          for (const id of matchIds) {
            await supabase.rpc('increment_usage_count', { knowledge_id: id }).catch(() => {
              // Fallback: direct update if RPC doesn't exist
              supabase
                .from('ai_knowledge_base')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', id);
            });
          }
        })
        .catch((err: any) => console.warn('⚠️ Usage tracking failed (non-blocking):', err));
    }
    
    return allMatches.map((m: any) => {
      let boostedSimilarity = m.similarity;
      
      // Boost items that have been used frequently (proven relevance)
      if (m.usage_count > 50) {
        boostedSimilarity = Math.min(1.0, m.similarity + 0.05); // +5% boost
      } else if (m.usage_count > 20) {
        boostedSimilarity = Math.min(1.0, m.similarity + 0.03); // +3% boost
      }
      
      return {
        knowledge_id: m.knowledge_id,
        category: m.category,
        key: m.key,
        value: m.value,
        confidence_score: m.confidence_score,
        similarity: boostedSimilarity,
        original_similarity: m.similarity,
        usage_count: m.usage_count,
        role_tags: m.role_tags,
        validation_status: m.validation_status,
        is_shared: m.is_shared // ✅ Include shared flag for transparency
      };
    }).sort((a: any, b: any) => b.similarity - a.similarity); // Re-sort by boosted similarity
  } catch (error) {
    console.error('❌ Semantic retrieval failed:', error);
    return [];
  }
}

/**
 * Calculate semantic confidence score for an AI-generated answer.
 * 
 * Evaluates answer quality based on:
 * - Average semantic similarity of knowledge used (40% weight)
 * - Source confidence scores (30% weight)
 * - Verification status ratio (20% weight)
 * - Answer completeness/length (10% weight)
 * 
 * @param question - The original user question
 * @param answer - The AI-generated answer
 * @param knowledgeUsed - Array of knowledge items used to generate the answer
 * 
 * @returns Object containing confidence score (0.0-1.0), reasoning, and identified gaps
 * 
 * @example
 * ```typescript
 * const { confidence, reasoning, gaps } = calculateSemanticConfidence(
 *   "Wat is de opzegtermijn?",
 *   "De opzegtermijn is 1 maand volgens de CAO.",
 *   matchedKnowledge
 * );
 * // confidence: 0.85
 * // reasoning: "High confidence: Strong semantic matches with verified sources"
 * // gaps: []
 * ```
 */
export function calculateSemanticConfidence(
  question: string,
  answer: string,
  knowledgeUsed: SemanticMatch[]
): {
  confidence: number;
  reasoning: string;
  gaps: string[];
} {
  const gaps: string[] = [];
  let totalScore = 0;
  let factors = 0;

  // Factor 1: Average semantic similarity of knowledge used
  if (knowledgeUsed.length > 0) {
    const avgSimilarity = knowledgeUsed.reduce((sum, kb) => sum + kb.similarity, 0) / knowledgeUsed.length;
    totalScore += avgSimilarity * 40; // 40% weight
    factors++;
  } else {
    gaps.push('No knowledge base items used');
  }

  // Factor 2: Source quality (confidence scores)
  if (knowledgeUsed.length > 0) {
    const avgConfidence = knowledgeUsed.reduce((sum, kb) => sum + kb.confidence_score, 0) / knowledgeUsed.length;
    totalScore += avgConfidence * 30; // 30% weight
    factors++;

    if (avgConfidence < 0.7) {
      gaps.push('Low source confidence scores');
    }
  }

  // Factor 3: Validation status
  const verifiedCount = knowledgeUsed.filter(kb => kb.validation_status === 'verified').length;
  if (knowledgeUsed.length > 0) {
    const verifiedRatio = verifiedCount / knowledgeUsed.length;
    totalScore += verifiedRatio * 20; // 20% weight
    factors++;

    if (verifiedRatio < 0.5) {
      gaps.push('Less than 50% of sources are verified');
    }
  }

  // Factor 4: Answer completeness (length check as proxy)
  const answerLength = answer.length;
  if (answerLength < 50) {
    totalScore += 5; // Very short answer
    gaps.push('Answer is very short');
  } else if (answerLength < 150) {
    totalScore += 10; // Short answer
  } else {
    totalScore += 10; // Adequate length
  }
  factors++;

  const confidence = factors > 0 ? totalScore / 100 : 0.5;

  let reasoning = '';
  if (confidence >= 0.85) {
    reasoning = 'High confidence: Strong semantic matches with verified sources';
  } else if (confidence >= 0.70) {
    reasoning = 'Good confidence: Relevant knowledge with decent source quality';
  } else if (confidence >= 0.50) {
    reasoning = 'Moderate confidence: Some gaps in knowledge or source quality';
  } else {
    reasoning = 'Low confidence: Significant gaps in available knowledge';
  }

  return {
    confidence: Math.min(1.0, Math.max(0.0, confidence)),
    reasoning,
    gaps
  };
}

/**
 * Merge semantic search results with category-based results.
 * 
 * Deduplicates by knowledge_id and prioritizes semantic matches over
 * category-only matches. Final results are sorted by match score.
 * 
 * @param semanticMatches - Results from semantic search
 * @param categoryMatches - Results from category-based search
 * 
 * @returns Merged and deduplicated results sorted by match score
 * 
 * @example
 * ```typescript
 * const merged = mergeSemanticAndCategoryResults(
 *   semanticResults,  // From semanticKnowledgeRetrieval()
 *   categoryResults   // From traditional category lookup
 * );
 * // Returns combined results with semantic matches prioritized
 * ```
 */
export function mergeSemanticAndCategoryResults(
  semanticMatches: SemanticMatch[],
  categoryMatches: any[]
): any[] {
  const merged = new Map<string, any>();

  // Add semantic matches first (higher priority)
  for (const match of semanticMatches) {
    merged.set(match.knowledge_id, {
      ...match,
      retrieval_method: 'semantic',
      match_score: match.similarity
    });
  }

  // Add category matches if not already present
  for (const match of categoryMatches) {
    if (!merged.has(match.id)) {
      merged.set(match.id, {
        knowledge_id: match.id,
        category: match.category,
        key: match.key,
        value: match.value,
        confidence_score: match.confidence_score,
        similarity: 0, // No semantic similarity for category-only matches
        retrieval_method: 'category',
        match_score: match.confidence_score || 0.5
      });
    }
  }

  // Sort by match score (similarity or confidence)
  return Array.from(merged.values()).sort((a, b) => b.match_score - a.match_score);
}
