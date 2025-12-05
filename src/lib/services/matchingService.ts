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
 * - Doelgroep: 15 punten (verhoogd van 10)
 * - Mobiliteit: 10 punten
 * - Beschikbaarheid: 5 punten
 * - Werkvorm: 5 punten (nieuw - vervangt bureau match)
 * - Bonus: Ervaring (+5), Leidinggevende (+3), Certificaten (+3), Nacht/Weekend (+2)
 * - AI Boost: up to +15 punten (from learned success patterns)
 * - Track Record: up to +8 punten (from historical performance)
 * - Expert Boost: up to +12 punten (from specialisme expert knowledge)
 */

import { supabase } from "@/integrations/supabase/client";

import {
  SECTOR_SIMILARITY, 
  DOELGROEP_RELATIONS, 
  calculateErvaringBonus, 
  LEIDINGGEVENDE_BONUS,
  getProvincieFromLocatie,
  BUUR_PROVINCIES,
  functieMatchesAny
} from '../constants/matchingConstants';

import {
  loadSuccessPatterns,
  calculateAILearningBoost,
  trackPatternUsage,
  type SuccessPattern
} from '../aiLearningBoost';

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
  werkvorm?: string | null; // ZZP | Uitzendkracht | ABCito constructie
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
  publieke_opmerking?: string | null; // NEW: sublocation description for keyword matching
}

// ============= PROFESSIONAL PERFORMANCE INTERFACE =============

export interface ProfessionalPerformance {
  professionalId: string;
  totalPlacements: number;
  successfulPlacements: number;
  avgRating: number | null;
  wouldRehireRate: number;
  totalEvaluations: number;
}

// ============= EXPERT KNOWLEDGE INTERFACES =============

export interface ExpertKnowledge {
  id: string;
  specialisme: string;
  expert_naam: string;
  vereiste_certificaten: string[];
  vereiste_ervaring: string[];
  methodieken: string[];
  match_criteria: {
    certificaat_gewicht: number;
    ervaring_gewicht: number;
    methodiek_gewicht: number;
  };
  keywords: string[];
  uitleg_template: string | null;
}

export interface ExpertAdvies {
  expert: string;
  specialisme: string;
  score: number;
  maxScore: number;
  advies: string;
  matchedCerts: string[];
  matchedErvaring: string[];
}

export interface MatchScoreBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  werkvormMatch: number;
  beschrijvingMatch: number;
  certificaatVereistMatch: number;
  trackRecordBonus: number;
  expertBonus: number; // NEW: expert knowledge bonus
  ervaringBonus: number;
  leidinggevendeBonus: number;
  certificatenBonus: number;
  dienstBonus: number;
  aiBoost: number;
  totalScore: number;
  normalizedScore: number;
  reasoning: string[];
  hasAIBoost: boolean;
  aiBoostReasons: string[];
  usedPatternIds: string[];
  hasTrackRecord: boolean;
  hasExpertAdvies: boolean; // NEW
  expertAdvies: ExpertAdvies[]; // NEW
  details: {
    functie?: { match: boolean; reason: string };
    regio?: { match: boolean; reason: string; matchType: 'exact' | 'province' | 'neighbor' | 'none' | 'postcode'; afstandKm?: number };
    sector?: { match: boolean; reason: string; directMatches: string[]; relatedMatches: string[] };
    doelgroep?: { match: boolean; reason: string; directMatches: string[]; relatedMatches: string[] };
    mobiliteit?: { match: boolean; reason: string };
    beschikbaarheid?: { match: boolean; reason: string };
    werkvorm?: { match: boolean; reason: string };
    beschrijving?: { match: boolean; reason: string; matchedKeywords: string[] };
    certificaatVereist?: { match: boolean; reason: string; matchedCerts: string[]; missingCerts: string[] };
    trackRecord?: { score: number; match: boolean; reason: string; wouldRehireRate?: number; avgRating?: number };
    expertAdvies?: { score: number; match: boolean; reason: string; expertCount: number }; // NEW
    ervaring?: { bonus: number; label: string };
    aiBoost?: { score: number; match: boolean; reason: string };
  };
}

// ============= PROFESSIONAL PERFORMANCE FUNCTIONS =============

/**
 * Fetch historical performance data for a professional
 * Used to calculate track record bonus in matching
 */
export async function getProfessionalPerformance(professionalId: string): Promise<ProfessionalPerformance> {
  const defaultPerformance: ProfessionalPerformance = {
    professionalId,
    totalPlacements: 0,
    successfulPlacements: 0,
    avgRating: null,
    wouldRehireRate: 0,
    totalEvaluations: 0
  };

  try {
    // Fetch all assignments with evaluations for this professional
    const { data: assignments, error } = await supabase
      .from('assignments')
      .select(`
        id,
        status,
        completed_at,
        assignment_evaluations (
          rating,
          would_rehire
        )
      `)
      .eq('professional_id', professionalId)
      .eq('is_test_data', false);

    if (error || !assignments || assignments.length === 0) {
      return defaultPerformance;
    }

    // Calculate metrics
    const totalPlacements = assignments.length;
    const completedPlacements = assignments.filter(a => 
      a.status === 'completed' || a.status === 'active'
    );
    const successfulPlacements = completedPlacements.length;

    // Extract evaluations
    const evaluations = assignments
      .flatMap(a => a.assignment_evaluations || [])
      .filter(e => e !== null);

    const totalEvaluations = evaluations.length;
    
    // Calculate average rating
    const ratingsSum = evaluations.reduce((sum, e) => sum + (e.rating || 0), 0);
    const avgRating = totalEvaluations > 0 ? ratingsSum / totalEvaluations : null;

    // Calculate would rehire rate
    const wouldRehireCount = evaluations.filter(e => e.would_rehire === true).length;
    const wouldRehireRate = totalEvaluations > 0 ? (wouldRehireCount / totalEvaluations) * 100 : 0;

    return {
      professionalId,
      totalPlacements,
      successfulPlacements,
      avgRating,
      wouldRehireRate,
      totalEvaluations
    };
  } catch (err) {
    console.error('[getProfessionalPerformance] Error:', err);
    return defaultPerformance;
  }
}

