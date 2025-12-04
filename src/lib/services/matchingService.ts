/**
 * Unified Matching Service
 * 
 * Single source of truth for all matching calculations in the healthcare recruitment system.
 * Used by: SublocationMatchingPanel, ApplicationDetailModal, ApplicationCard, etc.
 * 
 * Score breakdown (100 points max):
 * - Functie: 25 punten
 * - Regio: 20 punten
 * - Sector: 20 punten
 * - Doelgroep: 10 punten
 * - Mobiliteit: 10 punten
 * - Beschikbaarheid: 5 punten
 * - Bureau: 5 punten
 * - Bonus: Ervaring (+5), Leidinggevende (+3), Certificaten (+3), Nacht/Weekend (+2)
 */

import { 
  SECTOR_SIMILARITY, 
  DOELGROEP_RELATIONS, 
  calculateErvaringBonus, 
  LEIDINGGEVENDE_BONUS,
  getProvincieFromLocatie,
  BUUR_PROVINCIES,
  functieMatchesAny
} from '../constants/matchingConstants';

// ============= INTERFACES =============

export interface MatchCandidate {
  functie_niveau: string | null;
  regio: string | null;
  woonplaats?: string | null;
  postcode?: string | null;
  provincie?: string | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
  jaren_ervaring?: number | null;
  leidinggevende_ervaring?: boolean | null;
  heeft_auto?: boolean | null;
  heeft_rijbewijs?: boolean | null;
  eigen_vervoer?: boolean | null;
  beschikbaarheid_uren?: { min: number; max: number } | null;
  nachtdienst_bereid?: boolean | null;
  weekenddienst_bereid?: boolean | null;
  certificaten?: string[] | null;
  assigned_organization?: string | null;
}

export interface MatchTarget {
  gezochte_functies?: string[] | null;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  regio?: string[] | null;
  plaats?: string | null;
  provincie?: string | null;
  postcode?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
  org_id?: string | null;
  org_name?: string | null;
}

export interface MatchScoreBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  bureauMatch: number;
  ervaringBonus: number;
  leidinggevendeBonus: number;
  certificatenBonus: number;
  dienstBonus: number;
  totalScore: number;
  normalizedScore: number;
  reasoning: string[];
  details: {
    functie?: { match: boolean; reason: string };
    regio?: { match: boolean; reason: string; matchType: 'exact' | 'province' | 'neighbor' | 'none' };
    sector?: { match: boolean; reason: string; directMatches: string[]; relatedMatches: string[] };
    doelgroep?: { match: boolean; reason: string; directMatches: string[]; relatedMatches: string[] };
    mobiliteit?: { match: boolean; reason: string };
    beschikbaarheid?: { match: boolean; reason: string };
    bureau?: { match: boolean; reason: string };
    ervaring?: { bonus: number; label: string };
  };
}

// ============= CONSTANTS =============

const MAX_BASE_SCORE = 100;

