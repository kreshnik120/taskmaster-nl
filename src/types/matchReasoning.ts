/**
 * TypeScript interface for stored match reasoning in assignments.ai_match_reasoning
 * Ensures consistent data structure for match breakdown persistence and retrieval
 */

// Aligned with matchingService.ts CategoryContribution interface
export interface CategoryContribution {
  points: number;
  max: number;
  percentage: number;
}

// Aligned with matchingService.ts grouped categories
export interface CategoryContributions {
  geschiktheid: CategoryContribution;
  locatie: CategoryContribution;
  ervaring: CategoryContribution;
  praktisch: CategoryContribution;
}

export interface MatchDetails {
  functie_match_type?: 'exact' | 'compatible' | 'partial' | 'none';
  matched_sectors?: string[];
  matched_doelgroepen?: string[];
  distance_km?: number;
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
  
  if (!hasBasicScore) return false;
  
  // If categoryContributions exists, it must have the correct structure (points/max, not score/maxScore)
  if (reasoning.categoryContributions) {
    const cc = reasoning.categoryContributions;
    // Check for new structure (geschiktheid/locatie/ervaring/praktisch with points/max)
    const hasValidStructure = 
      cc.geschiktheid && typeof cc.geschiktheid.points === 'number' &&
      cc.locatie && typeof cc.locatie.points === 'number';
    
    // If old structure (functie/sector with score/maxScore), invalidate so fallback is calculated
    const hasOldStructure = cc.functie && typeof cc.functie.score === 'number';
    
    if (hasOldStructure && !hasValidStructure) {
      return false; // Force fallback for old data structure
    }
  }
  
  return true;
}

