/**
 * AI Domain Knowledge Bootstrap
 * 
 * Expert-level healthcare staffing knowledge coded as explicit rules.
 * This provides AI learning with a strong foundation without needing synthetic data.
 */

// ============= FUNCTION COMPATIBILITY MATRIX =============

/**
 * Function Compatibility Matrix
 * 
 * Defines which healthcare functions can perform tasks of other levels.
 * Higher qualified professionals can often work at lower levels, but not vice versa.
 * 
 * Format: source -> { target: compatibility_score }
 * Score 1.0 = fully compatible, 0.5 = partially compatible, 0 = not compatible
 */
export const FUNCTIE_COMPATIBILITY: Record<string, Record<string, number>> = {
  "HBO-V": {
    "HBO-V": 1.0,
    "Verpleegkundige MBO": 0.9,  // HBO-V can do MBO VP tasks
    "VIG": 0.8,                   // HBO-V can do VIG tasks
    "Helpende": 0.6,              // HBO-V can do Helpende tasks (overqualified)
    "GGZ-agoog": 0.5,             // Some overlap in GGZ settings
    "Begeleider": 0.4,            // Limited overlap
    "Persoonlijk begeleider": 0.4,
  },
  "Verpleegkundige MBO": {
    "Verpleegkundige MBO": 1.0,
    "VIG": 0.9,                   // MBO VP can do VIG tasks
    "Helpende": 0.7,              // MBO VP can do Helpende tasks
    "HBO-V": 0.3,                 // Limited ability to fill HBO-V roles
    "Begeleider": 0.3,
  },
  "VIG": {
    "VIG": 1.0,
    "Helpende": 0.9,              // VIG can do Helpende tasks
    "Verpleegkundige MBO": 0.3,   // Limited ability to fill VP roles
    "Begeleider": 0.5,            // Some overlap in begeleiding
  },
  "Helpende": {
    "Helpende": 1.0,
    "VIG": 0.2,                   // Very limited ability to fill VIG roles
    "Begeleider": 0.4,            // Some overlap
  },
  "GGZ-agoog": {
    "GGZ-agoog": 1.0,
    "Begeleider": 0.8,            // GGZ-agoog can do general begeleiding
    "Persoonlijk begeleider": 0.7,
    "HBO-V": 0.3,                 // Limited medical overlap
  },
  "Begeleider": {
    "Begeleider": 1.0,
    "Persoonlijk begeleider": 0.8,
    "Helpende": 0.6,
    "GGZ-agoog": 0.4,             // Can work in GGZ but less specialized
  },
  "Persoonlijk begeleider": {
    "Persoonlijk begeleider": 1.0,
    "Begeleider": 0.9,
    "GGZ-agoog": 0.5,
    "Helpende": 0.5,
  },
};

// ============= SECTOR AFFINITY MATRIX =============

/**
 * Sector Affinity Matrix
 * 
 * Defines how transferable experience between sectors is.
 * Higher scores mean skills transfer well between sectors.
 */
export const SECTOR_AFFINITY: Record<string, Record<string, number>> = {
  "GHZ": {
    "GHZ": 1.0,
    "GGZ": 0.6,                   // Mental health skills partially transfer
    "Jeugdzorg": 0.7,             // Youth care often overlaps with GHZ
    "VVT": 0.4,                   // Different care approach
    "Thuiszorg": 0.3,
    "Ziekenhuis": 0.3,
  },
  "GGZ": {
    "GGZ": 1.0,
    "Verslavingszorg": 0.8,       // High overlap
    "GHZ": 0.6,                   // Some overlap with GHZ clients
    "Jeugdzorg": 0.5,             // Youth mental health overlap
    "VVT": 0.3,
    "Thuiszorg": 0.2,
  },
  "VVT": {
    "VVT": 1.0,
    "Thuiszorg": 0.9,             // Very similar care settings
    "Ziekenhuis": 0.7,            // Medical skills transfer
    "GHZ": 0.4,
    "GGZ": 0.3,
  },
  "Thuiszorg": {
    "Thuiszorg": 1.0,
    "VVT": 0.9,
    "Ziekenhuis": 0.6,
    "GHZ": 0.3,
  },
  "Jeugdzorg": {
    "Jeugdzorg": 1.0,
    "GHZ": 0.7,                   // Youth disability care overlap
    "GGZ": 0.5,                   // Youth mental health
    "VVT": 0.2,
  },
  "Ziekenhuis": {
    "Ziekenhuis": 1.0,
    "VVT": 0.7,
    "Thuiszorg": 0.6,
    "GGZ": 0.3,
    "GHZ": 0.3,
  },
  "Verslavingszorg": {
    "Verslavingszorg": 1.0,
    "GGZ": 0.8,
    "GHZ": 0.4,
    "VVT": 0.2,
  },
};

