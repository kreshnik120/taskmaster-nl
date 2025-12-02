interface Professional {
  functie_niveau: string;
  regio: string | null;
  skills?: string[] | null;
  beschikbaarheidsnotities: string | null;
  beschikbaarheid_uren?: { min: number; max: number } | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
  heeft_auto?: boolean | null;
  heeft_rijbewijs?: boolean | null;
  eigen_vervoer?: boolean | null;
  woonplaats?: string | null;
  postcode?: string | null;
  provincie?: string | null;
}

interface SublocationCriteria {
  gezochte_functies: string[];
  sector: string[];
  doelgroep: string[];
  plaats: string | null;
  provincie?: string | null;
  postcode?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
}

interface MatchScoreBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  totalScore: number;
  reasoning: string[];
}

// Functie equivalentie matrix - Alle 17 healthcare functies met hiërarchische compatibiliteit
const FUNCTIE_COMPATIBILITY: Record<string, { compatible: string[]; score: number }> = {
  // Zorg hiërarchie (5 functies)
  "HBO-V": { compatible: ["HBO-V", "Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende"], score: 25 },
  "Verpleegkundige MBO": { compatible: ["Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende", "HBO-V"], score: 25 },
  "Verpleegkundige": { compatible: ["Verpleegkundige", "HBO-V", "Verpleegkundige MBO", "VIG"], score: 25 },
  "VIG": { compatible: ["VIG", "Verzorgende IG", "Helpende", "Verpleegkundige MBO"], score: 25 },
  "Verzorgende IG": { compatible: ["Verzorgende IG", "Helpende", "VIG"], score: 25 },
  "Helpende": { compatible: ["Helpende", "Verzorgende IG"], score: 25 },
  
  // Begeleiding hiërarchie (6 functies)
  "GGZ-agoog": { compatible: ["GGZ-agoog", "Maatschappelijk werker", "Verslavingswerker", "Begeleider"], score: 25 },
  "Maatschappelijk werker": { compatible: ["Maatschappelijk werker", "GGZ-agoog", "Verslavingswerker"], score: 25 },
  "Verslavingswerker": { compatible: ["Verslavingswerker", "GGZ-agoog", "Maatschappelijk werker"], score: 25 },
  "Begeleider": { compatible: ["Begeleider", "Persoonlijk begeleider", "Pedagogisch medewerker", "Job coach"], score: 25 },
  "Persoonlijk begeleider": { compatible: ["Persoonlijk begeleider", "Begeleider", "Pedagogisch medewerker"], score: 25 },
  "Pedagogisch medewerker": { compatible: ["Pedagogisch medewerker", "Begeleider", "Persoonlijk begeleider"], score: 25 },
  "Job coach": { compatible: ["Job coach", "Begeleider"], score: 25 },
  
  // Therapie functies (4 functies - beperkte overlap)
  "Kunsttherapeut": { compatible: ["Kunsttherapeut", "Muziektherapeut", "Activiteitenbegeleider"], score: 25 },
  "Muziektherapeut": { compatible: ["Muziektherapeut", "Kunsttherapeut", "Activiteitenbegeleider"], score: 25 },
  "Activiteitenbegeleider": { compatible: ["Activiteitenbegeleider", "Kunsttherapeut", "Muziektherapeut"], score: 25 },
  "Gedragswetenschapper": { compatible: ["Gedragswetenschapper"], score: 25 }, // Specialist, geen overlap
  
  // Overige functies (3 functies - geen overlap)
  "Sportinstructeur": { compatible: ["Sportinstructeur"], score: 25 },
  "Agrarisch medewerker": { compatible: ["Agrarisch medewerker"], score: 25 },
  "Hovenier": { compatible: ["Hovenier"], score: 25 },
};

import { SECTOR_SIMILARITY, DOELGROEP_RELATIONS } from './constants/matchingConstants';