// ============= CONSTANTS =============

const MAX_BASE_SCORE = 100;

// ============= EXPERT KNOWLEDGE CACHE & DETECTION =============

let expertKnowledgeCache: ExpertKnowledge[] = [];
let expertCacheLoaded = false;

/**
 * Load expert knowledge from database (cached)
 */
export async function loadExpertKnowledge(): Promise<ExpertKnowledge[]> {
  if (expertCacheLoaded && expertKnowledgeCache.length > 0) {
    return expertKnowledgeCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('specialisme_expert_knowledge')
      .select('*');
    
    if (error) {
      console.error('[loadExpertKnowledge] Error:', error);
      return [];
    }
    
    expertKnowledgeCache = (data || []).map(row => ({
      id: row.id,
      specialisme: row.specialisme,
      expert_naam: row.expert_naam,
      vereiste_certificaten: row.vereiste_certificaten || [],
      vereiste_ervaring: row.vereiste_ervaring || [],
      methodieken: row.methodieken || [],
      match_criteria: row.match_criteria as ExpertKnowledge['match_criteria'],
      keywords: row.keywords || [],
      uitleg_template: row.uitleg_template
    }));
    
    expertCacheLoaded = true;
    console.log(`[loadExpertKnowledge] Loaded ${expertKnowledgeCache.length} experts`);
    return expertKnowledgeCache;
  } catch (err) {
    console.error('[loadExpertKnowledge] Error:', err);
    return [];
  }
}

/**
 * Detect specialisms from description text using expert keywords
 */
function detectSpecialismen(descriptionLower: string): string[] {
  const detected: string[] = [];
  
  // Use expert keywords if cached
  if (expertKnowledgeCache.length > 0) {
    for (const expert of expertKnowledgeCache) {
      if (expert.keywords.some(kw => descriptionLower.includes(kw.toLowerCase()))) {
        detected.push(expert.specialisme);
      }
    }
    return detected;
  }
  
  // Fallback: hardcoded detection
  if (descriptionLower.includes('ass') || descriptionLower.includes('autisme') || descriptionLower.includes('autistisch')) {
    detected.push('ASS');
  }
  if (descriptionLower.includes('nah') || descriptionLower.includes('hersenletsel') || descriptionLower.includes('cva')) {
    detected.push('NAH');
  }
  if (descriptionLower.includes('epilepsie') || descriptionLower.includes('aanval') || descriptionLower.includes('insult')) {
    detected.push('Epilepsie');
  }
  if (descriptionLower.includes('agressie') || descriptionLower.includes('gedrag') || descriptionLower.includes('grensoverschrijdend')) {
    detected.push('Gedrag');
  }
  if (descriptionLower.includes('verpleegtechnisch') || descriptionLower.includes('katheter') || descriptionLower.includes('sonde') || descriptionLower.includes('medisch')) {
    detected.push('Medisch');
  }
  if (descriptionLower.includes('verslaving') || descriptionLower.includes('middelen') || descriptionLower.includes('alcohol')) {
    detected.push('Verslaving');
  }
  
  return detected;
}

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

// ============= NEW: POSTCODE DISTANCE CALCULATION =============

/**
 * Calculate approximate distance between two Dutch postcodes
 * Uses first 2 digits (postcode region) for approximation
 * Returns distance in kilometers (approximate)
 */
function calculatePostcodeDistance(pc1: string | null, pc2: string | null): number | null {
  if (!pc1 || !pc2) return null;
  
  // Extract numeric parts (first 4 digits)
  const num1 = parseInt(pc1.replace(/\D/g, '').substring(0, 4));
  const num2 = parseInt(pc2.replace(/\D/g, '').substring(0, 4));
  
  if (isNaN(num1) || isNaN(num2)) return null;
  
  // Dutch postcodes roughly: lower = south, higher = north
  // First 2 digits indicate rough region
  const region1 = Math.floor(num1 / 100);
  const region2 = Math.floor(num2 / 100);
  
  // Approximate mapping of region differences to km
  // Netherlands is ~300km north-south, ~200km east-west
  // 99 regions total, so roughly 3-5 km per region difference on average
  const regionDiff = Math.abs(region1 - region2);
  
  // More nuanced calculation: same first digit = likely same province
  const firstDigit1 = Math.floor(region1 / 10);
  const firstDigit2 = Math.floor(region2 / 10);
  
  if (firstDigit1 === firstDigit2) {
    // Same broad region
    return regionDiff * 4; // 4km per region difference
  } else {
    // Different broad regions
    return regionDiff * 5; // 5km per region difference
  }
}

// ============= NEW: DESCRIPTION KEYWORD EXTRACTION =============

interface DescriptionRequirements {
  aandoeningen: string[];
  competenties: string[];
  methodieken: string[];
  certificaatVereisten: string[];
  zorgniveau: 'basis' | 'complex' | 'specialistisch';
}

/**
 * Extract requirements from sublocation publieke_opmerking
 * Mines rich text descriptions for matching criteria
 */