// Functie equivalentie matrix - Alle healthcare functies met hiërarchische compatibiliteit
const FUNCTIE_COMPATIBILITY: Record<string, { compatible: string[]; score: number }> = {
  // Zorg hiërarchie
  "HBO-V": { compatible: ["HBO-V", "Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende"], score: 25 },
  "Verpleegkundige MBO": { compatible: ["Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende", "HBO-V"], score: 25 },
  "Verpleegkundige": { compatible: ["Verpleegkundige", "HBO-V", "Verpleegkundige MBO", "VIG"], score: 25 },
  "VIG": { compatible: ["VIG", "Verzorgende IG", "Helpende", "Verpleegkundige MBO"], score: 25 },
  "Verzorgende IG": { compatible: ["Verzorgende IG", "Helpende", "VIG"], score: 25 },
  "Helpende": { compatible: ["Helpende", "Verzorgende IG"], score: 25 },
  
  // Begeleiding hiërarchie
  "GGZ-agoog": { compatible: ["GGZ-agoog", "Maatschappelijk werker", "Verslavingswerker", "Begeleider"], score: 25 },
  "Maatschappelijk werker": { compatible: ["Maatschappelijk werker", "GGZ-agoog", "Verslavingswerker"], score: 25 },
  "Verslavingswerker": { compatible: ["Verslavingswerker", "GGZ-agoog", "Maatschappelijk werker"], score: 25 },
  "Begeleider": { compatible: ["Begeleider", "Persoonlijk begeleider", "Pedagogisch medewerker", "Job coach"], score: 25 },
  "Persoonlijk begeleider": { compatible: ["Persoonlijk begeleider", "Begeleider", "Pedagogisch medewerker"], score: 25 },
  "Pedagogisch medewerker": { compatible: ["Pedagogisch medewerker", "Begeleider", "Persoonlijk begeleider"], score: 25 },
  "Job coach": { compatible: ["Job coach", "Begeleider"], score: 25 },
  
  // Therapie functies
  "Kunsttherapeut": { compatible: ["Kunsttherapeut", "Muziektherapeut", "Activiteitenbegeleider"], score: 25 },
  "Muziektherapeut": { compatible: ["Muziektherapeut", "Kunsttherapeut", "Activiteitenbegeleider"], score: 25 },
  "Activiteitenbegeleider": { compatible: ["Activiteitenbegeleider", "Kunsttherapeut", "Muziektherapeut"], score: 25 },
  "Gedragswetenschapper": { compatible: ["Gedragswetenschapper"], score: 25 },
  
  // Overige functies
  "Sportinstructeur": { compatible: ["Sportinstructeur"], score: 25 },
  "Agrarisch medewerker": { compatible: ["Agrarisch medewerker"], score: 25 },
  "Hovenier": { compatible: ["Hovenier"], score: 25 },
};

// Bureau ID mapping
const BUREAU_MAPPING: Record<string, string> = {
  '550e8400-e29b-41d4-a716-446655440000': 'ABCzorg',
  '650e8400-e29b-41d4-a716-446655440001': 'CitoZorg',
};

// ============= HELPER FUNCTIONS =============

function isRuralLocation(plaats: string | null, provincie: string | null): boolean {
  if (!plaats && !provincie) return false;
  
  const ruralProvinces = ["drenthe", "friesland", "zeeland"];
  const urbanCities = ["amsterdam", "rotterdam", "utrecht", "den haag", "eindhoven", "groningen"];
  
  const plaatsLower = plaats?.toLowerCase() || "";
  const provincieLower = provincie?.toLowerCase() || "";
  
  if (urbanCities.some(city => plaatsLower.includes(city))) return false;
  if (ruralProvinces.some(prov => provincieLower.includes(prov))) return true;
  
  return false;
}

function calculateSemanticSectorMatch(
  profSectoren: string[],
  targetSectoren: string[]
): { score: number; directMatches: string[]; relatedMatches: string[] } {
  if (profSectoren.length === 0 || targetSectoren.length === 0) {
    return { score: 0, directMatches: [], relatedMatches: [] };
  }

  const directMatches = profSectoren.filter(profS =>
    targetSectoren.some(locS => locS.toLowerCase() === profS.toLowerCase())
  );

  const relatedMatches: string[] = [];
  let relatedScore = 0;

  profSectoren.forEach(profS => {
    const relation = SECTOR_SIMILARITY[profS];
    if (relation) {
      const relatedFound = relation.related.filter(relS =>
        targetSectoren.some(locS => locS.toLowerCase() === relS.toLowerCase())
      );
      if (relatedFound.length > 0 && !directMatches.includes(profS)) {
        relatedMatches.push(...relatedFound);
        relatedScore += relation.similarity * relatedFound.length;
      }
    }
  });

  const totalWeight = directMatches.length * 1.0 + relatedScore;
  const maxWeight = targetSectoren.length * 1.0;
  const score = maxWeight > 0 ? totalWeight / maxWeight : 0;

  return {
    score: Math.min(1, score),
    directMatches: [...new Set(directMatches)],
    relatedMatches: [...new Set(relatedMatches)],
  };
}

