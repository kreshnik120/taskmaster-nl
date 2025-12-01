interface Professional {
  functie_niveau: string;
  regio: string | null;
  skills?: string[] | null;
  beschikbaarheidsnotities: string | null;
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
}

interface MatchScoreBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  totalScore: number;
  reasoning: string[];
}

// Functie equivalentie matrix - Alle 17 healthcare functies met hiërarchische compatibiliteit
const FUNCTIE_COMPATIBILITY: Record<string, { compatible: string[]; score: number }> = {
  // Zorg hiërarchie (5 functies)
  "HBO-V": { compatible: ["HBO-V", "Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende"], score: 30 },
  "Verpleegkundige MBO": { compatible: ["Verpleegkundige MBO", "VIG", "Verzorgende IG", "Helpende", "HBO-V"], score: 30 },
  "Verpleegkundige": { compatible: ["Verpleegkundige", "HBO-V", "Verpleegkundige MBO", "VIG"], score: 30 },
  "VIG": { compatible: ["VIG", "Verzorgende IG", "Helpende", "Verpleegkundige MBO"], score: 30 },
  "Verzorgende IG": { compatible: ["Verzorgende IG", "Helpende", "VIG"], score: 30 },
  "Helpende": { compatible: ["Helpende", "Verzorgende IG"], score: 30 },
  
  // Begeleiding hiërarchie (6 functies)
  "GGZ-agoog": { compatible: ["GGZ-agoog", "Maatschappelijk werker", "Verslavingswerker", "Begeleider"], score: 30 },
  "Maatschappelijk werker": { compatible: ["Maatschappelijk werker", "GGZ-agoog", "Verslavingswerker"], score: 30 },
  "Verslavingswerker": { compatible: ["Verslavingswerker", "GGZ-agoog", "Maatschappelijk werker"], score: 30 },
  "Begeleider": { compatible: ["Begeleider", "Persoonlijk begeleider", "Pedagogisch medewerker", "Job coach"], score: 30 },
  "Persoonlijk begeleider": { compatible: ["Persoonlijk begeleider", "Begeleider", "Pedagogisch medewerker"], score: 30 },
  "Pedagogisch medewerker": { compatible: ["Pedagogisch medewerker", "Begeleider", "Persoonlijk begeleider"], score: 30 },
  "Job coach": { compatible: ["Job coach", "Begeleider"], score: 30 },
  
  // Therapie functies (4 functies - beperkte overlap)
  "Kunsttherapeut": { compatible: ["Kunsttherapeut", "Muziektherapeut", "Activiteitenbegeleider"], score: 30 },
  "Muziektherapeut": { compatible: ["Muziektherapeut", "Kunsttherapeut", "Activiteitenbegeleider"], score: 30 },
  "Activiteitenbegeleider": { compatible: ["Activiteitenbegeleider", "Kunsttherapeut", "Muziektherapeut"], score: 30 },
  "Gedragswetenschapper": { compatible: ["Gedragswetenschapper"], score: 30 }, // Specialist, geen overlap
  
  // Overige functies (3 functies - geen overlap)
  "Sportinstructeur": { compatible: ["Sportinstructeur"], score: 30 },
  "Agrarisch medewerker": { compatible: ["Agrarisch medewerker"], score: 30 },
  "Hovenier": { compatible: ["Hovenier"], score: 30 },
};