function extractRequirementsFromDescription(description: string | null): DescriptionRequirements {
  if (!description) {
    return { aandoeningen: [], competenties: [], methodieken: [], certificaatVereisten: [], zorgniveau: 'basis' };
  }
  
  const lowerDesc = description.toLowerCase();
  
  // Detecteer aandoeningen/doelgroepen
  const aandoeningen: string[] = [];
  const aandoeningPatterns: Record<string, string[]> = {
    'autisme': ['autisme', 'ass', 'autismespectrumstoornis'],
    'ADHD': ['adhd', 'add'],
    'NAH': ['nah', 'niet-aangeboren hersenletsel', 'hersenletsel'],
    'LVB': ['lvb', 'licht verstandelijke beperking', 'lichte verstandelijke'],
    'EMB': ['emb', 'ernstige meervoudige beperking'],
    'PTSS': ['ptss', 'trauma', 'post-traumatisch'],
    'ODD': ['odd', 'oppositioneel'],
    'depressie': ['depressie', 'depressief'],
    'angststoornis': ['angststoornis', 'angst'],
    'schizofrenie': ['schizofrenie', 'psychose', 'psychotisch'],
    'dementie': ['dementie', 'alzheimer'],
    'verslaving': ['verslaving', 'verslaafde', 'middelengebruik'],
    'borderline': ['borderline', 'persoonlijkheidsstoornis'],
    'eetstoornissen': ['eetstoornis', 'anorexia', 'boulimia'],
  };
  
  for (const [key, patterns] of Object.entries(aandoeningPatterns)) {
    if (patterns.some(p => lowerDesc.includes(p))) {
      aandoeningen.push(key);
    }
  }
  
  // Detecteer vereiste competenties
  const competenties: string[] = [];
  const competentiePatterns: Record<string, string[]> = {
    'medicatie': ['medicatie', 'medicijn', 'farmaco'],
    'agressiehantering': ['agressie', 'agressief gedrag', 'fysieke interventie'],
    'suïcidepreventie': ['suïcide', 'zelfbeschadiging', 'automutilatie'],
    'zelfstandig werken': ['zelfstandig', 'alleen werken', 'solistisch'],
    'rapportage': ['rapportage', 'rapporteren', 'documentatie'],
    'crisisinterventie': ['crisis', 'crisissituatie', 'nood'],
    'wondverzorging': ['wond', 'wondverzorging', 'verbandleer'],
    'palliatief': ['palliatief', 'terminaal', 'levenseinde'],
  };
  
  for (const [key, patterns] of Object.entries(competentiePatterns)) {
    if (patterns.some(p => lowerDesc.includes(p))) {
      competenties.push(key);
    }
  }
  
  // Detecteer methodieken
  const methodieken: string[] = [];
  const methodiekPatterns: Record<string, string[]> = {
    'Triple-C': ['triple-c', 'triple c'],
    'Geef me de 5': ['geef me de 5'],
    'LACCS': ['laccs'],
    'Belevingsgerichte zorg': ['belevingsgericht'],
    'Herstelondersteunende zorg': ['herstelondersteunend', 'herstelgericht'],
    'Positief Gedrag Ondersteuning': ['positief gedrag', 'pgo'],
    'Gentle Teaching': ['gentle teaching'],
  };
  
  for (const [key, patterns] of Object.entries(methodiekPatterns)) {
    if (patterns.some(p => lowerDesc.includes(p))) {
      methodieken.push(key);
    }
  }
  
  // Detecteer certificaat vereisten
  const certificaatVereisten: string[] = [];
  if (lowerDesc.includes('bopz') || lowerDesc.includes('wzd')) certificaatVereisten.push('BOPZ/WZD');
  if (lowerDesc.includes('bhv')) certificaatVereisten.push('BHV');
  if (lowerDesc.includes('voorbehouden handeling')) certificaatVereisten.push('Voorbehouden handelingen');
  if (lowerDesc.includes('rijbewijs') || lowerDesc.includes('eigen vervoer')) certificaatVereisten.push('Rijbewijs');
  
  // Bepaal zorgniveau
  let zorgniveau: 'basis' | 'complex' | 'specialistisch' = 'basis';
  if (lowerDesc.includes('specialistisch') || lowerDesc.includes('expert') || aandoeningen.length >= 3) {
    zorgniveau = 'specialistisch';
  } else if (lowerDesc.includes('complex') || competenties.length >= 2 || aandoeningen.length >= 2) {
    zorgniveau = 'complex';
  }
  
  return { aandoeningen, competenties, methodieken, certificaatVereisten, zorgniveau };
}

// ============= NEW: CERTIFICATE-TO-REQUIREMENT MATCHING =============

/**
 * Certificate relevance mapping
 * Maps target group requirements to relevant certificates
 */
const CERTIFICAAT_RELEVANTIE: Record<string, string[]> = {
  'agressiehantering': ['fysieke weerbaarheid', 'agressie', 'weerbaarheid', 'pmto'],
  'medicatie': ['medicatie', 'voorbehouden handelingen', 'farmaco'],
  'suïcidepreventie': ['suïcide preventie', 'ggz', 'crisis'],
  'autisme': ['autisme', 'ass', 'triple-c'],
  'dementie': ['dementie', 'psychogeriatrie', 'belevingsgericht'],
  'NAH': ['nah', 'hersenletsel', 'neuro'],
  'LVB': ['lvb', 'verstandelijke beperking', 'triple-c'],
  'verslaving': ['verslaving', 'middelengebruik', 'motiverende gespreksvoering'],
  'palliatief': ['palliatief', 'levenseinde', 'hospice'],
  'BOPZ/WZD': ['bopz', 'wzd', 'dwang'],
};

/**
 * Match candidate certificates against location requirements
 * Returns score and matched/missing certificates
 */