// ============= DOELGROEP COMPATIBILITY =============

/**
 * Target Group Compatibility Matrix
 * 
 * Defines how well experience with one target group transfers to another.
 */
export const DOELGROEP_COMPATIBILITY: Record<string, Record<string, number>> = {
  "LVB": {
    "LVB": 1.0,
    "Autisme": 0.7,               // Often co-occurs
    "NAH": 0.6,                   // Some overlap in care approach
    "EMB": 0.5,
    "Kinderen/Jeugd": 0.5,
  },
  "Autisme": {
    "Autisme": 1.0,
    "LVB": 0.7,
    "Kinderen/Jeugd": 0.6,
    "NAH": 0.4,
  },
  "Psychiatrie": {
    "Psychiatrie": 1.0,
    "Verslaving": 0.8,            // High co-morbidity
    "Dakloosheid": 0.6,           // Often related
    "GGZ": 0.7,
  },
  "Ouderen": {
    "Ouderen": 1.0,
    "Dementie": 0.9,              // Subset of elderly care
    "Somatiek": 0.7,
    "NAH": 0.4,
  },
  "Dementie": {
    "Dementie": 1.0,
    "Ouderen": 0.9,
    "Somatiek": 0.6,
  },
  "NAH": {
    "NAH": 1.0,
    "LVB": 0.6,
    "Somatiek": 0.5,
    "Autisme": 0.4,
  },
  "Kinderen/Jeugd": {
    "Kinderen/Jeugd": 1.0,
    "Autisme": 0.6,
    "LVB": 0.5,
    "Jeugdzorg": 0.8,
  },
  "Verslaving": {
    "Verslaving": 1.0,
    "Psychiatrie": 0.8,
    "Dakloosheid": 0.7,
  },
};

// ============= LEARNING WEIGHTS =============

/**
 * Pipeline Stage Learning Weights
 * 
 * Defines how much to boost/penalize patterns based on pipeline outcomes.
 */
export const PIPELINE_LEARNING_WEIGHTS = {
  // Positive signals - boost patterns
  geplaatst: 0.15,                // Placement = strong positive signal
  goedgekeurd: 0.08,              // Approval = moderate positive signal
  interview: 0.05,                // Interview = weak positive signal
  
  // Neutral signals
  screening: 0.02,                // Screening = minimal signal
  nieuw: 0.0,                     // New = no signal yet
  
  // Negative signals - penalize patterns
  afgewezen: -0.05,               // Rejection = moderate negative signal
};

/**
 * Evaluation Rating Weights
 * 
 * How much to adjust pattern weights based on placement evaluations.
 */
export const EVALUATION_LEARNING_WEIGHTS = {
  rating_5_rehire: 0.12,          // Excellent + would rehire = strong boost
  rating_4_rehire: 0.08,          // Good + would rehire = moderate boost
  rating_5_no_rehire: 0.04,       // Excellent but won't rehire = small boost
  rating_4_no_rehire: 0.02,       // Good but won't rehire = minimal boost
  rating_3: 0.0,                  // Neutral = no change
  rating_2: -0.03,                // Below average = moderate penalty
  rating_1: -0.06,                // Poor = strong penalty
};

// ============= HELPER FUNCTIONS =============

/**
 * Get function compatibility score between two function levels
 */
export function getFunctieCompatibility(
  professionalFunctie: string | null,
  requiredFunctie: string
): number {
  if (!professionalFunctie) return 0;
  
  const normalizedPro = normalizeFunctieLevel(professionalFunctie);
  const normalizedReq = normalizeFunctieLevel(requiredFunctie);
  
  // Exact match
  if (normalizedPro === normalizedReq) return 1.0;
  
  // Check compatibility matrix
  const compatibility = FUNCTIE_COMPATIBILITY[normalizedPro];
  if (compatibility && compatibility[normalizedReq] !== undefined) {
    return compatibility[normalizedReq];
  }
  
  // No known compatibility
  return 0.2;
}

/**
 * Get sector affinity score between sectors
 */