function calculateSemanticDoelgroepMatch(
  profDoelgroepen: string[],
  targetDoelgroepen: string[]
): { score: number; directMatches: string[]; relatedMatches: string[] } {
  if (profDoelgroepen.length === 0 || targetDoelgroepen.length === 0) {
    return { score: 0, directMatches: [], relatedMatches: [] };
  }

  const directMatches = profDoelgroepen.filter(profD =>
    targetDoelgroepen.some(locD => locD.toLowerCase() === profD.toLowerCase())
  );

  const relatedMatches: string[] = [];
  let relatedScore = 0;

  profDoelgroepen.forEach(profD => {
    const relation = DOELGROEP_RELATIONS[profD];
    if (relation) {
      const relatedFound = relation.related.filter(relD =>
        targetDoelgroepen.some(locD => locD.toLowerCase() === relD.toLowerCase())
      );
      if (relatedFound.length > 0 && !directMatches.includes(profD)) {
        relatedMatches.push(...relatedFound);
        relatedScore += relation.similarity * relatedFound.length;
      }
    }
  });

  const totalWeight = directMatches.length * 1.0 + relatedScore;
  const maxWeight = targetDoelgroepen.length * 1.0;
  const score = maxWeight > 0 ? totalWeight / maxWeight : 0;

  return {
    score: Math.min(1, score),
    directMatches: [...new Set(directMatches)],
    relatedMatches: [...new Set(relatedMatches)],
  };
}

// ============= MAIN MATCHING FUNCTION =============