function matchCertificatenToRequirements(
  candidateCerts: string[] | null,
  requirements: DescriptionRequirements
): { score: number; matchedCerts: string[]; missingCerts: string[]; reason: string } {
  if (!candidateCerts || candidateCerts.length === 0) {
    if (requirements.certificaatVereisten.length > 0) {
      return { score: 0, matchedCerts: [], missingCerts: requirements.certificaatVereisten, reason: 'Geen certificaten' };
    }
    return { score: 3, matchedCerts: [], missingCerts: [], reason: 'Geen certificaten nodig' };
  }
  
  const normalizedCerts = candidateCerts.map(c => c.toLowerCase());
  const matchedCerts: string[] = [];
  const allRequirements = [...requirements.certificaatVereisten];
  
  // Check for competency-relevant certificates
  for (const competentie of requirements.competenties) {
    const relevantCerts = CERTIFICAAT_RELEVANTIE[competentie] || [];
    for (const cert of normalizedCerts) {
      if (relevantCerts.some(rc => cert.includes(rc) || rc.includes(cert))) {
        matchedCerts.push(`${candidateCerts[normalizedCerts.indexOf(cert)]} (${competentie})`);
      }
    }
  }
  
  // Check for aandoening-relevant certificates
  for (const aandoening of requirements.aandoeningen) {
    const relevantCerts = CERTIFICAAT_RELEVANTIE[aandoening] || [];
    for (const cert of normalizedCerts) {
      if (relevantCerts.some(rc => cert.includes(rc) || rc.includes(cert))) {
        if (!matchedCerts.some(mc => mc.includes(candidateCerts[normalizedCerts.indexOf(cert)]))) {
          matchedCerts.push(`${candidateCerts[normalizedCerts.indexOf(cert)]} (${aandoening})`);
        }
      }
    }
  }
  
  // Check direct certificate requirements
  for (const vereist of requirements.certificaatVereisten) {
    const vereistLower = vereist.toLowerCase();
    const hasMatch = normalizedCerts.some(c => c.includes(vereistLower) || vereistLower.includes(c));
    if (hasMatch && !matchedCerts.some(mc => mc.toLowerCase().includes(vereistLower))) {
      matchedCerts.push(vereist);
    }
  }
  
  const missingCerts = allRequirements.filter(req => 
    !normalizedCerts.some(c => c.includes(req.toLowerCase()) || req.toLowerCase().includes(c))
  );
  
  // Calculate score (max 10 points for certificate matching)
  let score = 0;
  if (matchedCerts.length > 0) {
    score = Math.min(10, 3 + matchedCerts.length * 2);
  } else if (requirements.competenties.length === 0 && requirements.certificaatVereisten.length === 0) {
    score = 5; // Neutral if no requirements
  }
  
  const reason = matchedCerts.length > 0 
    ? `${matchedCerts.length} relevante certificaten` 
    : missingCerts.length > 0 
      ? `Ontbreekt: ${missingCerts.join(', ')}` 
      : 'Geen specifieke vereisten';
  
  return { score, matchedCerts, missingCerts, reason };
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
  target: MatchTarget,
  aiBoostData?: { boost: number; reasons: string[]; usedPatternIds: string[] },
  professionalPerformance?: ProfessionalPerformance | null
): MatchScoreBreakdown {
  const reasoning: string[] = [];
  let functieMatch = 0;
  let regioMatch = 0;
  let sectorMatch = 0;
  let doelgroepMatch = 0;
  let mobiliteitMatch = 0;
  let beschikbaarheidMatch = 0;
  let werkvormMatch = 0;
  let beschrijvingMatch = 0; // NEW
  let certificaatVereistMatch = 0; // NEW
  let trackRecordBonus = 0; // NEW: historical performance
  let ervaringBonus = 0;
  let leidinggevendeBonus = 0;
  let certificatenBonus = 0;
  let dienstBonus = 0;
  let aiBoost = 0;

  const details: MatchScoreBreakdown['details'] = {};
  
  // ===== NEW: Extract requirements from description =====
  const descriptionReqs = extractRequirementsFromDescription(target.publieke_opmerking || null);

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

  // ===== 2. REGIO MATCH (20 punten) - NOW WITH POSTCODE DISTANCE =====
  const targetRegio = target.regio || (target.plaats ? [target.plaats] : []);
  const candidateRegio = candidate.regio;
  
  // NEW: Try postcode-based distance first (most accurate)
  const postcodeDistance = calculatePostcodeDistance(candidate.postcode, target.postcode);
  
  if (postcodeDistance !== null) {
    // Use postcode-based distance scoring
    if (postcodeDistance < 15) {
      regioMatch = 20;
      reasoning.push(`✅ Regio: <15 km afstand (postcode match)`);
      details.regio = { match: true, reason: `<15 km afstand`, matchType: 'postcode', afstandKm: postcodeDistance };
    } else if (postcodeDistance < 30) {
      regioMatch = 17;
      reasoning.push(`✅ Regio: 15-30 km afstand`);
      details.regio = { match: true, reason: `~${postcodeDistance} km afstand`, matchType: 'postcode', afstandKm: postcodeDistance };
    } else if (postcodeDistance < 50) {
      regioMatch = 12;
      reasoning.push(`⚠️ Regio: 30-50 km afstand`);
      details.regio = { match: true, reason: `~${postcodeDistance} km afstand`, matchType: 'postcode', afstandKm: postcodeDistance };
    } else if (postcodeDistance < 75) {
      regioMatch = 8;
      reasoning.push(`⚠️ Regio: 50-75 km afstand`);
      details.regio = { match: false, reason: `~${postcodeDistance} km afstand (ver)`, matchType: 'postcode', afstandKm: postcodeDistance };
    } else {
      regioMatch = 5;
      reasoning.push(`❌ Regio: >75 km afstand`);
      details.regio = { match: false, reason: `~${postcodeDistance} km afstand (heel ver)`, matchType: 'postcode', afstandKm: postcodeDistance };
    }
  } else if (candidateRegio && targetRegio.length > 0) {
    // Fallback to text-based region matching
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

  // ===== 5. DOELGROEP MATCH (15 punten - verhoogd voor betere differentiatie) =====
  const targetDoelgroepen = target.doelgroep || [];
  const candidateDoelgroepen = candidate.doelgroep_ervaring || [];
  
  if (targetDoelgroepen.length > 0 && candidateDoelgroepen.length > 0) {
    const semanticMatch = calculateSemanticDoelgroepMatch(candidateDoelgroepen, targetDoelgroepen);
    doelgroepMatch = Math.round(semanticMatch.score * 15);
    
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
    doelgroepMatch = 4;
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

  // ===== 7. WERKVORM MATCH (5 punten - vervangt bureau match) =====
  // Bureau match is verwijderd: ABCzorg en CitoZorg zijn beide eigenaar van het systeem
  // Professionals kunnen via beide bureaus geplaatst worden
  const candidateWerkvorm = candidate.werkvorm;
  
  if (candidateWerkvorm) {
    werkvormMatch = 5;
    reasoning.push(`✅ Werkvorm: ${candidateWerkvorm}`);
    details.werkvorm = { match: true, reason: candidateWerkvorm };
  } else {
    werkvormMatch = 2; // Gedeeltelijke score als werkvorm nog niet bekend
    details.werkvorm = { match: false, reason: 'Werkvorm niet opgegeven' };
  }

  // ===== 8. NEW: BESCHRIJVING KEYWORD MATCH (10 punten) =====
  // Match candidate doelgroep_ervaring against keywords in publieke_opmerking
  // Note: candidateDoelgroepen already declared above in doelgroep match section
  
  if (descriptionReqs.aandoeningen.length > 0 && candidateDoelgroepen.length > 0) {
    const matchedKeywords: string[] = [];
    
    // Check if candidate has experience with detected aandoeningen
    for (const aandoening of descriptionReqs.aandoeningen) {
      const aandoeningLower = aandoening.toLowerCase();
      const hasExperience = candidateDoelgroepen.some(d => 
        d.toLowerCase().includes(aandoeningLower) || 
        aandoeningLower.includes(d.toLowerCase())
      );
      if (hasExperience) {
        matchedKeywords.push(aandoening);
      }
    }
    
    if (matchedKeywords.length > 0) {
      beschrijvingMatch = Math.min(10, 4 + matchedKeywords.length * 2);
      reasoning.push(`✅ Beschrijving: Ervaring met ${matchedKeywords.join(', ')}`);
      details.beschrijving = { match: true, reason: `${matchedKeywords.length} keyword matches`, matchedKeywords };
    } else {
      beschrijvingMatch = 2;
      reasoning.push(`⚠️ Beschrijving: Geen ervaring met ${descriptionReqs.aandoeningen.slice(0, 2).join(', ')}`);
      details.beschrijving = { match: false, reason: `Ontbreekt: ${descriptionReqs.aandoeningen.slice(0, 2).join(', ')}`, matchedKeywords: [] };
    }
  } else if (descriptionReqs.aandoeningen.length === 0) {
    beschrijvingMatch = 5; // Neutral if no specific requirements in description
    details.beschrijving = { match: true, reason: 'Geen specifieke vereisten', matchedKeywords: [] };
  }

  // ===== 9. NEW: CERTIFICAAT-VEREISTE MATCH (10 punten) =====
  const certMatch = matchCertificatenToRequirements(candidate.certificaten, descriptionReqs);
  certificaatVereistMatch = certMatch.score;
  
  if (certMatch.matchedCerts.length > 0) {
    reasoning.push(`✅ Certificaten vereist: ${certMatch.matchedCerts.slice(0, 2).join(', ')}`);
  } else if (certMatch.missingCerts.length > 0) {
    reasoning.push(`⚠️ Certificaten ontbreken: ${certMatch.missingCerts.slice(0, 2).join(', ')}`);
  }
  details.certificaatVereist = { 
    match: certMatch.score >= 5, 
    reason: certMatch.reason, 
    matchedCerts: certMatch.matchedCerts, 
    missingCerts: certMatch.missingCerts 
  };

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

  // ===== AI LEARNING BOOST (up to +15 points) =====
  let hasAIBoost = false;
  let aiBoostReasons: string[] = [];
  let usedPatternIds: string[] = [];

  if (aiBoostData && aiBoostData.boost > 0) {
    // AI boost is already in percentage, convert to points (max 15)
    aiBoost = Math.min(15, Math.round(aiBoostData.boost * 15 / 100));
    hasAIBoost = true;
    aiBoostReasons = aiBoostData.reasons;
    usedPatternIds = aiBoostData.usedPatternIds;
    reasoning.push(...aiBoostData.reasons.map(r => `🤖 ${r}`));
    details.aiBoost = { 
      score: aiBoost, 
      match: true, 
      reason: `AI geleerd patroon (+${aiBoostData.boost}%)` 
    };
  }

  // ===== NEW: TRACK RECORD BONUS (up to +8 points) =====
  let hasTrackRecord = false;
  
  if (professionalPerformance && professionalPerformance.totalPlacements > 0) {
    hasTrackRecord = true;
    const { wouldRehireRate, avgRating, totalPlacements, totalEvaluations } = professionalPerformance;
    
    // Calculate bonus based on would_rehire rate (max 8 points)
    // 100% rehire = 8 points, 80% = 6 points, 60% = 4 points, etc.
    trackRecordBonus = Math.round(wouldRehireRate * 8 / 100);
    
    // Extra boost for high ratings
    if (avgRating && avgRating >= 4.5 && totalEvaluations >= 2) {
      trackRecordBonus = Math.min(8, trackRecordBonus + 2);
    }
    
    const reasonText = avgRating 
      ? `${wouldRehireRate.toFixed(0)}% zou opnieuw inhuren, ${avgRating.toFixed(1)}★ (${totalPlacements} plaatsingen)`
      : `${wouldRehireRate.toFixed(0)}% zou opnieuw inhuren (${totalPlacements} plaatsingen)`;
    
    reasoning.push(`🏆 Track Record: ${reasonText} (+${trackRecordBonus})`);
    details.trackRecord = { 
      score: trackRecordBonus, 
      match: trackRecordBonus >= 4, 
      reason: reasonText,
      wouldRehireRate,
      avgRating: avgRating || undefined
    };
  } else {
    details.trackRecord = { 
      score: 0, 
      match: false, 
      reason: 'Geen eerdere plaatsingen' 
    };
  }

  // ===== NEW: EXPERT BONUS (up to +12 points) =====
  let expertBonus = 0;
  let hasExpertAdvies = false;
  const expertAdvies: ExpertAdvies[] = [];
  
  // Detect specialisms from description
  const descriptionLower = (target.publieke_opmerking || '').toLowerCase();
  const detectedSpecialismen = detectSpecialismen(descriptionLower);
  
  if (detectedSpecialismen.length > 0 && expertKnowledgeCache.length > 0) {
    // Match against each detected specialism
    for (const specialisme of detectedSpecialismen) {
      const expert = expertKnowledgeCache.find(e => e.specialisme === specialisme);
      if (!expert) continue;
      
      const matchedCerts: string[] = [];
      const matchedErvaring: string[] = [];
      let expertScore = 0;
      const maxScore = expert.match_criteria.certificaat_gewicht + expert.match_criteria.ervaring_gewicht + expert.match_criteria.methodiek_gewicht;
      
      // Match certificates
      const candidateCertsLower = (candidate.certificaten || []).map(c => c.toLowerCase());
      for (const vereistCert of expert.vereiste_certificaten) {
        if (candidateCertsLower.some(c => c.includes(vereistCert.toLowerCase()) || vereistCert.toLowerCase().includes(c))) {
          matchedCerts.push(vereistCert);
        }
      }
      if (matchedCerts.length > 0) {
        expertScore += Math.min(expert.match_criteria.certificaat_gewicht, matchedCerts.length * 5);
      }
      
      // Match experience
      const candidateDoelgroepenLower = (candidate.doelgroep_ervaring || []).map(d => d.toLowerCase());
      const candidateSectorenLower = (candidate.ervaring_sector || []).map(s => s.toLowerCase());
      const allCandidateExp = [...candidateDoelgroepenLower, ...candidateSectorenLower];
      
      for (const vereistExp of expert.vereiste_ervaring) {
        if (allCandidateExp.some(e => e.includes(vereistExp.toLowerCase()) || vereistExp.toLowerCase().includes(e))) {
          matchedErvaring.push(vereistExp);
        }
      }
      if (matchedErvaring.length > 0) {
        expertScore += Math.min(expert.match_criteria.ervaring_gewicht, matchedErvaring.length * 8);
      }
      
      // Generate advice
      const matchStatus = expertScore >= maxScore * 0.6 
        ? 'Kandidaat voldoet aan criteria.' 
        : expertScore >= maxScore * 0.3 
          ? 'Kandidaat heeft beperkte ervaring.' 
          : 'Kandidaat mist relevante ervaring.';
      
      const advies = expert.uitleg_template 
        ? expert.uitleg_template.replace('{match_status}', matchStatus)
        : `${expert.expert_naam}: ${matchStatus}`;
      
      expertAdvies.push({
        expert: expert.expert_naam,
        specialisme: expert.specialisme,
        score: expertScore,
        maxScore,
        advies,
        matchedCerts,
        matchedErvaring
      });
      
      // Add to total bonus (max 12 points total across all experts)
      expertBonus += Math.min(4, Math.round(expertScore / maxScore * 4)); // max 4 per expert
    }
    
    expertBonus = Math.min(12, expertBonus);
    hasExpertAdvies = expertAdvies.length > 0;
    
    if (hasExpertAdvies) {
      reasoning.push(`🎓 Expert Advies: ${expertAdvies.length} specialist(en) geraadpleegd (+${expertBonus})`);
      details.expertAdvies = {
        score: expertBonus,
        match: expertBonus >= 4,
        reason: `${expertAdvies.length} specialist(en): ${expertAdvies.map(e => e.specialisme).join(', ')}`,
        expertCount: expertAdvies.length
      };
    }
  }

  // ===== TOTAL SCORE =====
  // Adjusted weights: Functie 20, Regio 18, Sector 15, Doelgroep 10, Beschrijving 10, 
  // CertificaatVereist 10, Mobiliteit 7, Beschikbaarheid 5, Werkvorm 5 = 100 base
  // + Track Record bonus (up to +8) + AI boost (up to +15) + Expert bonus (up to +12)
  const totalScore = 
    Math.round(functieMatch * 0.8) +  // 25 -> 20 points
    Math.round(regioMatch * 0.9) +    // 20 -> 18 points  
    Math.round(sectorMatch * 0.75) +  // 20 -> 15 points
    Math.round(doelgroepMatch * 0.67) + // 15 -> 10 points
    beschrijvingMatch +               // 10 points
    certificaatVereistMatch +         // 10 points
    Math.round(mobiliteitMatch * 0.7) + // 10 -> 7 points
    beschikbaarheidMatch +            // 5 points
    werkvormMatch +                   // 5 points
    ervaringBonus + 
    leidinggevendeBonus + 
    certificatenBonus + 
    dienstBonus +
    trackRecordBonus +                // up to +8 points
    expertBonus +                     // NEW: up to +12 points
    aiBoost;

  // Normalize to 0-100 scale (max base is 100, but with bonuses can go slightly higher)
  const normalizedScore = Math.round(Math.min(100, Math.max(0, totalScore)));

  return {
    functieMatch,
    regioMatch,
    sectorMatch,
    doelgroepMatch,
    mobiliteitMatch,
    beschikbaarheidMatch,
    werkvormMatch,
    beschrijvingMatch,
    certificaatVereistMatch,
    trackRecordBonus,
    expertBonus,
    ervaringBonus,
    leidinggevendeBonus,
    certificatenBonus,
    dienstBonus,
    aiBoost,
    totalScore,
    normalizedScore,
    reasoning,
    hasAIBoost,
    hasTrackRecord,
    hasExpertAdvies,
    expertAdvies,
    aiBoostReasons,
    usedPatternIds,
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
    werkvorm?: string | null;
  },
  client: {
    gezochte_functies?: string[] | null;
    sector?: string[] | null;
    doelgroep?: string[] | null;
    regio?: string[] | null;
    org_id?: string | null;
  },
  aiBoostData?: { boost: number; reasons: string[]; usedPatternIds: string[] }
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
      werkvorm: extractedData.werkvorm,
    },
    {
      gezochte_functies: client.gezochte_functies,
      sector: client.sector,
      doelgroep: client.doelgroep,
      regio: client.regio,
      org_id: client.org_id,
    },
    aiBoostData
  );
}

