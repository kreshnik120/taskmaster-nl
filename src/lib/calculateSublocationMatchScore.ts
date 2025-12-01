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

// Functie equivalentie matrix - HBO-V kan VIG taken doen, etc.
const FUNCTIE_COMPATIBILITY: Record<string, { compatible: string[]; score: number }> = {
  "HBO-V": { compatible: ["HBO-V", "VIG", "Verpleegkundige MBO"], score: 30 },
  "VIG": { compatible: ["VIG", "Verpleegkundige MBO", "Helpende"], score: 30 },
  "Verpleegkundige MBO": { compatible: ["Verpleegkundige MBO", "VIG", "Helpende"], score: 30 },
  "GGZ-agoog": { compatible: ["GGZ-agoog", "Begeleider", "Persoonlijk begeleider"], score: 30 },
  "Begeleider": { compatible: ["Begeleider", "Persoonlijk begeleider", "GGZ-agoog"], score: 30 },
  "Persoonlijk begeleider": { compatible: ["Persoonlijk begeleider", "Begeleider"], score: 30 },
  "Helpende": { compatible: ["Helpende", "Verzorgende"], score: 30 },
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

  // ===== 5. DOELGROEP ERVARING MATCH (15 punten via Jaccard) =====
  if (criteria.doelgroep.length > 0 && professional.doelgroep_ervaring && professional.doelgroep_ervaring.length > 0) {
    const similarity = calculateJaccardSimilarity(professional.doelgroep_ervaring, criteria.doelgroep);
    doelgroepMatch = Math.round(similarity * 15);
    
    const overlappingDoelgroepen = professional.doelgroep_ervaring.filter(d =>
      criteria.doelgroep.some(cd => cd.toLowerCase() === d.toLowerCase())
    );
    
    if (overlappingDoelgroepen.length > 0) {
      reasoning.push(`✅ Doelgroep: ${overlappingDoelgroepen.join(", ")} (${Math.round(similarity * 100)}% overlap)`);
    } else {
      reasoning.push(`⚠️ Doelgroep: Beperkte overlap met ${criteria.doelgroep.join(", ")}`);
    }
  } else if (criteria.doelgroep.length === 0) {
    doelgroepMatch = 7; // Partial credit if no doelgroep criteria
  } else {
    reasoning.push(`⚠️ Doelgroep: Geen ervaring opgegeven`);
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