// Doelgroep semantische relaties - Gerelateerde doelgroepen krijgen partiële match credit
const DOELGROEP_RELATIONS: Record<string, { related: string[]; similarity: number }> = {
  "LVB": { related: ["Autisme", "NAH", "EMB"], similarity: 0.7 },
  "Autisme": { related: ["LVB", "NAH", "Kinderen/Jeugd"], similarity: 0.7 },
  "NAH": { related: ["LVB", "Autisme", "Somatiek"], similarity: 0.6 },
  "EMB": { related: ["LG", "LVB"], similarity: 0.5 },
  "LG": { related: ["EMB", "LVB"], similarity: 0.5 },
  "Psychiatrie": { related: ["Verslaving", "Dakloosheid", "GGZ"], similarity: 0.6 },
  "Verslaving": { related: ["Psychiatrie", "Dakloosheid"], similarity: 0.6 },
  "Dakloosheid": { related: ["Psychiatrie", "Verslaving"], similarity: 0.5 },
  "Ouderen": { related: ["Somatiek", "Dementie"], similarity: 0.6 },
  "Somatiek": { related: ["Ouderen", "NAH"], similarity: 0.5 },
  "Dementie": { related: ["Ouderen", "Somatiek"], similarity: 0.7 },
  "Kinderen/Jeugd": { related: ["Autisme", "Jeugdzorg"], similarity: 0.6 },
  "Jeugdzorg": { related: ["Kinderen/Jeugd"], similarity: 0.7 },
};

// Jaccard similarity calculator voor array overlap
function calculateJaccardSimilarity(set1: string[], set2: string[]): number {
  if (set1.length === 0 || set2.length === 0) return 0;
  
  const intersection = set1.filter(item => 
    set2.some(s => s.toLowerCase() === item.toLowerCase())
  );
  const union = [...new Set([...set1, ...set2])];
  
  return intersection.length / union.length;
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

  // ===== 1. FUNCTIE EQUIVALENTIE MATCH (30 punten) =====
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
          functieMatch = 30;
          reasoning.push(`✅ Functie: ${profFunctie} - Exact match`);
        } else {
          // Compatible match gets 20 points
          functieMatch = 20;
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
        functieMatch = 30;
        reasoning.push(`✅ Functie: ${profFunctie} - Match`);
      }
    }
  } else {
    functieMatch = 15; // Partial credit if no criteria
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

  // ===== 4. SECTOR ERVARING MATCH (25 punten via Jaccard) =====
  if (criteria.sector.length > 0 && professional.ervaring_sector && professional.ervaring_sector.length > 0) {
    const similarity = calculateJaccardSimilarity(professional.ervaring_sector, criteria.sector);
    sectorMatch = Math.round(similarity * 25);
    
    const overlappingSectors = professional.ervaring_sector.filter(s =>
      criteria.sector.some(cs => cs.toLowerCase() === s.toLowerCase())
    );
    
    if (overlappingSectors.length > 0) {
      reasoning.push(`✅ Sector: ${overlappingSectors.join(", ")} (${Math.round(similarity * 100)}% overlap)`);
    } else {
      reasoning.push(`⚠️ Sector: Beperkte overlap met ${criteria.sector.join(", ")}`);
    }
  } else if (criteria.sector.length === 0) {
    sectorMatch = 12; // Partial credit if no sector criteria
  } else {
    reasoning.push(`⚠️ Sector: Geen ervaring opgegeven`);
  }

  // ===== 5. DOELGROEP ERVARING MATCH (15 punten via semantische matching) =====
  if (criteria.doelgroep.length > 0 && professional.doelgroep_ervaring && professional.doelgroep_ervaring.length > 0) {
    const semanticMatch = calculateSemanticDoelgroepMatch(professional.doelgroep_ervaring, criteria.doelgroep);
    doelgroepMatch = Math.round(semanticMatch.score * 15);
    
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
    doelgroepMatch = 7; // Partial credit if no doelgroep criteria
  } else {
    reasoning.push(`⚠️ Doelgroep: Geen ervaring opgegeven - voeg doelgroep_ervaring toe voor betere match`);
  }

  // ===== TOTAAL BEREKENING (max 100 punten) =====
  // Functie: 30, Regio: 20, Mobiliteit: 15, Sector: 25, Doelgroep: 15
  const totalScore = Math.min(100, functieMatch + regioMatch + mobiliteitMatch + sectorMatch + doelgroepMatch);

  return {
    functieMatch,
    regioMatch,
    sectorMatch,
    doelgroepMatch,
    mobiliteitMatch,
    totalScore,
    reasoning,
  };
}