/**
 * Async version that loads AI patterns and calculates boost automatically
 */
export async function calculateApplicationToClientMatchWithAI(
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
    werkvorm?: string | null;
  },
  client: {
    gezochte_functies?: string[] | null;
    sector?: string[] | null;
    doelgroep?: string[] | null;
    regio?: string[] | null;
    org_id?: string | null;
  }
): Promise<MatchScoreBreakdown> {
  // Load AI success patterns
  const patterns = await loadSuccessPatterns();
  
  // Calculate AI boost
  const aiBoostResult = calculateAILearningBoost(
    extractedData.functie_niveau || null,
    extractedData.ervaring_sector || [],
    extractedData.doelgroep_ervaring || [],
    patterns
  );
  
  // Track pattern usage (fire-and-forget)
  if (aiBoostResult.usedPatternIds.length > 0) {
    trackPatternUsage(aiBoostResult.usedPatternIds);
  }
  
  return calculateApplicationToClientMatch(
    extractedData,
    client,
    {
      boost: aiBoostResult.boost,
      reasons: aiBoostResult.reasons,
      usedPatternIds: aiBoostResult.usedPatternIds
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

// ============= VACANCY MATCHING =============

export interface Vacancy {
  id: string;
  sublocation_id: string;
  titel: string;
  functie_niveau: string;
  aantal_fte?: number;
  uren_per_week?: number;
  uurtarief_indicatie?: number;
  start_datum?: string;
  eind_datum?: string;
  deadline?: string;
  vereiste_certificaten?: string[];
  gewenste_sector_ervaring?: string[];
  gewenste_doelgroep_ervaring?: string[];
  beschrijving?: string;
  status: 'open' | 'in_review' | 'vervuld' | 'gesloten';
  urgentie: 'laag' | 'normaal' | 'hoog' | 'kritiek';
  // From sublocation join
  sublocation_naam?: string;
  sublocation_plaats?: string;
  sublocation_provincie?: string;
}

export interface VacancyMatchScoreBreakdown extends MatchScoreBreakdown {
  urenMatch: number;
  certificatenMatch: number;
  startdatumMatch: number;
  details: MatchScoreBreakdown['details'] & {
    uren?: { match: boolean; reason: string };
    certificaten?: { match: boolean; reason: string; missing: string[] };
    startdatum?: { match: boolean; reason: string };
  };
}

/**
 * Calculate match score between a candidate and a specific vacancy
 * More specific than sublocation matching - uses exact vacancy requirements
 */
export function calculateVacancyMatchScore(
  candidate: MatchCandidate,
  vacancy: Vacancy,
  sublocationData?: {
    sector?: string[] | null;
    doelgroep?: string[] | null;
    plaats?: string | null;
    provincie?: string | null;
  }
): VacancyMatchScoreBreakdown {
  // First calculate base score using sublocation data
  const baseTarget: MatchTarget = {
    gezochte_functies: [vacancy.functie_niveau],
    sector: vacancy.gewenste_sector_ervaring || sublocationData?.sector || [],
    doelgroep: vacancy.gewenste_doelgroep_ervaring || sublocationData?.doelgroep || [],
    plaats: sublocationData?.plaats,
    provincie: sublocationData?.provincie,
    capaciteit_min: vacancy.uren_per_week ? vacancy.uren_per_week - 4 : null,
    capaciteit_max: vacancy.uren_per_week ? vacancy.uren_per_week + 4 : null,
  };
  
  const baseScore = calculateUnifiedMatchScore(candidate, baseTarget);
  
  // Additional vacancy-specific scoring
  let urenMatch = 0;
  let certificatenMatch = 0;
  let startdatumMatch = 0;
  
  const extendedDetails: VacancyMatchScoreBreakdown['details'] = { ...baseScore.details };
  const extendedReasoning = [...baseScore.reasoning];

  // Uren match (bonus if exact match)
  if (vacancy.uren_per_week && candidate.beschikbaarheid_uren) {
    const { min, max } = candidate.beschikbaarheid_uren;
    if (vacancy.uren_per_week >= min && vacancy.uren_per_week <= max) {
      urenMatch = 5;
      extendedReasoning.push(`✅ Uren: ${vacancy.uren_per_week} uur past binnen beschikbaarheid`);
      extendedDetails.uren = { match: true, reason: `${vacancy.uren_per_week} uur past binnen beschikbaarheid` };
    } else {
      extendedReasoning.push(`⚠️ Uren: ${vacancy.uren_per_week} uur buiten beschikbaarheid (${min}-${max})`);
      extendedDetails.uren = { match: false, reason: `${vacancy.uren_per_week} uur buiten beschikbaarheid` };
    }
  }

  // Certificaten match
  if (vacancy.vereiste_certificaten && vacancy.vereiste_certificaten.length > 0) {
    const candidateCerts = candidate.certificaten || [];
    const matchedCerts = vacancy.vereiste_certificaten.filter(cert =>
      candidateCerts.some(cc => cc.toLowerCase().includes(cert.toLowerCase()) || cert.toLowerCase().includes(cc.toLowerCase()))
    );
    const missingCerts = vacancy.vereiste_certificaten.filter(cert => !matchedCerts.includes(cert));
    
    if (matchedCerts.length === vacancy.vereiste_certificaten.length) {
      certificatenMatch = 5;
      extendedReasoning.push(`✅ Certificaten: Alle vereiste certificaten aanwezig`);
      extendedDetails.certificaten = { match: true, reason: 'Alle vereiste certificaten aanwezig', missing: [] };
    } else if (matchedCerts.length > 0) {
      certificatenMatch = 2;
      extendedReasoning.push(`⚠️ Certificaten: ${matchedCerts.length}/${vacancy.vereiste_certificaten.length} aanwezig`);
      extendedDetails.certificaten = { match: false, reason: `${missingCerts.length} ontbrekend`, missing: missingCerts };
    } else {
      extendedReasoning.push(`❌ Certificaten: Geen van de vereiste certificaten`);
      extendedDetails.certificaten = { match: false, reason: 'Geen vereiste certificaten', missing: missingCerts };
    }
  }

  // Startdatum match (bonus if available before start)
  if (vacancy.start_datum) {
    // Assume candidate is available - in real scenario check availability calendar
    startdatumMatch = 3;
    extendedReasoning.push(`✅ Startdatum: Beschikbaar voor ${vacancy.start_datum}`);
    extendedDetails.startdatum = { match: true, reason: `Beschikbaar voor startdatum` };
  }

  // Calculate total with vacancy-specific bonuses
  const vacancyBonus = urenMatch + certificatenMatch + startdatumMatch;
  const totalScore = Math.min(baseScore.totalScore + vacancyBonus, MAX_BASE_SCORE + 15);
  const normalizedScore = Math.min(Math.round((totalScore / MAX_BASE_SCORE) * 100), 100);

  return {
    ...baseScore,
    urenMatch,
    certificatenMatch,
    startdatumMatch,
    totalScore,
    normalizedScore,
    reasoning: extendedReasoning,
    details: extendedDetails,
  };
}

// ============= APPLICATION DIRECT MATCHING =============
// Calculate match score directly from application.extracted_data without professional conversion

interface ApplicationMatchSource {
  extracted_data: any;
  completeness_score?: number | null;
}

// Helper to get value from {value, confidence} or plain value
function getExtractedValue<T>(field: T | { value: T; confidence: number } | null | undefined): T | null {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value: T; confidence: number }).value;
  }
  return field as T;
}

