/**
 * TypeScript interface for stored match reasoning in assignments.ai_match_reasoning
 * Ensures consistent data structure for match breakdown persistence and retrieval
 */

export interface CategoryContribution {
  score: number;
  maxScore: number;
  percentage: number;
}

export interface CategoryContributions {
  functie?: CategoryContribution;
  sector?: CategoryContribution;
  regio?: CategoryContribution;
  doelgroep?: CategoryContribution;
  beschikbaarheid?: CategoryContribution;
  mobiliteit?: CategoryContribution;
  werkvorm?: CategoryContribution;
}

export interface MatchDetails {
  functie_match_type?: 'exact' | 'compatible' | 'partial' | 'none';
  matched_sectors?: string[];
  matched_doelgroepen?: string[];
  distance_km?: number;
  postcode_match?: boolean;
  provincie_match?: boolean;
  expert_matches?: string[];
  track_record_placements?: number;
  track_record_rehire_rate?: number;
}

export interface StoredMatchReasoning {
  // Metadata
  calculated_at: string;
  source: 'direct_placement_button' | 'sollicitaties_kanban' | 'professional_detail_modal' | 'application_matches_tab';
  pipeline_stage?: string;
  match_score: number | null;
  
  // Core breakdown scores (0-100 scale normalized)
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  werkvormMatch: number;
  aiBoost: number;
  
  // Aggregated scores
  totalScore: number;
  normalizedScore: number;
  
  // Feature flags
  hasAIBoost: boolean;
  hasTrackRecord?: boolean;
  hasExpertAdvies?: boolean;
  
  // AI boost reasons (required for MatchScoreBreakdown)
  aiBoostReasons: string[];
  
  // Detailed breakdown data
  details: MatchDetails;
  categoryContributions?: CategoryContributions;
  
  // Context data for reference
  professional_data: {
    functie_niveau?: string | null;
    ervaring_sector?: string[] | null;
    regio?: string | null;
    werkvorm?: string | null;
    postcode?: string | null;
    doelgroep_ervaring?: string[] | null;
  };
  
  sublocation_data: {
    naam: string;
    sector?: string[] | null;
    gezochte_functies?: string[] | null;
    plaats?: string | null;
    provincie?: string | null;
  };
}

/**
 * Type guard to check if ai_match_reasoning has full breakdown data
 */
export function hasFullBreakdown(reasoning: any): reasoning is StoredMatchReasoning {
  return reasoning && 
    typeof reasoning.functieMatch === 'number' &&
    typeof reasoning.totalScore === 'number' &&
    reasoning.details !== undefined;
}

/**
 * Check if breakdown data is valid and complete enough to render MatchScoreBreakdown
 * Used to decide between full breakdown vs simple fallback display
 */
export function isValidMatchBreakdown(reasoning: any): boolean {
  if (!reasoning || typeof reasoning !== 'object') return false;
  
  // Check it's not an empty object
  const hasContent = Object.keys(reasoning).length > 0;
  if (!hasContent) return false;
  
  // Must have at least totalScore or functieMatch to be renderable
  const hasBasicScore = typeof reasoning.totalScore === 'number' || 
                        typeof reasoning.normalizedScore === 'number' ||
                        typeof reasoning.functieMatch === 'number';
  
  return hasBasicScore;
}

/**
 * Extract display-ready breakdown from stored reasoning
 * Ensures aiBoostReasons is always an array to prevent crashes
 */
export function extractBreakdownForDisplay(reasoning: any): Partial<StoredMatchReasoning> | null {
  if (!reasoning) return null;
  
  if (hasFullBreakdown(reasoning)) {
    // Ensure aiBoostReasons is always an array (null-safe)
    return {
      ...reasoning,
      aiBoostReasons: reasoning.aiBoostReasons || []
    };
  }
  
  // Legacy format - try to extract what we can
  return {
    match_score: reasoning.score_breakdown?.match_score || reasoning.match_score || null,
    functieMatch: 0,
    regioMatch: 0,
    sectorMatch: 0,
    doelgroepMatch: 0,
    mobiliteitMatch: 0,
    beschikbaarheidMatch: 0,
    werkvormMatch: 0,
    aiBoost: 0,
    totalScore: reasoning.score_breakdown?.match_score || 0,
    normalizedScore: reasoning.score_breakdown?.match_score || 0,
    hasAIBoost: false,
    aiBoostReasons: [],
    details: {},
    professional_data: reasoning.professional_data || {},
    sublocation_data: reasoning.sublocation_data || {},
    calculated_at: reasoning.calculated_at || '',
    source: reasoning.source || reasoning.score_breakdown?.source || 'unknown' as any,
  };
}
