import { supabase } from "@/integrations/supabase/client";
import { 
  getFunctieCompatibility, 
  getSectorAffinity, 
  getDoelgroepCompatibility 
} from "@/lib/constants/aiDomainKnowledge";

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
      .gte("confidence_score", 0.4) // Lowered from 0.6 to include more learned patterns
      .order("occurrence_count", { ascending: false })
      .limit(100); // Increased from 50
    
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
          value?.pattern_type === 'pipeline_learned' ||
          value?.sector || value?.functie || value?.functie_niveau) {
        
        // Use stored boost_factor if available, otherwise calculate
        const storedBoost = value.boost_factor as number;
        const rating = (value.rating as number) || 4;
        const baseBoost = storedBoost || (rating >= 4.5 ? 0.12 : rating >= 4 ? 0.08 : 0.05);
        
        patterns.push({
          functie_niveau: (value.functie_niveau as string) || (value.functie as string),
          sector: value.sector as string,
          doelgroep: value.doelgroep as string,
          rating: value.rating as number,
          match_score: value.match_score as number,
          boost_factor: Math.min(0.20, baseBoost), // Allow up to 20% boost
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
 * Calculate AI learning boost for a match based on success patterns AND domain knowledge
 * Returns a percentage boost (0-20%) to add to the match score
 */
export function calculateAILearningBoost(
  applicantFunctie: string | null,
  applicantSectoren: string[],
  applicantDoelgroepen: string[],
  patterns: SuccessPattern[],
  // Optional: target requirements for domain knowledge boost
  targetFunctie?: string | null,
  targetSectoren?: string[],
  targetDoelgroepen?: string[]
): { boost: number; reasons: string[]; domainBoost: number; patternBoost: number } {
  let patternBoost = 0;
  let domainBoost = 0;
  const reasons: string[] = [];
  
  // === PART 1: Pattern-based boost from learned success patterns ===
  if (patterns.length > 0) {
    for (const pattern of patterns) {
      let patternMatch = false;
      let matchStrength = 0;
      
      // Check functie match with domain knowledge compatibility
      if (pattern.functie_niveau && applicantFunctie) {
        const exactMatch = pattern.functie_niveau.toLowerCase() === applicantFunctie.toLowerCase();
        if (exactMatch) {
          patternMatch = true;
          matchStrength += 1.0;
        } else {
          // Use domain knowledge for fuzzy function matching
          const compatibility = getFunctieCompatibility(applicantFunctie, pattern.functie_niveau);
          if (compatibility >= 0.6) {
            patternMatch = true;
            matchStrength += compatibility;
          }
        }
      }
      
      // Check sector match with domain knowledge affinity
      if (pattern.sector && applicantSectoren.length > 0) {
        const exactSectorMatch = applicantSectoren.some(
          s => s.toLowerCase() === pattern.sector!.toLowerCase()
        );
        if (exactSectorMatch) {
          patternMatch = true;
          matchStrength += 1.0;
        } else {
          // Use domain knowledge for sector affinity
          const affinity = getSectorAffinity(applicantSectoren, [pattern.sector]);
          if (affinity.score >= 0.5) {
            patternMatch = true;
            matchStrength += affinity.score;
          }
        }
      }
      
      // Check doelgroep match with domain knowledge compatibility
      if (pattern.doelgroep && applicantDoelgroepen.length > 0) {
        const exactDoelgroepMatch = applicantDoelgroepen.some(
          d => d.toLowerCase() === pattern.doelgroep!.toLowerCase()
        );
        if (exactDoelgroepMatch) {
          patternMatch = true;
          matchStrength += 1.0;
        } else {
          const compatibility = getDoelgroepCompatibility(applicantDoelgroepen, [pattern.doelgroep]);
          if (compatibility.score >= 0.5) {
            patternMatch = true;
            matchStrength += compatibility.score;
          }
        }
      }
      
      // Apply boost if pattern matches
      if (patternMatch && matchStrength > 0) {
        // Weight by occurrence count (threshold of 1 - even single occurrence counts)
        const occurrenceWeight = Math.min(1, pattern.occurrence_count / 1);
        // Weight by match strength (how well the applicant matches the pattern)
        const strengthWeight = matchStrength / 3; // Normalize to 0-1
        const weightedBoost = pattern.boost_factor * occurrenceWeight * strengthWeight;
        patternBoost += weightedBoost;
        
        if (weightedBoost > 0.01) {
          const patternDesc = [
            pattern.functie_niveau,
            pattern.sector,
            pattern.doelgroep
          ].filter(Boolean).join('+');
          reasons.push(`✨ AI geleerd: ${patternDesc} (${pattern.occurrence_count}x succesvol)`);
        }
      }
    }
  }
  
  // === PART 2: Domain knowledge boost for target matching ===
  if (targetFunctie || targetSectoren?.length || targetDoelgroepen?.length) {
    // Function compatibility boost
    if (applicantFunctie && targetFunctie) {
      const funcCompatibility = getFunctieCompatibility(applicantFunctie, targetFunctie);
      if (funcCompatibility > 0.5 && funcCompatibility < 1.0) {
        domainBoost += (funcCompatibility - 0.5) * 0.06; // Max 3% boost
        reasons.push(`🎯 ${applicantFunctie} past bij ${targetFunctie} (${Math.round(funcCompatibility * 100)}%)`);
      }
    }
    
    // Sector affinity boost
    if (applicantSectoren.length > 0 && targetSectoren?.length) {
      const sectorAffinity = getSectorAffinity(applicantSectoren, targetSectoren);
      if (sectorAffinity.score > 0.5 && sectorAffinity.score < 1.0) {
        domainBoost += (sectorAffinity.score - 0.5) * 0.04; // Max 2% boost
        reasons.push(`📊 ${sectorAffinity.reason}`);
      }
    }
    
    // Doelgroep compatibility boost
    if (applicantDoelgroepen.length > 0 && targetDoelgroepen?.length) {
      const doelgroepCompat = getDoelgroepCompatibility(applicantDoelgroepen, targetDoelgroepen);
      if (doelgroepCompat.score > 0.5 && doelgroepCompat.score < 1.0) {
        domainBoost += (doelgroepCompat.score - 0.5) * 0.04; // Max 2% boost
        reasons.push(`👥 ${doelgroepCompat.reason}`);
      }
    }
  }
  
  // Cap total boosts
  const cappedPatternBoost = Math.min(15, Math.round(patternBoost * 100));
  const cappedDomainBoost = Math.min(7, Math.round(domainBoost * 100));
  const totalBoost = Math.min(20, cappedPatternBoost + cappedDomainBoost);
  
  return {
    boost: totalBoost,
    patternBoost: cappedPatternBoost,
    domainBoost: cappedDomainBoost,
    reasons: reasons.slice(0, 3) // Max 3 reasons
  };
}

/**
 * Get cached success patterns (non-async for synchronous use)
 */
export function getCachedSuccessPatterns(): SuccessPattern[] {
  return successPatternsCache;
}
