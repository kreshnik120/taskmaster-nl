import { supabase } from "@/integrations/supabase/client";

interface SuccessPattern {
  functie_niveau?: string;
  sector?: string;
  doelgroep?: string;
  rating?: number;
  match_score?: number;
  boost_factor: number;
  occurrence_count: number;
}

// Cache for AI success patterns (refreshed every 5 minutes)
let successPatternsCache: SuccessPattern[] = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load success patterns from AI knowledge base
 * These are patterns the AI has learned correlate with successful placements
 */
export async function loadSuccessPatterns(): Promise<SuccessPattern[]> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (successPatternsCache.length > 0 && now - lastCacheUpdate < CACHE_TTL) {
    return successPatternsCache;
  }
  
  try {
    const { data: knowledgeItems, error } = await supabase
      .from("ai_knowledge_base")
      .select("key, value, occurrence_count, confidence_score")
      .eq("category", "success_patterns")
      .is("deleted_at", null)
      .gte("confidence_score", 0.6)
      .order("occurrence_count", { ascending: false })
      .limit(50);
    
    if (error) {
      console.error("Error loading success patterns:", error);
      return successPatternsCache; // Return stale cache on error
    }
    
    // Parse knowledge items into success patterns
    const patterns: SuccessPattern[] = [];
    
    for (const item of knowledgeItems || []) {
      const value = item.value as Record<string, unknown>;
      
      // Extract pattern data from various knowledge formats
      if (value?.pattern_type === 'sector_function_success' || 
          value?.sector || value?.functie || value?.functie_niveau) {
        
        // Calculate boost factor based on rating and occurrence
        const rating = (value.rating as number) || 4;
        const baseBoost = rating >= 4.5 ? 0.12 : rating >= 4 ? 0.08 : 0.05;
        
        patterns.push({
          functie_niveau: (value.functie_niveau as string) || (value.functie as string),
          sector: value.sector as string,
          doelgroep: value.doelgroep as string,
          rating: value.rating as number,
          match_score: value.match_score as number,
          boost_factor: Math.min(0.15, baseBoost),
          occurrence_count: item.occurrence_count || 1
        });
      }
    }
    
    successPatternsCache = patterns;
    lastCacheUpdate = now;
    
    console.log(`Loaded ${patterns.length} AI success patterns for matching boost`);
    return patterns;
  } catch (err) {
    console.error("Failed to load success patterns:", err);
    return successPatternsCache;
  }
}

/**
 * Calculate AI learning boost for a match based on success patterns
 * Returns a percentage boost (0-15%) to add to the match score
 */
export function calculateAILearningBoost(
  applicantFunctie: string | null,
  applicantSectoren: string[],
  applicantDoelgroepen: string[],
  patterns: SuccessPattern[]
): { boost: number; reasons: string[] } {
  if (!patterns.length) {
    return { boost: 0, reasons: [] };
  }
  
  let totalBoost = 0;
  const reasons: string[] = [];
  
  for (const pattern of patterns) {
    let patternMatch = false;
    
    // Check functie match
    if (pattern.functie_niveau && applicantFunctie) {
      const functieMatch = pattern.functie_niveau.toLowerCase() === applicantFunctie.toLowerCase();
      if (functieMatch) {
        patternMatch = true;
      }
    }
    
    // Check sector match
    if (pattern.sector && applicantSectoren.length > 0) {
      const sectorMatch = applicantSectoren.some(
        s => s.toLowerCase() === pattern.sector!.toLowerCase()
      );
      if (sectorMatch) {
        patternMatch = true;
      }
    }
    
    // Check doelgroep match
    if (pattern.doelgroep && applicantDoelgroepen.length > 0) {
      const doelgroepMatch = applicantDoelgroepen.some(
        d => d.toLowerCase() === pattern.doelgroep!.toLowerCase()
      );
      if (doelgroepMatch) {
        patternMatch = true;
      }
    }
    
    // Apply boost if pattern matches
    if (patternMatch) {
      // Weight by occurrence count (lowered threshold from 5 to 2 for faster activation)
      const occurrenceWeight = Math.min(1, pattern.occurrence_count / 2);
      const weightedBoost = pattern.boost_factor * occurrenceWeight;
      totalBoost += weightedBoost;
      
      if (weightedBoost > 0.02) {
        const patternDesc = [
          pattern.functie_niveau,
          pattern.sector,
          pattern.doelgroep
        ].filter(Boolean).join('+');
        reasons.push(`AI geleerd: ${patternDesc} succesvol (${pattern.occurrence_count}x)`);
      }
    }
  }
  
  // Cap total boost at 15%
  const cappedBoost = Math.min(15, Math.round(totalBoost * 100));
  
  return {
    boost: cappedBoost,
    reasons: reasons.slice(0, 2) // Max 2 reasons
  };
}

/**
 * Get cached success patterns (non-async for synchronous use)
 */
export function getCachedSuccessPatterns(): SuccessPattern[] {
  return successPatternsCache;
}
