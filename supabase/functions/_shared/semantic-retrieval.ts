/**
 * Semantic Knowledge Retrieval
 * Uses embeddings for semantic matching instead of keyword-based matching
 */

interface SemanticRetrievalOptions {
  orgId: string;
  threshold?: number;
  maxResults?: number;
  roleFilter?: string[];
  requireVerified?: boolean;
}

interface SemanticMatch {
  knowledge_id: string;
  category: string;
  key: string;
  value: any;
  confidence_score: number;
  similarity: number;
  role_tags?: string[];
  validation_status?: string;
}

/**
 * Generate embedding for a text query
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
 * Retrieve knowledge using semantic search
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
    requireVerified = false
  } = options;

  console.log(`🔍 Semantic retrieval for: "${question.substring(0, 100)}..."`);

  try {
    // Generate embedding for the question
    const questionEmbedding = await generateQueryEmbedding(question);

    // 🎯 PHASE 1: Primary semantic search with standard threshold
    const { data: primaryMatches, error } = await supabase.rpc('match_knowledge', {
      query_embedding: questionEmbedding,
      match_threshold: threshold,
      match_count: maxResults,
      filter_org_id: orgId,
      filter_role_tags: roleFilter.length > 0 ? roleFilter : null,
      require_verified: requireVerified
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
        require_verified: false // ⬇️ More lenient for fallback
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
        validation_status: m.validation_status
      };
    }).sort((a: any, b: any) => b.similarity - a.similarity); // Re-sort by boosted similarity
  } catch (error) {
    console.error('❌ Semantic retrieval failed:', error);
    return [];
  }
}

/**
 * Calculate semantic confidence score for an answer
 * Replaces keyword-based calculateAnswerConfidence
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
 * Merge semantic results with category-based results
 * Deduplicates and prioritizes by similarity score
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
