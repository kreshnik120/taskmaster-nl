/**
 * Sublocation Match Score Calculator
 * 
 * This module provides backward-compatible matching functions that delegate
 * to the unified matchingService. Use this for Professional → Sublocation matching.
 * 
 * For new code, prefer using matchingService.ts directly.
 */

import { 
  calculateUnifiedMatchScore, 
  parseBeschikbaarheid as parseB,
} from './services/matchingService';

// Re-export interfaces for backward compatibility
export interface Professional {
  functie_niveau: string;
  regio: string | null;
  skills?: string[] | null;
  beschikbaarheidsnotities?: string | null;
  beschikbaarheid_uren?: { min: number; max: number } | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
  heeft_auto?: boolean | null;
  heeft_rijbewijs?: boolean | null;
  eigen_vervoer?: boolean | null;
  woonplaats?: string | null;
  postcode?: string | null;
  provincie?: string | null;
  jaren_ervaring?: number | null;
  leidinggevende_ervaring?: boolean | null;
  nachtdienst_bereid?: boolean | null;
  weekenddienst_bereid?: boolean | null;
  certificaten?: string[] | null;
}

export interface SublocationCriteria {
  gezochte_functies: string[];
  sector: string[];
  doelgroep: string[];
  plaats: string | null;
  provincie?: string | null;
  postcode?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
}

export interface MatchScoreBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  ervaringBonus: number;
  leidinggevendeBonus: number;
  totalScore: number;
  reasoning: string[];
}

// Re-export parseBeschikbaarheid for backward compatibility
export function parseBeschikbaarheid(beschikbaarheid: string | null): { min: number; max: number } | null {
  return parseB(beschikbaarheid);
}

/**
 * Calculate match score between a professional and sublocation criteria
 * 
 * Now delegates to the unified matchingService for consistent scoring
 * across all matching flows (Professional→Sublocation, Application→Client)
 */
export function calculateSublocationMatchScore(
  professional: Professional,
  criteria: SublocationCriteria
): MatchScoreBreakdown {
  // Delegate to unified matching service
  const result = calculateUnifiedMatchScore(
    {
      functie_niveau: professional.functie_niveau,
      regio: professional.regio,
      woonplaats: professional.woonplaats,
      postcode: professional.postcode,
      provincie: professional.provincie,
      ervaring_sector: professional.ervaring_sector,
      doelgroep_ervaring: professional.doelgroep_ervaring,
      jaren_ervaring: professional.jaren_ervaring,
      leidinggevende_ervaring: professional.leidinggevende_ervaring,
      heeft_auto: professional.heeft_auto,
      heeft_rijbewijs: professional.heeft_rijbewijs,
      eigen_vervoer: professional.eigen_vervoer,
      beschikbaarheid_uren: professional.beschikbaarheid_uren,
      nachtdienst_bereid: professional.nachtdienst_bereid,
      weekenddienst_bereid: professional.weekenddienst_bereid,
      certificaten: professional.certificaten,
    },
    {
      gezochte_functies: criteria.gezochte_functies,
      sector: criteria.sector,
      doelgroep: criteria.doelgroep,
      plaats: criteria.plaats,
      provincie: criteria.provincie,
      capaciteit_min: criteria.capaciteit_min,
      capaciteit_max: criteria.capaciteit_max,
    }
  );

  // Map to backward-compatible interface
  return {
    functieMatch: result.functieMatch,
    regioMatch: result.regioMatch,
    sectorMatch: result.sectorMatch,
    doelgroepMatch: result.doelgroepMatch,
    mobiliteitMatch: result.mobiliteitMatch,
    beschikbaarheidMatch: result.beschikbaarheidMatch,
    ervaringBonus: result.ervaringBonus,
    leidinggevendeBonus: result.leidinggevendeBonus,
    totalScore: result.normalizedScore,
    reasoning: result.reasoning,
  };
}