export function calculateUnifiedMatchScore(
  candidate: MatchCandidate,
  target: MatchTarget
): MatchScoreBreakdown {
  const reasoning: string[] = [];
  let functieMatch = 0;
  let regioMatch = 0;
  let sectorMatch = 0;
  let doelgroepMatch = 0;
  let mobiliteitMatch = 0;
  let beschikbaarheidMatch = 0;
  let bureauMatch = 0;
  let ervaringBonus = 0;
  let leidinggevendeBonus = 0;
  let certificatenBonus = 0;
  let dienstBonus = 0;

  const details: MatchScoreBreakdown['details'] = {};

  // ===== 1. FUNCTIE MATCH (25 punten) =====
  const gezochte = target.gezochte_functies || [];
  if (gezochte.length > 0 && candidate.functie_niveau) {
    const profFunctie = candidate.functie_niveau;
    const compatibility = FUNCTIE_COMPATIBILITY[profFunctie];
    
    if (compatibility) {
      const hasCompatibleMatch = gezochte.some(func => compatibility.compatible.includes(func));
      
      if (hasCompatibleMatch) {
        if (gezochte.includes(profFunctie)) {
          functieMatch = 25;
          reasoning.push(`✅ Functie: ${profFunctie} - Exact match`);
          details.functie = { match: true, reason: `${profFunctie} - Exact match` };
        } else {
          functieMatch = 17;
          const compatibleFuncs = gezochte.filter(f => compatibility.compatible.includes(f));
          reasoning.push(`✅ Functie: ${profFunctie} compatibel met ${compatibleFuncs.join(", ")}`);
          details.functie = { match: true, reason: `${profFunctie} compatibel met ${compatibleFuncs.join(", ")}` };
        }
      } else {
        reasoning.push(`❌ Functie: ${profFunctie} niet compatibel met ${gezochte.join(", ")}`);
        details.functie = { match: false, reason: `${profFunctie} niet compatibel` };
      }
    } else {
      // Fallback: simple match check using normalization
      if (functieMatchesAny(profFunctie, gezochte)) {
        functieMatch = 25;
        reasoning.push(`✅ Functie: ${profFunctie} - Match`);
        details.functie = { match: true, reason: `${profFunctie} - Match` };
      } else {
        details.functie = { match: false, reason: `${profFunctie} niet gevonden in gezochte functies` };
      }
    }
  } else if (gezochte.length === 0) {
    functieMatch = 8; // Lower credit if no criteria
  }

  // ===== 2. REGIO MATCH (20 punten) =====
  const targetRegio = target.regio || (target.plaats ? [target.plaats] : []);
  const candidateRegio = candidate.regio;
  
  if (candidateRegio && targetRegio.length > 0) {
    const candidateRegioLower = candidateRegio.toLowerCase();
    const candidateWoonplaatsLower = candidate.woonplaats?.toLowerCase() || "";
    const candidateProvincieLower = candidate.provincie?.toLowerCase() || "";
    
    // Check for exact match
    let matchFound = false;
    for (const tr of targetRegio) {
      const trLower = tr.toLowerCase();
      if (
        candidateRegioLower === trLower ||
        candidateWoonplaatsLower === trLower ||
        candidateRegioLower.includes(trLower) ||
        trLower.includes(candidateRegioLower)
      ) {
        regioMatch = 20;
        reasoning.push(`✅ Regio: Woont in/nabij ${tr}`);
        details.regio = { match: true, reason: `Woont in/nabij ${tr}`, matchType: 'exact' };
        matchFound = true;
        break;
      }
    }
    
    // Province match
    if (!matchFound) {
      const candidateProv = getProvincieFromLocatie(candidateRegio) || candidateProvincieLower;
      for (const tr of targetRegio) {
        const targetProv = getProvincieFromLocatie(tr);
        if (candidateProv && targetProv && candidateProv === targetProv) {
          regioMatch = 15;
          reasoning.push(`✅ Regio: Zelfde provincie (${candidateProv})`);
          details.regio = { match: true, reason: `Zelfde provincie (${candidateProv})`, matchType: 'province' };
          matchFound = true;
          break;
        }
      }
    }
    
    // Neighbor province match
    if (!matchFound) {
      const candidateProv = getProvincieFromLocatie(candidateRegio);
      if (candidateProv) {
        const neighbors = BUUR_PROVINCIES[candidateProv] || [];
        for (const tr of targetRegio) {
          const targetProv = getProvincieFromLocatie(tr);
          if (targetProv && neighbors.includes(targetProv)) {
            regioMatch = 10;
            reasoning.push(`⚠️ Regio: Buurprovincie (${candidateProv} ↔ ${targetProv})`);
            details.regio = { match: true, reason: `Buurprovincie (${candidateProv} ↔ ${targetProv})`, matchType: 'neighbor' };
            matchFound = true;
            break;
          }
        }
      }
    }
    
    if (!matchFound) {
      regioMatch = 5;
      reasoning.push(`⚠️ Regio: Andere regio`);
      details.regio = { match: false, reason: 'Andere regio', matchType: 'none' };
    }
  } else if (!candidateRegio) {
    regioMatch = 8; // Neutral if no region specified
    details.regio = { match: false, reason: 'Geen regio opgegeven', matchType: 'none' };
  }

  // ===== 3. MOBILITEIT (10 punten) =====
  const isRural = isRuralLocation(target.plaats || null, target.provincie || null);
  const hasTransport = candidate.heeft_auto || candidate.heeft_rijbewijs || candidate.eigen_vervoer;
  
  if (isRural) {
    if (hasTransport) {
      mobiliteitMatch = 10;
      reasoning.push(`✅ Mobiliteit: Heeft vervoer (landelijke locatie)`);
      details.mobiliteit = { match: true, reason: 'Heeft vervoer (landelijke locatie)' };
    } else {
      mobiliteitMatch = 0;
      reasoning.push(`❌ Mobiliteit: Geen eigen vervoer voor landelijke locatie`);
      details.mobiliteit = { match: false, reason: 'Geen eigen vervoer voor landelijke locatie' };
    }
  } else {
    if (hasTransport) {
      mobiliteitMatch = 8;
      reasoning.push(`✅ Mobiliteit: Heeft eigen vervoer`);
      details.mobiliteit = { match: true, reason: 'Heeft eigen vervoer' };
    } else {
      mobiliteitMatch = 6;
      reasoning.push(`⚠️ Mobiliteit: Geen eigen vervoer (OV beschikbaar)`);
      details.mobiliteit = { match: true, reason: 'OV beschikbaar' };
    }
  }

  // ===== 4. SECTOR MATCH (20 punten) =====
  const targetSectors = target.sector || [];
  const candidateSectors = candidate.ervaring_sector || [];
  
  if (targetSectors.length > 0 && candidateSectors.length > 0) {
    const semanticMatch = calculateSemanticSectorMatch(candidateSectors, targetSectors);
    sectorMatch = Math.round(semanticMatch.score * 20);
    
    if (semanticMatch.directMatches.length > 0) {
      reasoning.push(`✅ Sector: ${semanticMatch.directMatches.join(", ")} (exact match)`);
    }
    if (semanticMatch.relatedMatches.length > 0) {
      reasoning.push(`⚠️ Sector: ${semanticMatch.relatedMatches.join(", ")} (gerelateerd)`);
    }
    if (semanticMatch.directMatches.length === 0 && semanticMatch.relatedMatches.length === 0) {
      reasoning.push(`❌ Sector: Geen match met ${targetSectors.join(", ")}`);
    }
    
    details.sector = {
      match: sectorMatch > 0,
      reason: sectorMatch > 0 ? `${Math.round(semanticMatch.score * 100)}% match` : 'Geen sector overlap',
      directMatches: semanticMatch.directMatches,
      relatedMatches: semanticMatch.relatedMatches
    };
  } else if (targetSectors.length === 0) {
    sectorMatch = 5;
  }

  // ===== 5. DOELGROEP MATCH (10 punten) =====
  const targetDoelgroepen = target.doelgroep || [];
  const candidateDoelgroepen = candidate.doelgroep_ervaring || [];
  
  if (targetDoelgroepen.length > 0 && candidateDoelgroepen.length > 0) {
    const semanticMatch = calculateSemanticDoelgroepMatch(candidateDoelgroepen, targetDoelgroepen);
    doelgroepMatch = Math.round(semanticMatch.score * 10);
    
    if (semanticMatch.directMatches.length > 0) {
      reasoning.push(`✅ Doelgroep: ${semanticMatch.directMatches.join(", ")} (exact match)`);
    }
    if (semanticMatch.relatedMatches.length > 0) {
      reasoning.push(`⚠️ Doelgroep: ${semanticMatch.relatedMatches.join(", ")} (gerelateerd)`);
    }
    
    details.doelgroep = {
      match: doelgroepMatch > 0,
      reason: doelgroepMatch > 0 ? `${Math.round(semanticMatch.score * 100)}% match` : 'Geen doelgroep overlap',
      directMatches: semanticMatch.directMatches,
      relatedMatches: semanticMatch.relatedMatches
    };
  } else if (targetDoelgroepen.length === 0) {
    doelgroepMatch = 3;
  }

  // ===== 6. BESCHIKBAARHEID MATCH (5 punten) =====
  const candidateBeschikbaarheid = candidate.beschikbaarheid_uren;
  const targetCapaciteit = 
    target.capaciteit_min !== null && target.capaciteit_max !== null
      ? { min: target.capaciteit_min, max: target.capaciteit_max }
      : null;

  if (candidateBeschikbaarheid && targetCapaciteit) {
    const overlapMin = Math.max(candidateBeschikbaarheid.min, targetCapaciteit.min);
    const overlapMax = Math.min(candidateBeschikbaarheid.max, targetCapaciteit.max);
    
    if (overlapMax >= overlapMin) {
      const overlapHours = overlapMax - overlapMin;
      const capacityRange = targetCapaciteit.max - targetCapaciteit.min;
      const overlapPercentage = capacityRange > 0 ? overlapHours / capacityRange : 1;
      
      if (overlapPercentage >= 0.8) {
        beschikbaarheidMatch = 5;
        reasoning.push(`✅ Beschikbaarheid: ${candidateBeschikbaarheid.min}-${candidateBeschikbaarheid.max} uur past`);
        details.beschikbaarheid = { match: true, reason: `${Math.round(overlapPercentage * 100)}% overlap` };
      } else if (overlapPercentage >= 0.4) {
        beschikbaarheidMatch = 3;
        reasoning.push(`⚠️ Beschikbaarheid: Gedeeltelijke overlap`);
        details.beschikbaarheid = { match: true, reason: `${Math.round(overlapPercentage * 100)}% overlap` };
      }
    } else {
      reasoning.push(`❌ Beschikbaarheid: Geen overlap`);
      details.beschikbaarheid = { match: false, reason: 'Geen overlap' };
    }
  } else {
    beschikbaarheidMatch = 3; // Neutral
  }

  // ===== 7. BUREAU MATCH (5 punten) =====
  const targetOrgName = target.org_name || (target.org_id ? BUREAU_MAPPING[target.org_id] : null);
  const candidateOrg = candidate.assigned_organization;
  
  if (candidateOrg && targetOrgName && candidateOrg === targetOrgName) {
    bureauMatch = 5;
    reasoning.push(`✅ Bureau: Zelfde bemiddelingsbureau (${targetOrgName})`);
    details.bureau = { match: true, reason: `Zelfde bureau: ${targetOrgName}` };
  } else if (candidateOrg && targetOrgName) {
    details.bureau = { match: false, reason: 'Ander bureau' };
  }

  // ===== BONUS POINTS =====
  
  // Ervaring bonus (+5 max)
  const ervaringResult = calculateErvaringBonus(candidate.jaren_ervaring);
  if (ervaringResult.bonus > 0) {
    ervaringBonus = ervaringResult.bonus;
    reasoning.push(`✅ Ervaring: ${ervaringResult.label} (+${ervaringBonus})`);
  } else if (ervaringResult.bonus < 0) {
    ervaringBonus = ervaringResult.bonus;
    reasoning.push(`⚠️ Ervaring: ${ervaringResult.label} (${ervaringBonus})`);
  }
  details.ervaring = ervaringResult;

  // Leidinggevende bonus (+3)
  if (candidate.leidinggevende_ervaring) {
    leidinggevendeBonus = LEIDINGGEVENDE_BONUS;
    reasoning.push(`✅ Leidinggevende ervaring (+${leidinggevendeBonus})`);
  }

  // Certificaten bonus (+3 max)
  const certs = candidate.certificaten || [];
  if (certs.length > 0) {
    certificatenBonus = Math.min(3, certs.length);
    reasoning.push(`✅ ${certs.length} certificaat(en) (+${certificatenBonus})`);
  }

  // Dienst bonus (+2 max)
  if (candidate.nachtdienst_bereid) {
    dienstBonus += 1;
    reasoning.push(`✅ Beschikbaar voor nachtdienst (+1)`);
  }
  if (candidate.weekenddienst_bereid) {
    dienstBonus += 1;
    reasoning.push(`✅ Beschikbaar voor weekenddienst (+1)`);
  }

  // ===== TOTAL SCORE =====
  const totalScore = 
    functieMatch + 
    regioMatch + 
    sectorMatch + 
    doelgroepMatch + 
    mobiliteitMatch + 
    beschikbaarheidMatch + 
    bureauMatch +
    ervaringBonus + 
    leidinggevendeBonus + 
    certificatenBonus + 
    dienstBonus;

  // Normalize to 0-100 scale
  const normalizedScore = Math.round(Math.min(100, Math.max(0, totalScore)));

  return {
    functieMatch,
    regioMatch,
    sectorMatch,
    doelgroepMatch,
    mobiliteitMatch,
    beschikbaarheidMatch,
    bureauMatch,
    ervaringBonus,
    leidinggevendeBonus,
    certificatenBonus,
    dienstBonus,
    totalScore,
    normalizedScore,
    reasoning,
    details
  };
}