// Parse beschikbaarheid string naar uren object
export function parseBeschikbaarheid(beschikbaarheid: string | null): { min: number; max: number } | null {
  if (!beschikbaarheid) return null;
  
  const text = beschikbaarheid.toLowerCase();
  
  // "32-40 uur/week" → { min: 32, max: 40 }
  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  }
  
  // "<24 uur" → { min: 0, max: 24 }
  const lessThanMatch = text.match(/<\s*(\d+)/);
  if (lessThanMatch) {
    return { min: 0, max: parseInt(lessThanMatch[1]) };
  }
  
  // "24-32 uur" → { min: 24, max: 32 }
  const simpleRangeMatch = text.match(/(\d+)\s*tot\s*(\d+)|(\d+)\s*-\s*(\d+)/);
  if (simpleRangeMatch) {
    const min = parseInt(simpleRangeMatch[1] || simpleRangeMatch[3]);
    const max = parseInt(simpleRangeMatch[2] || simpleRangeMatch[4]);
    return { min, max };
  }
  
  // "Flexibel" → null (geen restrictie)
  if (text.includes("flexibel")) {
    return null;
  }
  
  return null;
}

// Jaccard similarity calculator voor array overlap
function calculateJaccardSimilarity(set1: string[], set2: string[]): number {
  if (set1.length === 0 || set2.length === 0) return 0;
  
  const intersection = set1.filter(item => 
    set2.some(s => s.toLowerCase() === item.toLowerCase())
  );
  const union = [...new Set([...set1, ...set2])];
  
  return intersection.length / union.length;
}

// Semantische sector matching - houdt rekening met gerelateerde sectoren
function calculateSemanticSectorMatch(
  profSectoren: string[],
  locatieSectoren: string[]
): { score: number; directMatches: string[]; relatedMatches: string[] } {
  if (profSectoren.length === 0 || locatieSectoren.length === 0) {
    return { score: 0, directMatches: [], relatedMatches: [] };
  }

  // Directe matches (100% credit)
  const directMatches = profSectoren.filter(profS =>
    locatieSectoren.some(locS => locS.toLowerCase() === profS.toLowerCase())
  );

  // Gerelateerde matches (60-70% credit via similarity score)
  const relatedMatches: string[] = [];
  let relatedScore = 0;

  profSectoren.forEach(profS => {
    const relation = SECTOR_SIMILARITY[profS];
    if (relation) {
      const relatedFound = relation.related.filter(relS =>
        locatieSectoren.some(locS => locS.toLowerCase() === relS.toLowerCase())
      );
      if (relatedFound.length > 0 && !directMatches.includes(profS)) {
        relatedMatches.push(...relatedFound);
        relatedScore += relation.similarity * relatedFound.length;
      }
    }
  });

  // Combined score: directe matches krijgen 1.0, gerelateerde krijgen ~0.6-0.7
  const totalWeight = directMatches.length * 1.0 + relatedScore;
  const maxWeight = locatieSectoren.length * 1.0;
  const score = maxWeight > 0 ? totalWeight / maxWeight : 0;

  return {
    score: Math.min(1, score),
    directMatches: [...new Set(directMatches)],
    relatedMatches: [...new Set(relatedMatches)],
  };
}

// Semantische doelgroep matching - houdt rekening met gerelateerde doelgroepen
function calculateSemanticDoelgroepMatch(
  profDoelgroepen: string[],
  locatieDoelgroepen: string[]
): { score: number; directMatches: string[]; relatedMatches: string[] } {
  if (profDoelgroepen.length === 0 || locatieDoelgroepen.length === 0) {
    return { score: 0, directMatches: [], relatedMatches: [] };
  }

  // Directe matches (100% credit)
  const directMatches = profDoelgroepen.filter(profD =>
    locatieDoelgroepen.some(locD => locD.toLowerCase() === profD.toLowerCase())
  );

  // Gerelateerde matches (60% credit via similarity score)
  const relatedMatches: string[] = [];
  let relatedScore = 0;

  profDoelgroepen.forEach(profD => {
    const relation = DOELGROEP_RELATIONS[profD];
    if (relation) {
      const relatedFound = relation.related.filter(relD =>
        locatieDoelgroepen.some(locD => locD.toLowerCase() === relD.toLowerCase())
      );
      if (relatedFound.length > 0 && !directMatches.includes(profD)) {
        relatedMatches.push(...relatedFound);
        relatedScore += relation.similarity * relatedFound.length;
      }
    }
  });

  // Combined score: directe matches krijgen 1.0, gerelateerde krijgen ~0.6
  const totalWeight = directMatches.length * 1.0 + relatedScore;
  const maxWeight = locatieDoelgroepen.length * 1.0;
  const score = maxWeight > 0 ? totalWeight / maxWeight : 0;

  return {
    score: Math.min(1, score),
    directMatches: [...new Set(directMatches)],
    relatedMatches: [...new Set(relatedMatches)],
  };
}