/**
 * Calculate match score directly from application extracted_data
 * This enables matching BEFORE professional conversion
 */
export function calculateApplicationMatchScore(
  application: ApplicationMatchSource,
  target: MatchTarget,
  aiBoostData?: { boost: number; reasons: string[]; usedPatternIds: string[] }
): MatchScoreBreakdown {
  const data = application.extracted_data || {};
  
  // Map extracted_data to MatchCandidate interface
  const candidate: MatchCandidate = {
    functie_niveau: getExtractedValue(data.functie_niveau),
    regio: getExtractedValue(data.regio) || getExtractedValue(data.woonplaats),
    woonplaats: getExtractedValue(data.woonplaats),
    postcode: getExtractedValue(data.postcode),
    provincie: null, // Could derive from postcode if needed
    ervaring_sector: getExtractedValue(data.ervaring_sector) || [],
    doelgroep_ervaring: getExtractedValue(data.doelgroep_ervaring) || getExtractedValue(data.specifieke_doelgroepen) || [],
    jaren_ervaring: getExtractedValue(data.jaren_ervaring),
    leidinggevende_ervaring: getExtractedValue(data.leidinggevende_ervaring),
    heeft_auto: getExtractedValue(data.eigen_vervoer),
    heeft_rijbewijs: getExtractedValue(data.rijbewijs) ? true : null,
    eigen_vervoer: getExtractedValue(data.eigen_vervoer),
    beschikbaarheid_uren: parseBeschikbaarheid(getExtractedValue(data.beschikbaarheid) || getExtractedValue(data.voorkeur_uren_per_week)),
    nachtdienst_bereid: getExtractedValue(data.nachtdienst_bereid),
    weekenddienst_bereid: getExtractedValue(data.weekenddienst_bereid),
    certificaten: getExtractedValue(data.certificaten) || [],
    werkvorm: getExtractedValue(data.werkvorm),
  };
  
  // Use unified match calculation
  return calculateUnifiedMatchScore(candidate, target, aiBoostData);
}

