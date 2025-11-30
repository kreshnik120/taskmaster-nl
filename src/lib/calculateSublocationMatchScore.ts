interface Professional {
  functie_niveau: string;
  regio: string | null;
  skills: string[];
  beschikbaarheidsnotities: string | null;
}

interface SublocationCriteria {
  gezochte_functies: string[];
  sector: string[];
  doelgroep: string[];
  plaats: string;
}

interface MatchScoreBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  beschikbaarheidMatch: number;
  totalScore: number;
  reasoning: string[];
}

export function calculateSublocationMatchScore(
  professional: Professional,
  criteria: SublocationCriteria
): MatchScoreBreakdown {
  const reasoning: string[] = [];
  let functieMatch = 0;
  let regioMatch = 0;
  let sectorMatch = 0;
  let beschikbaarheidMatch = 0;

  // 1. Functie niveau match (40% weight)
  if (criteria.gezochte_functies.length > 0) {
    const functieMatches = criteria.gezochte_functies.some(
      (func) =>
        func.toLowerCase() === professional.functie_niveau.toLowerCase() ||
        professional.functie_niveau.toLowerCase().includes(func.toLowerCase())
    );
    if (functieMatches) {
      functieMatch = 40;
      reasoning.push("Functieniveau komt overeen");
    }
  } else {
    // No criteria specified, give partial credit
    functieMatch = 20;
  }

  // 2. Regio match (30% weight)
  if (professional.regio && criteria.plaats) {
    const profRegioLower = professional.regio.toLowerCase();
    const plaatsLower = criteria.plaats.toLowerCase();

    if (profRegioLower === plaatsLower) {
      regioMatch = 30;
      reasoning.push("Exacte regio match");
    } else if (
      profRegioLower.includes(plaatsLower) ||
      plaatsLower.includes(profRegioLower)
    ) {
      regioMatch = 20;
      reasoning.push("Regio gedeeltelijk match");
    } else {
      // Calculate distance-based match (simplified)
      const provinces = [
        "groningen", "friesland", "drenthe", "overijssel", "flevoland",
        "gelderland", "utrecht", "noord-holland", "zuid-holland", "zeeland",
        "noord-brabant", "limburg"
      ];
      
      const profProvince = provinces.find(p => profRegioLower.includes(p));
      const plaatsProvince = provinces.find(p => plaatsLower.includes(p));
      
      if (profProvince && plaatsProvince && profProvince === plaatsProvince) {
        regioMatch = 15;
        reasoning.push("Zelfde provincie");
      } else {
        regioMatch = 5;
      }
    }
  } else if (!professional.regio) {
    regioMatch = 10; // Neutral score if no region specified
  }

  // 3. Sector/doelgroep match (20% weight)
  if (criteria.sector.length > 0 || criteria.doelgroep.length > 0) {
    const allCriteria = [...criteria.sector, ...criteria.doelgroep];
    const skillsLower = professional.skills.map((s) => s.toLowerCase());

    const matches = allCriteria.filter((c) =>
      skillsLower.some((skill) => skill.includes(c.toLowerCase()))
    );

    if (matches.length > 0) {
      const matchPercentage = (matches.length / allCriteria.length) * 20;
      sectorMatch = Math.round(matchPercentage);
      reasoning.push(`${matches.length} sector/doelgroep match(es)`);
    }
  } else {
    sectorMatch = 10; // Partial credit if no criteria
  }

  // 4. Beschikbaarheid (10% weight)
  if (professional.beschikbaarheidsnotities) {
    const notes = professional.beschikbaarheidsnotities.toLowerCase();
    
    // Check for availability indicators
    if (notes.includes("direct beschikbaar") || notes.includes("per direct")) {
      beschikbaarheidMatch = 10;
      reasoning.push("Direct beschikbaar");
    } else if (notes.includes("beschikbaar")) {
      beschikbaarheidMatch = 7;
      reasoning.push("Beschikbaar");
    } else {
      beschikbaarheidMatch = 5;
    }
  } else {
    beschikbaarheidMatch = 5; // Neutral if no info
  }

  const totalScore = functieMatch + regioMatch + sectorMatch + beschikbaarheidMatch;

  return {
    functieMatch,
    regioMatch,
    sectorMatch,
    beschikbaarheidMatch,
    totalScore,
    reasoning,
  };
}