// Detecteer of locatie landelijk/afgelegen is
function isRuralLocation(plaats: string | null, provincie: string | null): boolean {
  if (!plaats && !provincie) return false;
  
  const ruralProvinces = ["drenthe", "friesland", "zeeland"];
  const urbanCities = ["amsterdam", "rotterdam", "utrecht", "den haag", "eindhoven", "groningen"];
  
  const plaatsLower = plaats?.toLowerCase() || "";
  const provincieLower = provincie?.toLowerCase() || "";
  
  // Check if in major urban area
  if (urbanCities.some(city => plaatsLower.includes(city))) return false;
  
  // Check if in rural province
  if (ruralProvinces.some(prov => provincieLower.includes(prov))) return true;
  
  return false;
}

export function calculateSublocationMatchScore(
  professional: Professional,
  criteria: SublocationCriteria
): MatchScoreBreakdown {
  const reasoning: string[] = [];
  let functieMatch = 0;
  let regioMatch = 0;
  let sectorMatch = 0;
  let doelgroepMatch = 0;
  let mobiliteitMatch = 0;
  let beschikbaarheidMatch = 0;

  // ===== 1. FUNCTIE EQUIVALENTIE MATCH (25 punten) =====
  if (criteria.gezochte_functies.length > 0) {
    const profFunctie = professional.functie_niveau;
    const compatibility = FUNCTIE_COMPATIBILITY[profFunctie];
    
    if (compatibility) {
      // Check if professional's function is compatible with any sought function
      const hasCompatibleMatch = criteria.gezochte_functies.some(
        (func) => compatibility.compatible.includes(func)
      );
      
      if (hasCompatibleMatch) {
        // Exact match gets full points
        if (criteria.gezochte_functies.includes(profFunctie)) {
          functieMatch = 25;
          reasoning.push(`✅ Functie: ${profFunctie} - Exact match`);
        } else {
          // Compatible match gets 17 points
          functieMatch = 17;
          const compatibleFuncs = criteria.gezochte_functies.filter(f => 
            compatibility.compatible.includes(f)
          );
          reasoning.push(`✅ Functie: ${profFunctie} compatibel met ${compatibleFuncs.join(", ")}`);
        }
      } else {
        reasoning.push(`❌ Functie: ${profFunctie} niet compatibel met ${criteria.gezochte_functies.join(", ")}`);
      }
    } else {
      // No compatibility matrix entry, use simple match
      const simpleMatch = criteria.gezochte_functies.some(
        (func) => func.toLowerCase() === profFunctie.toLowerCase()
      );
      if (simpleMatch) {
        functieMatch = 25;
        reasoning.push(`✅ Functie: ${profFunctie} - Match`);
      }
    }
  } else {
    functieMatch = 8; // Lower credit if no criteria
  }

  // ===== 2. REGIO + MOBILITEIT MATCH (20 punten) =====
  const isRural = isRuralLocation(criteria.plaats, criteria.provincie);
  const hasTransport = professional.heeft_auto || professional.heeft_rijbewijs || professional.eigen_vervoer;
  
  if (professional.regio && criteria.plaats) {
    const profRegioLower = professional.regio.toLowerCase();
    const plaatsLower = criteria.plaats.toLowerCase();
    const profWoonplaatsLower = professional.woonplaats?.toLowerCase() || "";
    const profProvincieLower = professional.provincie?.toLowerCase() || "";

    // Exact match (stad of provincie)
    if (
      profRegioLower === plaatsLower ||
      profWoonplaatsLower === plaatsLower ||
      profRegioLower.includes(plaatsLower) ||
      plaatsLower.includes(profRegioLower)
    ) {
      regioMatch = 20;
      reasoning.push(`✅ Regio: Woont in/nabij ${criteria.plaats}`);
    } 
    // Same province
    else if (
      profProvincieLower && criteria.provincie &&
      profProvincieLower.includes(criteria.provincie.toLowerCase())
    ) {
      regioMatch = 15;
      reasoning.push(`✅ Regio: Zelfde provincie (${criteria.provincie})`);
    }
    // Provincial check with standard province list
    else {
      const provinces = [
        "groningen", "friesland", "drenthe", "overijssel", "flevoland",
        "gelderland", "utrecht", "noord-holland", "zuid-holland", "zeeland",
        "noord-brabant", "limburg"
      ];
      
      const profProvince = provinces.find(p => profRegioLower.includes(p) || profProvincieLower.includes(p));
      const plaatsProvince = provinces.find(p => plaatsLower.includes(p));
      
      if (profProvince && plaatsProvince && profProvince === plaatsProvince) {
        regioMatch = 12;
        reasoning.push(`⚠️ Regio: Zelfde provincie (${profProvince})`);
      } else {
        regioMatch = 5;
        reasoning.push(`⚠️ Regio: Andere regio (${professional.regio} vs ${criteria.plaats})`);
      }
    }
  } else if (!professional.regio && !professional.woonplaats) {
    regioMatch = 8; // Neutral if no region specified
  }

  // ===== 3. MOBILITEIT FACTOR (aparte 15 punten, niet onderdeel regio) =====
  // Rural locations require transport
  if (isRural) {
    if (hasTransport) {
      mobiliteitMatch = 15;
      reasoning.push(`✅ Mobiliteit: Heeft vervoer (landelijke locatie)`);
    } else {
      mobiliteitMatch = 0;
      reasoning.push(`❌ Mobiliteit: Geen eigen vervoer voor landelijke locatie`);
    }
  } else {
    // Urban location - transport is bonus but not required
    if (hasTransport) {
      mobiliteitMatch = 10;
      reasoning.push(`✅ Mobiliteit: Heeft eigen vervoer`);
    } else {
      mobiliteitMatch = 8;
      reasoning.push(`⚠️ Mobiliteit: Geen eigen vervoer (OV beschikbaar)`);
    }
  }

  // ===== 4. SECTOR ERVARING MATCH (20 punten via semantische matching) =====
  if (criteria.sector.length > 0 && professional.ervaring_sector && professional.ervaring_sector.length > 0) {
    const semanticMatch = calculateSemanticSectorMatch(professional.ervaring_sector, criteria.sector);
    sectorMatch = Math.round(semanticMatch.score * 20);
    
    if (semanticMatch.directMatches.length > 0) {
      reasoning.push(`✅ Sector: ${semanticMatch.directMatches.join(", ")} (exact match, ${Math.round(semanticMatch.score * 100)}%)`);
    }
    
    if (semanticMatch.relatedMatches.length > 0) {
      const relatedSectors = [...new Set(semanticMatch.relatedMatches)];
      reasoning.push(`⚠️ Sector: ${relatedSectors.join(", ")} (gerelateerde ervaring, +${Math.round(relatedSectors.length * 0.6 / criteria.sector.length * 100)}%)`);
    }
    
    if (semanticMatch.directMatches.length === 0 && semanticMatch.relatedMatches.length === 0) {
      reasoning.push(`❌ Sector: Geen ervaring met ${criteria.sector.join(", ")}`);
    }
  } else if (criteria.sector.length === 0) {
    sectorMatch = 5; // Lower credit if no sector criteria
  } else {
    reasoning.push(`⚠️ Sector: Geen ervaring opgegeven`);
  }

  // ===== 5. DOELGROEP ERVARING MATCH (10 punten via semantische matching) =====
  if (criteria.doelgroep.length > 0 && professional.doelgroep_ervaring && professional.doelgroep_ervaring.length > 0) {
    const semanticMatch = calculateSemanticDoelgroepMatch(professional.doelgroep_ervaring, criteria.doelgroep);
    doelgroepMatch = Math.round(semanticMatch.score * 10);
    
    if (semanticMatch.directMatches.length > 0) {
      reasoning.push(`✅ Doelgroep: ${semanticMatch.directMatches.join(", ")} (exact match, ${Math.round(semanticMatch.score * 100)}%)`);
    }
    
    if (semanticMatch.relatedMatches.length > 0) {
      reasoning.push(`⚠️ Doelgroep: ${semanticMatch.relatedMatches.join(", ")} (gerelateerde ervaring, +${Math.round(semanticMatch.relatedMatches.length * 0.6 / criteria.doelgroep.length * 100)}%)`);
    }
    
    if (semanticMatch.directMatches.length === 0 && semanticMatch.relatedMatches.length === 0) {
      const missing = criteria.doelgroep.filter(d => 
        !professional.doelgroep_ervaring!.some(pd => pd.toLowerCase() === d.toLowerCase())
      );
      reasoning.push(`❌ Doelgroep: Geen ervaring met ${missing.join(", ")}`);
    }
  } else if (criteria.doelgroep.length === 0) {
    doelgroepMatch = 3; // Lower credit if no doelgroep criteria
  } else {
    reasoning.push(`⚠️ Doelgroep: Geen ervaring opgegeven - voeg doelgroep_ervaring toe voor betere match`);
  }

  // ===== 6. BESCHIKBAARHEID MATCH (10 punten) =====
  const profBeschikbaarheid = professional.beschikbaarheid_uren;
  const locatieCapaciteit = 
    criteria.capaciteit_min !== null && criteria.capaciteit_max !== null
      ? { min: criteria.capaciteit_min, max: criteria.capaciteit_max }
      : null;

  if (profBeschikbaarheid && locatieCapaciteit) {
    // Calculate overlap between availability and capacity ranges
    const overlapMin = Math.max(profBeschikbaarheid.min, locatieCapaciteit.min);
    const overlapMax = Math.min(profBeschikbaarheid.max, locatieCapaciteit.max);
    
    if (overlapMax >= overlapMin) {
      // There is overlap
      const overlapHours = overlapMax - overlapMin;
      const capacityRange = locatieCapaciteit.max - locatieCapaciteit.min;
      const overlapPercentage = capacityRange > 0 ? overlapHours / capacityRange : 1;
      
      if (overlapPercentage >= 0.8) {
        beschikbaarheidMatch = 10;
        reasoning.push(
          `✅ Beschikbaarheid: ${profBeschikbaarheid.min}-${profBeschikbaarheid.max} uur past bij capaciteit ${locatieCapaciteit.min}-${locatieCapaciteit.max} uur (${Math.round(overlapPercentage * 100)}% overlap)`
        );
      } else if (overlapPercentage >= 0.4) {
        beschikbaarheidMatch = Math.round(5 + overlapPercentage * 5);
        reasoning.push(
          `⚠️ Beschikbaarheid: ${profBeschikbaarheid.min}-${profBeschikbaarheid.max} uur deels passend bij capaciteit ${locatieCapaciteit.min}-${locatieCapaciteit.max} uur (${Math.round(overlapPercentage * 100)}% overlap)`
        );
      } else {
        beschikbaarheidMatch = 3;
        reasoning.push(
          `⚠️ Beschikbaarheid: ${profBeschikbaarheid.min}-${profBeschikbaarheid.max} uur beperkt passend bij capaciteit ${locatieCapaciteit.min}-${locatieCapaciteit.max} uur`
        );
      }
    } else {
      // No overlap
      beschikbaarheidMatch = 0;
      reasoning.push(
        `❌ Beschikbaarheid: ${profBeschikbaarheid.min}-${profBeschikbaarheid.max} uur past niet bij capaciteit ${locatieCapaciteit.min}-${locatieCapaciteit.max} uur (geen overlap)`
      );
    }
  } else if (!profBeschikbaarheid && !locatieCapaciteit) {
    // Both missing - neutral score
    beschikbaarheidMatch = 5;
  } else if (!profBeschikbaarheid) {
    // Professional has no availability specified
    beschikbaarheidMatch = 5;
    reasoning.push(`⚠️ Beschikbaarheid: Geen beschikbaarheid opgegeven`);
  } else {
    // Location has no capacity specified
    beschikbaarheidMatch = 5;
  }

  // ===== TOTAAL BEREKENING (exact 100 punten) =====
  // Functie: 25, Regio: 20, Mobiliteit: 15, Sector: 20, Doelgroep: 10, Beschikbaarheid: 10
  const totalScore = Math.min(100, functieMatch + regioMatch + mobiliteitMatch + sectorMatch + doelgroepMatch + beschikbaarheidMatch);

  return {
    functieMatch,
    regioMatch,
    sectorMatch,
    doelgroepMatch,
    mobiliteitMatch,
    beschikbaarheidMatch,
    totalScore,
    reasoning,
  };
}