/**
 * Batch calculate top matches for an application against all sublocations and vacancies
 */
export async function calculateTopMatchesForApplication(
  supabaseClient: any,
  applicationId: string,
  extractedData: any,
  options?: {
    sublocationLimit?: number;
    vacancyLimit?: number;
    minScore?: number;
  }
): Promise<{
  sublocations: Array<{ sublocation: any; score: MatchScoreBreakdown }>;
  vacancies: Array<{ vacancy: any; score: MatchScoreBreakdown }>;
}> {
  const limit = options?.sublocationLimit || 10;
  const vacancyLimit = options?.vacancyLimit || 10;
  const minScore = options?.minScore || 40;
  
  const application = { extracted_data: extractedData };
  
  // Fetch active sublocations
  const { data: sublocations } = await supabaseClient
    .from('client_sublocations')
    .select(`
      id, naam, plaats, sector, doelgroep, gezochte_functies, provincie,
      location:client_locations(naam, client_org:client_organizations(name))
    `)
    .eq('is_active', true)
    .limit(200);

  // Fetch open vacancies
  const { data: vacancies } = await supabaseClient
    .from('vacancies')
    .select(`
      id, titel, functie_niveau, urgentie, uren_per_week,
      sublocation:client_sublocations(naam, plaats, sector, doelgroep, gezochte_functies, provincie)
    `)
    .eq('status', 'open')
    .limit(100);

  // Calculate sublocation scores
  const scoredSublocations = (sublocations || [])
    .map((sub: any) => {
      const target: MatchTarget = {
        gezochte_functies: sub.gezochte_functies,
        sector: sub.sector,
        doelgroep: sub.doelgroep,
        plaats: sub.plaats,
        provincie: sub.provincie,
      };
      const score = calculateApplicationMatchScore(application, target);
      return { sublocation: sub, score };
    })
    .filter(item => item.score.normalizedScore >= minScore)
    .sort((a, b) => b.score.normalizedScore - a.score.normalizedScore)
    .slice(0, limit);

  // Calculate vacancy scores
  const scoredVacancies = (vacancies || [])
    .filter((vac: any) => vac.sublocation)
    .map((vac: any) => {
      const sub = vac.sublocation;
      const target: MatchTarget = {
        gezochte_functies: [vac.functie_niveau, ...(sub?.gezochte_functies || [])],
        sector: sub?.sector,
        doelgroep: sub?.doelgroep,
        plaats: sub?.plaats,
        provincie: sub?.provincie,
      };
      const score = calculateApplicationMatchScore(application, target);
      return { vacancy: vac, score };
    })
    .filter(item => item.score.normalizedScore >= minScore)
    .sort((a, b) => b.score.normalizedScore - a.score.normalizedScore)
    .slice(0, vacancyLimit);

  return {
    sublocations: scoredSublocations,
    vacancies: scoredVacancies,
  };
}