// ============= CONVENIENCE FUNCTIONS =============

/**
 * Calculate match score for a professional against a sublocation
 */
export function calculateProfessionalToSublocationMatch(
  professional: {
    functie_niveau: string;
    regio: string | null;
    woonplaats?: string | null;
    postcode?: string | null;
    provincie?: string | null;
    ervaring_sector?: string[] | null;
    doelgroep_ervaring?: string[] | null;
    jaren_ervaring?: number | null;
    leidinggevende_ervaring?: boolean | null;
    heeft_auto?: boolean | null;
    eigen_vervoer?: boolean | null;
    beschikbaarheid_uren?: { min: number; max: number } | null;
    nachtdienst_bereid?: boolean | null;
    weekenddienst_bereid?: boolean | null;
    certificaten?: string[] | null;
  },
  sublocation: {
    gezochte_functies?: string[] | null;
    sector?: string[] | null;
    doelgroep?: string[] | null;
    plaats?: string | null;
    provincie?: string | null;
    capaciteit_min?: number | null;
    capaciteit_max?: number | null;
  }
): MatchScoreBreakdown {
  return calculateUnifiedMatchScore(professional, sublocation);
}

/**
 * Calculate match score for an application against a client
 */
export function calculateApplicationToClientMatch(
  extractedData: {
    functie_niveau?: string | null;
    regio?: string | null;
    woonplaats?: string | null;
    postcode?: string | null;
    ervaring_sector?: string[] | null;
    doelgroep_ervaring?: string[] | null;
    jaren_ervaring?: number | null;
    leidinggevende_ervaring?: boolean | null;
    eigen_vervoer?: boolean | null;
    nachtdienst_bereid?: boolean | null;
    weekenddienst_bereid?: boolean | null;
    certificaten?: string[] | null;
    assigned_organization?: string | null;
  },
  client: {
    gezochte_functies?: string[] | null;
    sector?: string[] | null;
    doelgroep?: string[] | null;
    regio?: string[] | null;
    org_id?: string | null;
  }
): MatchScoreBreakdown {
  return calculateUnifiedMatchScore(
    {
      functie_niveau: extractedData.functie_niveau || null,
      regio: extractedData.regio || null,
      woonplaats: extractedData.woonplaats,
      postcode: extractedData.postcode,
      ervaring_sector: extractedData.ervaring_sector,
      doelgroep_ervaring: extractedData.doelgroep_ervaring,
      jaren_ervaring: extractedData.jaren_ervaring,
      leidinggevende_ervaring: extractedData.leidinggevende_ervaring,
      eigen_vervoer: extractedData.eigen_vervoer,
      nachtdienst_bereid: extractedData.nachtdienst_bereid,
      weekenddienst_bereid: extractedData.weekenddienst_bereid,
      certificaten: extractedData.certificaten,
      assigned_organization: extractedData.assigned_organization,
    },
    {
      gezochte_functies: client.gezochte_functies,
      sector: client.sector,
      doelgroep: client.doelgroep,
      regio: client.regio,
      org_id: client.org_id,
    }
  );
}

/**
 * Parse beschikbaarheid string to hours object
 */
export function parseBeschikbaarheid(beschikbaarheid: string | null): { min: number; max: number } | null {
  if (!beschikbaarheid) return null;
  
  const text = beschikbaarheid.toLowerCase();
  
  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  }
  
  const lessThanMatch = text.match(/<\s*(\d+)/);
  if (lessThanMatch) {
    return { min: 0, max: parseInt(lessThanMatch[1]) };
  }
  
  if (text.includes("flexibel")) {
    return null;
  }
  
  return null;
}