export function getSectorAffinity(
  professionalSectors: string[],
  requiredSectors: string[]
): { score: number; reason: string } {
  if (!professionalSectors?.length || !requiredSectors?.length) {
    return { score: 0, reason: "Geen sector data" };
  }
  
  let bestScore = 0;
  let bestReason = "Geen sector match";
  
  for (const proSector of professionalSectors) {
    for (const reqSector of requiredSectors) {
      // Exact match
      if (proSector.toLowerCase() === reqSector.toLowerCase()) {
        return { score: 1.0, reason: `Exacte sector: ${proSector}` };
      }
      
      // Check affinity matrix
      const affinity = SECTOR_AFFINITY[proSector];
      if (affinity && affinity[reqSector]) {
        const score = affinity[reqSector];
        if (score > bestScore) {
          bestScore = score;
          bestReason = `${proSector} → ${reqSector} (${Math.round(score * 100)}% verwant)`;
        }
      }
    }
  }
  
  return { score: bestScore, reason: bestReason };
}

/**
 * Get doelgroep compatibility score
 */
export function getDoelgroepCompatibility(
  professionalDoelgroepen: string[],
  requiredDoelgroepen: string[]
): { score: number; reason: string } {
  if (!professionalDoelgroepen?.length || !requiredDoelgroepen?.length) {
    return { score: 0, reason: "Geen doelgroep data" };
  }
  
  let bestScore = 0;
  let bestReason = "Geen doelgroep match";
  
  for (const proDoel of professionalDoelgroepen) {
    for (const reqDoel of requiredDoelgroepen) {
      // Exact match
      if (proDoel.toLowerCase() === reqDoel.toLowerCase()) {
        return { score: 1.0, reason: `Exacte doelgroep: ${proDoel}` };
      }
      
      // Check compatibility matrix
      const compatibility = DOELGROEP_COMPATIBILITY[proDoel];
      if (compatibility && compatibility[reqDoel]) {
        const score = compatibility[reqDoel];
        if (score > bestScore) {
          bestScore = score;
          bestReason = `${proDoel} → ${reqDoel} (${Math.round(score * 100)}% verwant)`;
        }
      }
    }
  }
  
  return { score: bestScore, reason: bestReason };
}

/**
 * Calculate learning weight for a pipeline transition
 */
export function getPipelineLearningWeight(newStage: string): number {
  const stage = newStage.toLowerCase();
  return PIPELINE_LEARNING_WEIGHTS[stage as keyof typeof PIPELINE_LEARNING_WEIGHTS] || 0;
}

/**
 * Calculate learning weight for an evaluation
 */
export function getEvaluationLearningWeight(rating: number, wouldRehire: boolean): number {
  if (rating >= 5 && wouldRehire) return EVALUATION_LEARNING_WEIGHTS.rating_5_rehire;
  if (rating >= 4 && wouldRehire) return EVALUATION_LEARNING_WEIGHTS.rating_4_rehire;
  if (rating >= 5 && !wouldRehire) return EVALUATION_LEARNING_WEIGHTS.rating_5_no_rehire;
  if (rating >= 4 && !wouldRehire) return EVALUATION_LEARNING_WEIGHTS.rating_4_no_rehire;
  if (rating >= 3) return EVALUATION_LEARNING_WEIGHTS.rating_3;
  if (rating >= 2) return EVALUATION_LEARNING_WEIGHTS.rating_2;
  return EVALUATION_LEARNING_WEIGHTS.rating_1;
}

/**
 * Normalize function level string to canonical form
 */
function normalizeFunctieLevel(functie: string): string {
  const normalized = functie.toLowerCase().trim();
  
  const mapping: Record<string, string> = {
    "hbo-v": "HBO-V",
    "hbov": "HBO-V",
    "hbo v": "HBO-V",
    "verpleegkundige mbo": "Verpleegkundige MBO",
    "mbo verpleegkundige": "Verpleegkundige MBO",
    "verpleegkundige": "Verpleegkundige MBO",
    "vig": "VIG",
    "verzorgende ig": "VIG",
    "helpende": "Helpende",
    "helpende 2": "Helpende",
    "ggz-agoog": "GGZ-agoog",
    "ggz agoog": "GGZ-agoog",
    "begeleider": "Begeleider",
    "persoonlijk begeleider": "Persoonlijk begeleider",
    "pb": "Persoonlijk begeleider",
  };
  
  return mapping[normalized] || functie;
}
