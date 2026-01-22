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
import { logger } from "@/lib/logger";

const log = logger.create('MatchingService');

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
  trackPatternUsage
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
  // OPTIM 1: Specialisaties for expert matching (ADL, HIC, PAAZ, EMB, etc.)
  specialisaties?: string[] | null;
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
  // OPTIM: Additional fields for UI optimizations
  isLocationRelevant?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  matchedMethodieken?: string[];
}

// Category contribution for Apple UI transparency
export interface CategoryContribution {
  points: number;
  max: number;
  percentage: number; // Contribution to total (e.g., 48% of base score)
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
  expertBonus: number;
  ervaringBonus: number;
  leidinggevendeBonus: number;
  certificatenBonus: number;
  dienstBonus: number;
  aiBoost: number;
  klantVoorkeurBonus: number; // NEW: Client expert preferences bonus
  totalScore: number;
  normalizedScore: number;
  // NEW: Category contributions for Apple UI
  categoryContributions: {
    geschiktheid: CategoryContribution;
    locatie: CategoryContribution;
    ervaring: CategoryContribution;
    praktisch: CategoryContribution;
  };
  bonusTotal: number;
  bonusPercentage: number;
  reasoning: string[];
  hasAIBoost: boolean;
  aiBoostReasons: string[];
  usedPatternIds: string[];
  hasTrackRecord: boolean;
  hasExpertAdvies: boolean;
  expertAdvies: ExpertAdvies[];
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
    expertAdvies?: { score: number; match: boolean; reason: string; expertCount: number };
    klantVoorkeur?: { score: number; match: boolean; reason: string; matchedWerkstijlen?: string[]; matchedSpecialismen?: string[] };
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
    log.error('[getProfessionalPerformance] Error:', err);
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
      log.error('[loadExpertKnowledge] Error:', error);
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
    log.log(`[loadExpertKnowledge] Loaded ${expertKnowledgeCache.length} experts`);
    return expertKnowledgeCache;
  } catch (err) {
    log.error('[loadExpertKnowledge] Error:', err);
    return [];
  }
}

// ============= FIX 3: ERVARING CROSS-MAPPING MATRIX =============
/**
 * Experience cross-mapping: related experiences that transfer skills
 * Used to give partial credit when candidate has related but not exact experience
 */
const ERVARING_RELATIES: Record<string, { related: string[]; score: number }> = {
  'ASS': { related: ['Autisme', 'Psychiatrie', 'Gedragsproblematiek', 'Prikkelverwerking', 'GGZ', 'GHZ'], score: 0.6 },
  'NAH': { related: ['Hersenletsel', 'CVA', 'Somatiek', 'Cognitief', 'Neurologie', 'Revalidatie'], score: 0.6 },
  'Gedrag': { related: ['Agressie', 'Psychiatrie', 'Forensisch', 'Grensoverschrijdend', 'GGZ', 'Jeugdzorg'], score: 0.6 },
  'Epilepsie': { related: ['Neurologie', 'Aanvallen', 'Somatiek', 'Medisch', 'VVT'], score: 0.6 },
  'Medisch': { related: ['Verpleging', 'Somatiek', 'Palliatief', 'VVT', 'Ziekenhuis', 'Thuiszorg'], score: 0.6 },
  'Verslaving': { related: ['GGZ', 'Psychiatrie', 'Dubbele diagnose', 'FACT', 'Maatschappelijke opvang'], score: 0.6 },
  'Dementie': { related: ['Ouderen', 'VVT', 'Psychogeriatrie', 'Verpleeghuiszorg', 'Thuiszorg'], score: 0.7 },
  'Palliatief': { related: ['Terminale zorg', 'VVT', 'Ouderen', 'Hospice', 'Medisch'], score: 0.7 },
  'Jeugd': { related: ['Jeugdzorg', 'Kinderen', 'Orthopedagogiek', 'Gezinshulp', 'Pleegzorg'], score: 0.6 },
  'LVB': { related: ['Verstandelijke beperking', 'GHZ', 'Gehandicaptenzorg', 'MVB', 'EVB', 'Begeleiding'], score: 0.7 },
};

// ============= ERVARING_ALIASES: Afkortingen → Volledige termen =============
/**
 * Maps abbreviations to their full forms for expert matching
 * This ensures "NAH" in candidate profile matches "Niet-aangeboren hersenletsel" in expert requirements
 */
const ERVARING_ALIASES: Record<string, string[]> = {
  // Doelgroep afkortingen
  'NAH': ['nah', 'niet-aangeboren hersenletsel', 'hersenletsel', 'cva', 'hersenbeschadiging'],
  'LVB': ['lvb', 'licht verstandelijke beperking', 'verstandelijke beperking', 'licht verstandelijk'],
  'MVB': ['mvb', 'matig verstandelijke beperking', 'matig verstandelijk'],
  'EVB': ['evb', 'ernstig verstandelijke beperking', 'ernstig verstandelijk', 'ernstig meervoudig'],
  'ASS': ['ass', 'autisme', 'autismespectrumstoornis', 'autistisch', 'spectrum'],
  'EMB': ['emb', 'ernstig meervoudig beperkt', 'meervoudig beperkt', 'ernstig meervoudig'],
  
  // Sector afkortingen
  'GGZ': ['ggz', 'geestelijke gezondheidszorg', 'psychiatrie', 'psychisch'],
  'GHZ': ['ghz', 'gehandicaptenzorg', 'verstandelijk gehandicaptenzorg', 'gehandicapt'],
  'VVT': ['vvt', 'verpleging verzorging thuiszorg', 'ouderenzorg', 'verpleging en verzorging'],
  
  // Specialisaties
  'HIC': ['hic', 'high intensive care', 'high care', 'intensieve zorg'],
  'PAAZ': ['paaz', 'psychiatrische afdeling algemeen ziekenhuis', 'psychiatrische afdeling'],
  'ADL': ['adl', 'algemene dagelijkse levensverrichtingen', 'dagelijkse levensverrichtingen'],
  'FACT': ['fact', 'flexible assertive community treatment', 'flexibele behandeling'],
  
  // Ziektebeelden
  'ODD': ['odd', 'oppositioneel-opstandige gedragsstoornis', 'oppositioneel'],
  'ADHD': ['adhd', 'attention deficit hyperactivity disorder', 'aandachtstekort'],
  'PTSS': ['ptss', 'posttraumatische stressstoornis', 'trauma', 'posttraumatisch'],
  'PDD-NOS': ['pdd-nos', 'pervasieve ontwikkelingsstoornis', 'pdd'],
};

/**
 * Expand candidate experience using aliases
 * Converts abbreviations to full forms for better matching
 */
function expandExperienceWithAliases(experiences: string[]): string[] {
  const expanded = new Set<string>();
  
  for (const exp of experiences) {
    expanded.add(exp.toLowerCase());
    
    // Check if this experience matches any alias key
    const expUpper = exp.toUpperCase();
    const expLower = exp.toLowerCase();
    
    // Direct key match (e.g., "NAH" → add all aliases)
    if (ERVARING_ALIASES[expUpper]) {
      ERVARING_ALIASES[expUpper].forEach(alias => expanded.add(alias.toLowerCase()));
    }
    
    // Check if exp is one of the alias values
    for (const [key, aliases] of Object.entries(ERVARING_ALIASES)) {
      if (aliases.some(alias => alias.toLowerCase() === expLower || expLower.includes(alias.toLowerCase()))) {
        expanded.add(key.toLowerCase());
        aliases.forEach(alias => expanded.add(alias.toLowerCase()));
      }
    }
  }
  
  return Array.from(expanded);
}

/**
 * Check if candidate has related experience for a specialisme
 * Now uses expanded aliases for better matching
 */
function hasRelatedExperience(candidateExp: string[], specialisme: string): { hasRelated: boolean; relatedMatches: string[] } {
  const relation = ERVARING_RELATIES[specialisme];
  if (!relation) return { hasRelated: false, relatedMatches: [] };
  
  // Expand candidate experience with aliases
  const expandedExp = expandExperienceWithAliases(candidateExp);
  
  const relatedMatches: string[] = [];
  for (const exp of candidateExp) {
    const expLower = exp.toLowerCase();
    for (const relatedExp of relation.related) {
      const relatedLower = relatedExp.toLowerCase();
      // Check direct match
      if (expLower.includes(relatedLower) || relatedLower.includes(expLower)) {
        relatedMatches.push(exp);
        break;
      }
      // Check if expanded experience contains the related experience
      if (expandedExp.some(expanded => expanded.includes(relatedLower) || relatedLower.includes(expanded))) {
        relatedMatches.push(exp);
        break;
      }
    }
  }
  
  return { hasRelated: relatedMatches.length > 0, relatedMatches };
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
  
  // Fallback: hardcoded detection (extended with new experts)
  if (descriptionLower.includes('ass') || descriptionLower.includes('autisme') || descriptionLower.includes('autistisch') || descriptionLower.includes('spectrum')) {
    detected.push('ASS');
  }
  if (descriptionLower.includes('nah') || descriptionLower.includes('hersenletsel') || descriptionLower.includes('cva') || descriptionLower.includes('hersenbeschadiging')) {
    detected.push('NAH');
  }
  if (descriptionLower.includes('epilepsie') || descriptionLower.includes('aanval') || descriptionLower.includes('insult') || descriptionLower.includes('toeval')) {
    detected.push('Epilepsie');
  }
  if (descriptionLower.includes('agressie') || descriptionLower.includes('gedrag') || descriptionLower.includes('grensoverschrijdend') || descriptionLower.includes('weerbaar')) {
    detected.push('Gedrag');
  }
  if (descriptionLower.includes('verpleegtechnisch') || descriptionLower.includes('katheter') || descriptionLower.includes('sonde') || descriptionLower.includes('medisch')) {
    detected.push('Medisch');
  }
  if (descriptionLower.includes('verslaving') || descriptionLower.includes('middelen') || descriptionLower.includes('alcohol') || descriptionLower.includes('drugs')) {
    detected.push('Verslaving');
  }
  // New experts fallback detection
  if (descriptionLower.includes('dementie') || descriptionLower.includes('alzheimer') || descriptionLower.includes('psychogeriatr')) {
    detected.push('Dementie');
  }
  if (descriptionLower.includes('palliatief') || descriptionLower.includes('terminaal') || descriptionLower.includes('hospice') || descriptionLower.includes('levenseinde')) {
    detected.push('Palliatief');
  }
  if (descriptionLower.includes('jeugd') || descriptionLower.includes('kind') || descriptionLower.includes('orthopeda') || descriptionLower.includes('pleegzorg')) {
    detected.push('Jeugd');
  }
  if (descriptionLower.includes('lvb') || descriptionLower.includes('mvb') || descriptionLower.includes('verstandelijk') || descriptionLower.includes('zwakbegaafd')) {
    detected.push('LVB');
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

// ============= FIX 4: POSTCODE & PROVINCIE ENRICHMENT FROM WOONPLAATS =============

/**
 * Dutch city to postcode prefix mapping (approximate first 4 digits)
 * Used for distance-based matching when only woonplaats is known
 */
const WOONPLAATS_POSTCODE_MAP: Record<string, string> = {
  // Noord-Brabant (25+ steden)
  'cuijk': '5431', 'boxmeer': '5831', 'uden': '5401', 'veghel': '5461',
  'oss': '5341', 'eindhoven': '5611', 'helmond': '5701', 'tilburg': '5038',
  's-hertogenbosch': '5211', 'den bosch': '5211', 'breda': '4811',
  'waalwijk': '5141', 'roosendaal': '4701', 'bergen op zoom': '4611',
  'oosterhout': '4901', 'dongen': '5101', 'mill': '5451', 'grave': '5361',
  'beugen': '5835', 'sambeek': '5836', 'sint-michielsgestel': '5271',
  'vught': '5261', 'meierijstad': '5461', 'best': '5681', 'nuenen': '5671',
  'geldrop': '5661', 'valkenswaard': '5551', 'bladel': '5531', 'eersel': '5521',
  
  // Gelderland (25+ steden)
  'nijmegen': '6511', 'arnhem': '6811', 'apeldoorn': '7311', 'ede': '6711',
  'wageningen': '6701', 'doetinchem': '7001', 'winterswijk': '7101',
  'elst': '6661', 'wijchen': '6601', 'tiel': '4001', 'zaltbommel': '5301',
  'culemborg': '4101', 'geldermalsen': '4191', 'buren': '4001', 'druten': '6651',
  'beuningen': '6641', 'groesbeek': '6561', 'heumen': '6581', 'berg en dal': '6571',
  'zevenaar': '6901', 'duiven': '6921', 'westervoort': '6931', 'rheden': '6991',
  'rozendaal': '6891', 'brummen': '6971', 'lochem': '7241', 'zutphen': '7201',
  'voorst': '7391', 'epe': '8161', 'hattem': '8051', 'heerde': '8181',
  'harderwijk': '3841', 'ermelo': '3851', 'putten': '3881', 'nunspeet': '8071',
  'barneveld': '3771', 'scherpenzeel': '3991', 'nijkerk': '3861',
  
  // Limburg (20+ steden)
  'maastricht': '6211', 'heerlen': '6411', 'roermond': '6041', 'venlo': '5911',
  'venray': '5801', 'sittard': '6131', 'kerkrade': '6461', 'weert': '6001',
  'geleen': '6161', 'stein': '6171', 'brunssum': '6441', 'landgraaf': '6371',
  'valkenburg': '6301', 'meerssen': '6231', 'beek': '6191', 'nuth': '6361',
  'simpelveld': '6369', 'gulpen': '6271', 'vaals': '6291', 'eijsden': '6245',
  'peel en maas': '5988', 'horst aan de maas': '5961', 'bergen': '5854',
  'gennep': '6591', 'mook en middelaar': '6585',
  
  // Zuid-Holland (20+ steden)
  'rotterdam': '3011', 'den haag': '2511', "'s-gravenhage": '2511',
  'leiden': '2311', 'dordrecht': '3311', 'delft': '2611', 'zoetermeer': '2701',
  'gouda': '2801', 'alphen aan den rijn': '2401', 'katwijk': '2221',
  'leidschendam': '2261', 'voorburg': '2271', 'rijswijk': '2281',
  'schiedam': '3111', 'vlaardingen': '3131', 'maassluis': '3141',
  'spijkenisse': '3201', 'hellevoetsluis': '3221', 'brielle': '3231',
  'capelle aan den ijssel': '2901', 'krimpen aan den ijssel': '2921',
  
  // Noord-Holland (20+ steden)
  'amsterdam': '1011', 'haarlem': '2011', 'hilversum': '1211', 'zaandam': '1501',
  'alkmaar': '1811', 'hoofddorp': '2131', 'amstelveen': '1181', 'purmerend': '1441',
  'hoorn': '1621', 'den helder': '1781', 'heerhugowaard': '1701', 'schagen': '1741',
  'beverwijk': '1941', 'ijmuiden': '1971', 'velsen': '1981', 'castricum': '1901',
  'uitgeest': '1911', 'heemskerk': '1961', 'diemen': '1111', 'weesp': '1381',
  'bussum': '1401', 'naarden': '1411', 'huizen': '1271', 'blaricum': '1261',
  
  // Utrecht (15+ steden)
  'utrecht': '3511', 'amersfoort': '3811', 'zeist': '3701', 'nieuwegein': '3431',
  'veenendaal': '3901', 'woerden': '3441', 'houten': '3991', 'ijsselstein': '3401',
  'maarssen': '3601', 'bilthoven': '3721', 'soest': '3761', 'baarn': '3741',
  'bunschoten': '3751', 'leusden': '3831', 'woudenberg': '3931',
  'renswoude': '3927', 'rhenen': '3911', 'cuneraweg': '3911',
  
  // Overijssel (15+ steden)
  'zwolle': '8011', 'enschede': '7511', 'deventer': '7411', 'almelo': '7601',
  'hengelo': '7551', 'kampen': '8261', 'oldenzaal': '7571', 'raalte': '8101',
  'ommen': '7731', 'hardenberg': '7771', 'dalfsen': '7721', 'staphorst': '7951',
  'steenwijkerland': '8331', 'zwartewaterland': '8064', 'olst-wijhe': '8121',
  
  // Groningen (10+ steden)
  'groningen': '9711', 'veendam': '9641', 'hoogezand': '9601', 'stadskanaal': '9501',
  'winschoten': '9671', 'delfzijl': '9931', 'appingedam': '9901', 'leek': '9351',
  'haren': '9751', 'zuidhorn': '9801',
  
  // Friesland (10+ steden)
  'leeuwarden': '8911', 'drachten': '9201', 'sneek': '8601', 'heerenveen': '8441',
  'harlingen': '8861', 'franeker': '8801', 'bolsward': '8701', 'dokkum': '9101',
  'lemmer': '8531', 'joure': '8501',
  
  // Zeeland (8+ steden)
  'middelburg': '4331', 'goes': '4461', 'vlissingen': '4381', 'terneuzen': '4531',
  'hulst': '4561', 'sluis': '4524', 'tholen': '4691', 'veere': '4351',
  
  // Flevoland (5+ steden)
  'almere': '1311', 'lelystad': '8221', 'dronten': '8251', 'zeewolde': '3891',
  'urk': '8321', 'noordoostpolder': '8301',
  
  // Drenthe (10+ steden)
  'emmen': '7811', 'hoogeveen': '7901', 'meppel': '7941', 'assen': '9401',
  'coevorden': '7741', 'borger-odoorn': '7875', 'aa en hunze': '9461',
  'tynaarlo': '9481', 'noordenveld': '9331', 'westerveld': '7961',
};

/**
 * Dutch city to province mapping (50+ cities)
 */
const WOONPLAATS_PROVINCIE_MAP: Record<string, string> = {
  // Noord-Brabant
  'cuijk': 'noord-brabant', 'boxmeer': 'noord-brabant', 'uden': 'noord-brabant',
  'veghel': 'noord-brabant', 'oss': 'noord-brabant', 'eindhoven': 'noord-brabant',
  'helmond': 'noord-brabant', 'tilburg': 'noord-brabant', 's-hertogenbosch': 'noord-brabant',
  'den bosch': 'noord-brabant', 'breda': 'noord-brabant', 'mill': 'noord-brabant',
  'grave': 'noord-brabant', 'beugen': 'noord-brabant', 'sambeek': 'noord-brabant',
  'waalwijk': 'noord-brabant', 'roosendaal': 'noord-brabant', 'bergen op zoom': 'noord-brabant',
  'oosterhout': 'noord-brabant', 'dongen': 'noord-brabant', 'sint-michielsgestel': 'noord-brabant',
  'vught': 'noord-brabant', 'meierijstad': 'noord-brabant', 'best': 'noord-brabant',
  'nuenen': 'noord-brabant', 'geldrop': 'noord-brabant', 'valkenswaard': 'noord-brabant',
  'bladel': 'noord-brabant', 'eersel': 'noord-brabant',
  // Gelderland
  'nijmegen': 'gelderland', 'arnhem': 'gelderland', 'apeldoorn': 'gelderland',
  'ede': 'gelderland', 'wageningen': 'gelderland', 'doetinchem': 'gelderland',
  'winterswijk': 'gelderland', 'elst': 'gelderland', 'wijchen': 'gelderland',
  'tiel': 'gelderland', 'zaltbommel': 'gelderland', 'culemborg': 'gelderland',
  'zevenaar': 'gelderland', 'duiven': 'gelderland', 'westervoort': 'gelderland',
  'zutphen': 'gelderland', 'lochem': 'gelderland', 'harderwijk': 'gelderland',
  'ermelo': 'gelderland', 'barneveld': 'gelderland', 'nijkerk': 'gelderland',
  'groesbeek': 'gelderland', 'beuningen': 'gelderland', 'druten': 'gelderland',
  // Limburg
  'maastricht': 'limburg', 'heerlen': 'limburg', 'roermond': 'limburg',
  'venlo': 'limburg', 'venray': 'limburg', 'sittard': 'limburg',
  'kerkrade': 'limburg', 'weert': 'limburg', 'geleen': 'limburg',
  'brunssum': 'limburg', 'landgraaf': 'limburg', 'valkenburg': 'limburg',
  'gennep': 'limburg', 'mook en middelaar': 'limburg', 'bergen': 'limburg',
  // Zuid-Holland
  'rotterdam': 'zuid-holland', 'den haag': 'zuid-holland', "'s-gravenhage": 'zuid-holland',
  'leiden': 'zuid-holland', 'dordrecht': 'zuid-holland', 'delft': 'zuid-holland',
  'zoetermeer': 'zuid-holland', 'gouda': 'zuid-holland', 'alphen aan den rijn': 'zuid-holland',
  'katwijk': 'zuid-holland', 'schiedam': 'zuid-holland', 'vlaardingen': 'zuid-holland',
  'spijkenisse': 'zuid-holland', 'capelle aan den ijssel': 'zuid-holland',
  // Noord-Holland
  'amsterdam': 'noord-holland', 'haarlem': 'noord-holland', 'hilversum': 'noord-holland',
  'zaandam': 'noord-holland', 'alkmaar': 'noord-holland', 'hoofddorp': 'noord-holland',
  'amstelveen': 'noord-holland', 'purmerend': 'noord-holland', 'hoorn': 'noord-holland',
  'den helder': 'noord-holland', 'heerhugowaard': 'noord-holland', 'beverwijk': 'noord-holland',
  'bussum': 'noord-holland', 'huizen': 'noord-holland', 'diemen': 'noord-holland',
  // Utrecht
  'utrecht': 'utrecht', 'amersfoort': 'utrecht', 'zeist': 'utrecht',
  'nieuwegein': 'utrecht', 'veenendaal': 'utrecht', 'woerden': 'utrecht',
  'houten': 'utrecht', 'ijsselstein': 'utrecht', 'soest': 'utrecht',
  'baarn': 'utrecht', 'leusden': 'utrecht', 'bunschoten': 'utrecht',
  // Overijssel
  'zwolle': 'overijssel', 'enschede': 'overijssel', 'deventer': 'overijssel',
  'almelo': 'overijssel', 'hengelo': 'overijssel', 'kampen': 'overijssel',
  'oldenzaal': 'overijssel', 'raalte': 'overijssel', 'hardenberg': 'overijssel',
  // Groningen
  'groningen': 'groningen', 'veendam': 'groningen', 'hoogezand': 'groningen',
  'stadskanaal': 'groningen', 'winschoten': 'groningen', 'delfzijl': 'groningen',
  // Friesland
  'leeuwarden': 'friesland', 'drachten': 'friesland', 'sneek': 'friesland',
  'heerenveen': 'friesland', 'harlingen': 'friesland', 'franeker': 'friesland',
  // Zeeland
  'middelburg': 'zeeland', 'goes': 'zeeland', 'vlissingen': 'zeeland',
  'terneuzen': 'zeeland', 'hulst': 'zeeland',
  // Flevoland
  'almere': 'flevoland', 'lelystad': 'flevoland', 'dronten': 'flevoland',
  // Drenthe
  'emmen': 'drenthe', 'hoogeveen': 'drenthe', 'meppel': 'drenthe',
  'assen': 'drenthe', 'coevorden': 'drenthe',
};

/**
 * Derive approximate postcode from woonplaats for distance matching
 */
function derivePostcodeFromWoonplaats(woonplaats: string | null): string | null {
  if (!woonplaats) return null;
  const key = woonplaats.toLowerCase().trim();
  return WOONPLAATS_POSTCODE_MAP[key] || null;
}

/**
 * Derive provincie from woonplaats
 */
function deriveProvincieFromWoonplaats(woonplaats: string | null): string | null {
  if (!woonplaats) return null;
  const key = woonplaats.toLowerCase().trim();
  return WOONPLAATS_PROVINCIE_MAP[key] || null;
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

  // ===== 4. SECTOR MATCH (20 punten) - Phase 4: Direct match bonus =====
  const targetSectors = target.sector || [];
  const candidateSectors = candidate.ervaring_sector || [];
  
  if (targetSectors.length > 0 && candidateSectors.length > 0) {
    const semanticMatch = calculateSemanticSectorMatch(candidateSectors, targetSectors);
    
    // FASE 3 FIX: DIRECTE sector match moet SIGNIFICANT hoger scoren
    const hasDirectMatch = semanticMatch.directMatches.length > 0;
    
    // Direct GGZ-GGZ match: 20 punten
    // Related GGZ-GHZ match: 12 punten (60%)
    // Geen match: 4 punten base
    if (hasDirectMatch) {
      sectorMatch = 20; // Direct match = FULL points
      reasoning.push(`✅ Sector: ${semanticMatch.directMatches.join(', ')} (directe match)`);
    } else if (semanticMatch.relatedMatches.length > 0) {
      // Related match (e.g., GGZ-GHZ) = max 14 punten (70%)
      sectorMatch = Math.min(14, Math.round(semanticMatch.score * 14));
      reasoning.push(`⚠️ Sector: ${semanticMatch.relatedMatches.join(', ')} (gerelateerd)`);
    } else {
      // Geen match
      sectorMatch = 0;
      reasoning.push(`❌ Sector: Geen match met ${targetSectors.join(', ')}`);
    }
    
    details.sector = {
      match: sectorMatch > 0,
      reason: hasDirectMatch 
        ? `Direct: ${semanticMatch.directMatches.join(', ')}`
        : sectorMatch > 0 
          ? `${Math.round(semanticMatch.score * 100)}% gerelateerd` 
          : 'Geen sector overlap',
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

  // ===== 6. BESCHIKBAARHEID MATCH (5 punten) - FIX: Flexibel candidates =====
  const candidateBeschikbaarheid = candidate.beschikbaarheid_uren;
  const targetCapaciteit = 
    target.capaciteit_min !== null && target.capaciteit_max !== null
      ? { min: target.capaciteit_min, max: target.capaciteit_max }
      : null;

  // FIX Phase 2: "Flexibel" candidates should get full score
  // Detect flexibility based on beschikbaarheid_uren values (32-40 or higher = flexible)
  const isFlexibel = candidateBeschikbaarheid && 
                     candidateBeschikbaarheid.max >= 32 && 
                     (candidateBeschikbaarheid.max - candidateBeschikbaarheid.min) >= 8;
  
  if (isFlexibel) {
    beschikbaarheidMatch = 5;
    reasoning.push(`✅ Beschikbaarheid: Flexibel (${candidateBeschikbaarheid!.min}-${candidateBeschikbaarheid!.max} uur)`);
    details.beschikbaarheid = { match: true, reason: 'Flexibel beschikbaar' };
  } else if (candidateBeschikbaarheid && targetCapaciteit) {
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
  } else if (!candidateBeschikbaarheid) {
    beschikbaarheidMatch = 3; // Neutral when no data
    details.beschikbaarheid = { match: false, reason: 'Niet opgegeven' };
  } else {
    beschikbaarheidMatch = 4; // Partial when some data available
    details.beschikbaarheid = { match: true, reason: `${candidateBeschikbaarheid.min}-${candidateBeschikbaarheid.max} uur` };
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

  // ===== 8. NEW: BESCHRIJVING KEYWORD MATCH (15 punten - verhoogd voor differentiatie) =====
  // Match candidate doelgroep_ervaring against keywords in publieke_opmerking
  // FIX Phase 3: Use KEYWORD_ALIASES for ASS/autisme cross-mapping
  // Note: candidateDoelgroepen already declared above in doelgroep match section
  
  // Phase 3: Keyword aliases for better matching
  const KEYWORD_ALIASES: Record<string, string[]> = {
    'autisme': ['ass', 'autismespectrumstoornis', 'asperger', 'pdd-nos', 'pdd', 'spectrum'],
    'ass': ['autisme', 'autismespectrumstoornis', 'asperger', 'pdd-nos', 'spectrum'],
    'lvb': ['licht verstandelijke beperking', 'zwakbegaafd', 'verstandelijke beperking', 'licht verstandelijk'],
    'nah': ['niet-aangeboren hersenletsel', 'hersenletsel', 'cva', 'hersenbeschadiging'],
    'psychiatrie': ['ggz', 'geestelijke gezondheidszorg', 'psychisch', 'psychiatrisch'],
    'ggz': ['psychiatrie', 'geestelijke gezondheidszorg', 'psychisch'],
    'dementie': ['alzheimer', 'psychogeriatrie', 'geheugenproblemen'],
    'verslaving': ['middelengebruik', 'verslaafde', 'drugs', 'alcohol'],
  };
  
  if (descriptionReqs.aandoeningen.length > 0 && candidateDoelgroepen.length > 0) {
    const matchedKeywords: string[] = [];
    
    // Expand candidate experience with aliases
    const expandedCandidateExp = new Set<string>();
    for (const d of candidateDoelgroepen) {
      const dLower = d.toLowerCase();
      expandedCandidateExp.add(dLower);
      // Add aliases
      for (const [key, aliases] of Object.entries(KEYWORD_ALIASES)) {
        if (dLower.includes(key) || aliases.some(a => dLower.includes(a))) {
          expandedCandidateExp.add(key);
          aliases.forEach(a => expandedCandidateExp.add(a));
        }
      }
    }
    
    // Check if candidate has experience with detected aandoeningen (using aliases)
    for (const aandoening of descriptionReqs.aandoeningen) {
      const aandoeningLower = aandoening.toLowerCase();
      const aandoeningAliases = KEYWORD_ALIASES[aandoeningLower] || [];
      
      // Direct match or alias match
      const hasExperience = expandedCandidateExp.has(aandoeningLower) ||
        aandoeningAliases.some(alias => expandedCandidateExp.has(alias)) ||
        Array.from(expandedCandidateExp).some(exp => 
          exp.includes(aandoeningLower) || aandoeningLower.includes(exp)
        );
      
      if (hasExperience) {
        matchedKeywords.push(aandoening);
      }
    }
    
    if (matchedKeywords.length > 0) {
      // Phase 4: Increased weighting for better differentiation (15 max instead of 10)
      beschrijvingMatch = Math.min(15, 5 + matchedKeywords.length * 3);
      reasoning.push(`✅ Beschrijving: Ervaring met ${matchedKeywords.join(', ')}`);
      details.beschrijving = { match: true, reason: `${matchedKeywords.length} keyword matches`, matchedKeywords };
    } else {
      beschrijvingMatch = 2;
      reasoning.push(`⚠️ Beschrijving: Geen ervaring met ${descriptionReqs.aandoeningen.slice(0, 2).join(', ')}`);
      details.beschrijving = { match: false, reason: `Ontbreekt: ${descriptionReqs.aandoeningen.slice(0, 2).join(', ')}`, matchedKeywords: [] };
    }
  } else if (descriptionReqs.aandoeningen.length === 0) {
    // FALLBACK: Als geen keywords in beschrijving, match direct op doelgroep overlap
    // Dit voorkomt dat kandidaten met sterke doelgroep match toch lage ervaring score krijgen
    const targetDoelgroepen = (target.doelgroep || []).map(d => d.toLowerCase());
    
    if (candidateDoelgroepen.length > 0 && targetDoelgroepen.length > 0) {
      // Check directe doelgroep overlap
      const directMatches: string[] = [];
      for (const candDoelgroep of candidateDoelgroepen) {
        const candLower = candDoelgroep.toLowerCase();
        for (const targetDoelgroep of targetDoelgroepen) {
          // Direct match of alias match
          if (candLower.includes(targetDoelgroep) || targetDoelgroep.includes(candLower)) {
            directMatches.push(candDoelgroep);
            break;
          }
          // Check aliases
          const aliases = KEYWORD_ALIASES[candLower] || [];
          if (aliases.some(a => targetDoelgroep.includes(a))) {
            directMatches.push(candDoelgroep);
            break;
          }
        }
      }
      
      if (directMatches.length > 0) {
        // Geef 10-15 punten bij directe doelgroep match (i.p.v. 7 neutral)
        beschrijvingMatch = Math.min(15, 8 + directMatches.length * 2);
        reasoning.push(`✅ Beschrijving: Directe doelgroep match: ${directMatches.slice(0, 3).join(', ')}`);
        details.beschrijving = { match: true, reason: `Doelgroep fallback: ${directMatches.length} matches`, matchedKeywords: directMatches };
      } else {
        beschrijvingMatch = 5; // Basis als geen directe match maar wel ervaring
        details.beschrijving = { match: false, reason: 'Geen directe doelgroep overlap', matchedKeywords: [] };
      }
    } else {
      beschrijvingMatch = 7; // Neutral if no specific requirements
      details.beschrijving = { match: true, reason: 'Geen specifieke vereisten', matchedKeywords: [] };
    }
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
    // FIX: aiBoostData.boost is already a percentage (0-20), use directly as points (max 15)
    // Previously: aiBoost = Math.round(aiBoostData.boost * 15 / 100) gave only 0-3 points
    // Correct: Use the boost percentage as-is (capped at 15)
    aiBoost = Math.min(15, Math.round(aiBoostData.boost));
    hasAIBoost = true;
    aiBoostReasons = aiBoostData.reasons;
    usedPatternIds = aiBoostData.usedPatternIds;
    reasoning.push(...aiBoostData.reasons.map(r => `🤖 ${r}`));
    details.aiBoost = { 
      score: aiBoost, 
      match: true, 
      reason: `AI geleerd patroon (+${aiBoost} punten)` 
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
  // Optimalisaties: Specialisatie-keywords, Proportionele bonus, Locatie-specifieke detectie, Confidence indicator
  let expertBonus = 0;
  let hasExpertAdvies = false;
  const expertAdvies: ExpertAdvies[] = [];
  
  // Detect specialisms from description
  const descriptionLower = (target.publieke_opmerking || '').toLowerCase();
  const detectedSpecialismen = detectSpecialismen(descriptionLower);
  
  // OPTIM 1: Extract candidate specializations (ADL, HIC, PAAZ, EMB, etc.)
  const candidateSpecialisaties = (candidate.specialisaties || []).map(s => s.toLowerCase());
  
  if (expertKnowledgeCache.length > 0) {
    // OPTIM 2 & 4: Process ALL experts, but boost location-relevant ones
    for (const expert of expertKnowledgeCache) {
      const isLocationRelevant = detectedSpecialismen.includes(expert.specialisme);
      
      const matchedCerts: string[] = [];
      const matchedErvaring: string[] = [];
      const relatedErvaring: string[] = [];
      const matchedMethodieken: string[] = [];
      let expertScore = 0;
      const maxScore = expert.match_criteria.certificaat_gewicht + expert.match_criteria.ervaring_gewicht + expert.match_criteria.methodiek_gewicht;
      
      // Match certificates (with expanded synonyms)
      const candidateCertsLower = (candidate.certificaten || []).map(c => c.toLowerCase());
      for (const vereistCert of expert.vereiste_certificaten) {
        const vereistLower = vereistCert.toLowerCase();
        if (candidateCertsLower.some(c => c.includes(vereistLower) || vereistLower.includes(c))) {
          matchedCerts.push(vereistCert);
        }
      }
      if (matchedCerts.length > 0) {
        expertScore += Math.min(expert.match_criteria.certificaat_gewicht, matchedCerts.length * 5);
      }
      
      // Match experience (direct matches) - FIX 2: Use expanded aliases!
      const candidateDoelgroepenLower = (candidate.doelgroep_ervaring || []).map(d => d.toLowerCase());
      const candidateSectorenLower = (candidate.ervaring_sector || []).map(s => s.toLowerCase());
      const allCandidateExpRaw = [...candidateDoelgroepenLower, ...candidateSectorenLower];
      // CRITICAL FIX: Expand with aliases to match "NAH" → "niet-aangeboren hersenletsel"
      const allCandidateExp = expandExperienceWithAliases([
        ...(candidate.doelgroep_ervaring || []),
        ...(candidate.ervaring_sector || [])
      ]);
      
      for (const vereistExp of expert.vereiste_ervaring) {
        const vereistLower = vereistExp.toLowerCase();
        // Check both original and expanded experience
        if (allCandidateExp.some(e => e.includes(vereistLower) || vereistLower.includes(e))) {
          matchedErvaring.push(vereistExp);
        }
      }
      if (matchedErvaring.length > 0) {
        expertScore += Math.min(expert.match_criteria.ervaring_gewicht, matchedErvaring.length * 8);
      }
      
      // OPTIM 1: Match candidate specializations against expert methodieken
      for (const methodiek of expert.methodieken || []) {
        const methodiekLower = methodiek.toLowerCase();
        if (candidateSpecialisaties.some(s => s.includes(methodiekLower) || methodiekLower.includes(s))) {
          matchedMethodieken.push(methodiek);
        }
      }
      if (matchedMethodieken.length > 0) {
        expertScore += Math.min(expert.match_criteria.methodiek_gewicht || 10, matchedMethodieken.length * 5);
      }
      
      // Check for RELATED experience using cross-mapping matrix (if no direct match)
      if (matchedErvaring.length === 0) {
        const allExpStrings = [...(candidate.doelgroep_ervaring || []), ...(candidate.ervaring_sector || [])];
        const { hasRelated, relatedMatches } = hasRelatedExperience(allExpStrings, expert.specialisme);
        
        if (hasRelated) {
          relatedErvaring.push(...relatedMatches);
          const relatedCredit = Math.min(expert.match_criteria.ervaring_gewicht * 0.6, relatedMatches.length * 5);
          expertScore += relatedCredit;
        }
      }
      
      // OPTIM 4: Location-specific boost - 25% bonus for relevant experts
      if (isLocationRelevant && expertScore > 0) {
        expertScore = Math.round(expertScore * 1.25);
      }
      
      // OPTIM 5: Calculate confidence level (High/Medium/Low)
      const matchedCriteria = (matchedCerts.length > 0 ? 1 : 0) + 
                             (matchedErvaring.length > 0 || relatedErvaring.length > 0 ? 1 : 0) + 
                             (matchedMethodieken.length > 0 ? 1 : 0);
      const confidence: 'high' | 'medium' | 'low' = 
        matchedCriteria >= 2 ? 'high' : matchedCriteria === 1 ? 'medium' : 'low';
      
      // Generate advice
      const matchStatus = expertScore >= maxScore * 0.6 
        ? 'Kandidaat voldoet aan criteria.' 
        : expertScore >= maxScore * 0.3 
          ? 'Kandidaat heeft beperkte ervaring.' 
          : expertScore > 0
            ? 'Kandidaat heeft gerelateerde ervaring.'
            : 'Kandidaat mist relevante ervaring.';
      
      const advies = expert.uitleg_template 
        ? expert.uitleg_template.replace('{match_status}', matchStatus)
        : `${expert.expert_naam}: ${matchStatus}`;
      
      // Include related experience and methodieken in matched for display
      const allMatchedErvaring = [
        ...matchedErvaring, 
        ...relatedErvaring.map(e => `${e} (gerelateerd)`),
        ...matchedMethodieken.map(m => `${m} (specialisatie)`)
      ];
      
      expertAdvies.push({
        expert: expert.expert_naam,
        specialisme: expert.specialisme,
        score: expertScore,
        maxScore,
        advies,
        matchedCerts,
        matchedErvaring: allMatchedErvaring,
        // NEW: Additional data for UI optimizations
        isLocationRelevant,
        confidence,
        matchedMethodieken
      });
      
      // OPTIM 3: Proportionele bonus - 10% minimum threshold for any bonus
      const minThreshold = maxScore * 0.1; // 10% threshold
      const bonusForExpert = expertScore >= minThreshold 
        ? Math.max(1, Math.min(4, Math.round(expertScore / maxScore * 4)))
        : 0;
      expertBonus += bonusForExpert;
    }
    
    expertBonus = Math.min(12, expertBonus);
    hasExpertAdvies = expertAdvies.some(e => e.score > 0 || e.isLocationRelevant);
    
    if (hasExpertAdvies) {
      const relevantExperts = expertAdvies.filter(e => e.score > 0 || e.isLocationRelevant);
      reasoning.push(`🎓 Expert Advies: ${relevantExperts.length} specialist(en) geraadpleegd (+${expertBonus})`);
      details.expertAdvies = {
        score: expertBonus,
        match: expertBonus >= 2,
        reason: `${relevantExperts.length} specialist(en): ${relevantExperts.map(e => e.specialisme).join(', ')}`,
        expertCount: relevantExperts.length
      };
    }
  }

  // ===== TOTAL SCORE =====
  // CRITICAL FIX FASE 1: Base score normaliseert naar 100%, bonussen zijn EXTRA
  // Base components sum to 100 points MAX (not 92!)
  // Functie 25, Regio 20, Sector 20, Doelgroep 15, Beschrijving 15, Certificaat 10, 
  // Mobiliteit 10, Beschikbaarheid 5, Werkvorm 5 = 125 raw max → normalized to 100
  
  // Raw base score (max 125 from raw components)
  const rawBaseScore = 
    functieMatch +              // max 25
    regioMatch +                // max 20
    sectorMatch +               // max 20
    doelgroepMatch +            // max 15
    beschrijvingMatch +         // max 15
    certificaatVereistMatch +   // max 10
    mobiliteitMatch +           // max 10
    beschikbaarheidMatch +      // max 5
    werkvormMatch;              // max 5 = 125 total raw
  
  // FASE 1 FIX: Base normaliseert naar percentage van 100 (niet delen door 140!)
  const maxRawBase = 125;
  const basePercentage = Math.round((rawBaseScore / maxRawBase) * 100);

  // Bonus points zijn EXTRA bovenop base percentage
  const bonusPoints = 
    ervaringBonus +        // max +5
    leidinggevendeBonus +  // max +3  
    certificatenBonus +    // max +3
    dienstBonus +          // max +2
    trackRecordBonus +     // max +8
    expertBonus +          // max +12
    aiBoost;               // max +15 = 48 max bonus
  
  // IMPROVED: Verhoogde bonus impact voor betere score differentiatie (10-15%)
  // Bonussen nu 0.45x voor meer onderscheidend vermogen
  const bonusPercentage = Math.round(bonusPoints * 0.45); // 48 max * 0.45 = max +22%
  
  const totalScore = rawBaseScore + bonusPoints; // For backwards compat in return
  const normalizedScore = Math.min(100, basePercentage + bonusPercentage);

  // APPLE UI: Calculate category contributions for transparent UI
  // Geschiktheid = functie (25) + sector (20) + doelgroep (15) = max 60
  const geschiktheidPoints = functieMatch + sectorMatch + doelgroepMatch;
  const geschiktheidMax = 60;
  
  // Locatie = regio (20) + mobiliteit (10) = max 30
  const locatiePoints = regioMatch + mobiliteitMatch;
  const locatieMax = 30;
  
  // Ervaring = beschrijving (15) + certificaat (10) = max 25
  const ervaringPoints = beschrijvingMatch + certificaatVereistMatch;
  const ervaringMax = 25;
  
  // Praktisch = beschikbaarheid (5) + werkvorm (5) = max 10
  const praktischPoints = beschikbaarheidMatch + werkvormMatch;
  const praktischMax = 10;

  const categoryContributions = {
    geschiktheid: {
      points: geschiktheidPoints,
      max: geschiktheidMax,
      percentage: Math.round((geschiktheidPoints / geschiktheidMax) * 100)
    },
    locatie: {
      points: locatiePoints,
      max: locatieMax,
      percentage: Math.round((locatiePoints / locatieMax) * 100)
    },
    ervaring: {
      points: ervaringPoints,
      max: ervaringMax,
      percentage: Math.round((ervaringPoints / ervaringMax) * 100)
    },
    praktisch: {
      points: praktischPoints,
      max: praktischMax,
      percentage: Math.round((praktischPoints / praktischMax) * 100)
    }
  };

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
    klantVoorkeurBonus: 0, // Will be calculated when sublocation preferences are loaded
    totalScore,
    normalizedScore,
    categoryContributions,
    bonusTotal: bonusPoints,
    bonusPercentage,
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

// ============= BESCHIKBAARHEID PARSER =============

/**
 * Extended interface for parsed availability data
 */
export interface BeschikbaarheidUren {
  min: number;
  max: number;
  flexibel?: boolean;
  dagen_per_week?: number;
  opmerkingen?: string;
}

/**
 * Parse beschikbaarheid string naar gestructureerd formaat
 * Voorbeelden:
 * - "24-32 uur" → { min: 24, max: 32 }
 * - "Fulltime" → { min: 36, max: 40 }
 * - "Parttime 2-3 dagen" → { min: 16, max: 24, dagen_per_week: 3 }
 * - "16 uur per week" → { min: 16, max: 16 }
 */
export function parseBeschikbaarheid(beschikbaarheid: string | null | undefined): BeschikbaarheidUren | null {
  if (!beschikbaarheid || typeof beschikbaarheid !== 'string') {
    return null;
  }

  const input = beschikbaarheid.toLowerCase().trim();

  // Fulltime varianten
  if (input.includes('fulltime') || input.includes('full-time') || input.includes('voltijd')) {
    return { min: 36, max: 40, flexibel: false };
  }

  // Pattern: "24-32 uur" of "24 - 32 uur"
  const rangeMatch = input.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:uur|u)?/);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
      flexibel: input.includes('flexibel')
    };
  }

  // Pattern: "16 uur" of "16 uur per week"
  const singleMatch = input.match(/(\d+)\s*(?:uur|u)/);
  if (singleMatch) {
    const hours = parseInt(singleMatch[1], 10);
    return {
      min: hours,
      max: hours,
      flexibel: input.includes('flexibel')
    };
  }

  // Pattern: "2-3 dagen" of "3 dagen per week"
  const dagenMatch = input.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*dag(?:en)?/);
  if (dagenMatch) {
    const minDagen = parseInt(dagenMatch[1], 10);
    const maxDagen = dagenMatch[2] ? parseInt(dagenMatch[2], 10) : minDagen;
    // Assumptie: 8 uur per dag
    return {
      min: minDagen * 8,
      max: maxDagen * 8,
      dagen_per_week: maxDagen,
      flexibel: input.includes('flexibel')
    };
  }

  // Parttime varianten zonder specifiek
  if (input.includes('parttime') || input.includes('part-time') || input.includes('deeltijd')) {
    return { min: 16, max: 32, flexibel: true };
  }

  // Minimaal X uur
  const minMatch = input.match(/min(?:imaal)?\s*(\d+)\s*(?:uur|u)?/);
  if (minMatch) {
    const minHours = parseInt(minMatch[1], 10);
    return { min: minHours, max: 40, flexibel: true };
  }

  // Maximaal X uur
  const maxMatch = input.match(/max(?:imaal)?\s*(\d+)\s*(?:uur|u)?/);
  if (maxMatch) {
    const maxHours = parseInt(maxMatch[1], 10);
    return { min: 0, max: maxHours, flexibel: true };
  }

  // Fallback: bewaar als opmerking
  return {
    min: 0,
    max: 40,
    flexibel: true,
    opmerkingen: beschikbaarheid
  };
}

/**
 * Format beschikbaarheid JSON terug naar leesbare string
 */
export function formatBeschikbaarheid(uren: BeschikbaarheidUren | null): string {
  if (!uren) return 'Onbekend';

  if (uren.min === uren.max) {
    return `${uren.min} uur per week`;
  }

  if (uren.min >= 36 && uren.max >= 36) {
    return 'Fulltime';
  }

  return `${uren.min}-${uren.max} uur per week${uren.flexibel ? ' (flexibel)' : ''}`;
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
  
  // FIX 4: Postcode Enrichment - derive postcode from woonplaats if not present
  let postcode = getExtractedValue(data.postcode);
  const woonplaats = getExtractedValue(data.woonplaats) as string | null;
  
  if (!postcode && woonplaats) {
    // Try to derive postcode prefix from woonplaats
    postcode = derivePostcodeFromWoonplaats(woonplaats);
  }
  
  // Map extracted_data to MatchCandidate interface
  const candidate: MatchCandidate = {
    functie_niveau: getExtractedValue(data.functie_niveau),
    regio: getExtractedValue(data.regio) || woonplaats,
    woonplaats: woonplaats,
    postcode: postcode,
    provincie: deriveProvincieFromWoonplaats(woonplaats), // FIX: derive from woonplaats
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

// ============= FIX 1: ASYNC APPLICATION MATCHING WITH EXPERT KNOWLEDGE =============

/**
 * Calculate match score with expert knowledge loading
 * Use this when you need expert advice in the score breakdown
 */
export async function calculateApplicationMatchScoreWithExperts(
  application: ApplicationMatchSource,
  target: MatchTarget,
  aiBoostData?: { boost: number; reasons: string[]; usedPatternIds: string[] }
): Promise<MatchScoreBreakdown> {
  // Load expert knowledge into cache if not already loaded
  if (expertKnowledgeCache.length === 0) {
    await loadExpertKnowledge();
  }
  
  // Now calculate with expert knowledge available in cache
  return calculateApplicationMatchScore(application, target, aiBoostData);
}

/**
 * Pre-load expert knowledge cache
 * Call this once at app startup or before batch calculations
 */
export async function preloadExpertKnowledge(): Promise<number> {
  const experts = await loadExpertKnowledge();
  return experts.length;
}

// ============= FASE 3: MUST-HAVE / NICE-TO-HAVE FIT ANALYSE =============

/**
 * Requirement check result for HR-style fit analysis
 */
export interface RequirementCheck {
  requirement: string;
  met: boolean;
  evidence: string;
  source?: string;
  confidence?: number;
}

/**
 * Dealbreaker check - hard requirements that must be met
 */
export interface DealbreakCheck {
  check: string;
  passed: boolean;
  reason?: string;
  blocking: boolean;
}

/**
 * Complete Fit Analysis following HR specialist pattern
 * Provides structured decision support rather than just a score
 */
export interface FitAnalysis {
  // Requirements breakdown
  mustHaves: RequirementCheck[];
  niceToHaves: RequirementCheck[];
  dealbreakers: DealbreakCheck[];
  
  // Overall decision
  overallFit: 'proceed' | 'needs_info' | 'review_required' | 'reject';
  confidence: number; // 0-1
  
  // Decision reasoning
  recommendation: string;
  nextSteps: string[];
  
  // Underlying score for ranking
  matchScore: MatchScoreBreakdown;
}

/**
 * Analyze fit between candidate and target with HR-style must-have/nice-to-have breakdown
 * This provides decision support for recruiters, not just a numeric score
 */
export function analyzeFitWithEvidence(
  application: ApplicationMatchSource,
  target: MatchTarget,
  matchScore?: MatchScoreBreakdown
): FitAnalysis {
  // Calculate score if not provided
  const score = matchScore || calculateApplicationMatchScore(application, target);
  
  const mustHaves: RequirementCheck[] = [];
  const niceToHaves: RequirementCheck[] = [];
  const dealbreakers: DealbreakCheck[] = [];
  
  // ======= MUST-HAVES (Hard requirements) =======
  
  // 1. Functie niveau match
  const functieMatch = score.details.functie;
  mustHaves.push({
    requirement: 'Juiste functieniveau',
    met: functieMatch?.match ?? false,
    evidence: functieMatch?.reason || 'Geen functie informatie',
    confidence: functieMatch?.match ? 0.9 : 0.3
  });
  
  // 2. Regio/locatie bereikbaar
  const regioMatch = score.details.regio;
  mustHaves.push({
    requirement: 'Regio bereikbaar',
    met: regioMatch?.match ?? false,
    evidence: regioMatch?.reason || 'Geen locatie informatie',
    confidence: regioMatch?.matchType === 'exact' ? 0.95 : regioMatch?.matchType === 'province' ? 0.8 : 0.5
  });
  
  // 3. Relevante sector ervaring
  const sectorMatch = score.details.sector;
  const hasSectorMatch = (sectorMatch?.directMatches?.length || 0) > 0;
  mustHaves.push({
    requirement: 'Sector ervaring',
    met: hasSectorMatch,
    evidence: hasSectorMatch 
      ? `Match op: ${sectorMatch?.directMatches?.join(', ')}`
      : sectorMatch?.reason || 'Geen sector ervaring gevonden',
    confidence: hasSectorMatch ? 0.85 : 0.4
  });
  
  // ======= NICE-TO-HAVES (Preferred but not blocking) =======
  
  // 1. Doelgroep ervaring
  const doelgroepMatch = score.details.doelgroep;
  const hasDoelgroepMatch = (doelgroepMatch?.directMatches?.length || 0) > 0;
  niceToHaves.push({
    requirement: 'Doelgroep ervaring',
    met: hasDoelgroepMatch,
    evidence: hasDoelgroepMatch 
      ? `Ervaring met: ${doelgroepMatch?.directMatches?.join(', ')}`
      : doelgroepMatch?.reason || 'Geen specifieke doelgroep ervaring',
    confidence: hasDoelgroepMatch ? 0.8 : 0.5
  });
  
  // 2. Mobiliteit (eigen vervoer)
  const mobiliteitMatch = score.details.mobiliteit;
  niceToHaves.push({
    requirement: 'Mobiliteit/eigen vervoer',
    met: mobiliteitMatch?.match ?? false,
    evidence: mobiliteitMatch?.reason || 'Onbekend',
    confidence: 0.7
  });
  
  // 3. Beschikbaarheid
  const beschikbaarheidMatch = score.details.beschikbaarheid;
  niceToHaves.push({
    requirement: 'Beschikbaarheid passend',
    met: beschikbaarheidMatch?.match ?? false,
    evidence: beschikbaarheidMatch?.reason || 'Beschikbaarheid onbekend',
    confidence: 0.6
  });
  
  // 4. Werkvorm match (ZZP/Uitzend/etc)
  const werkvormMatch = score.details.werkvorm;
  niceToHaves.push({
    requirement: 'Werkvorm past',
    met: werkvormMatch?.match ?? false,
    evidence: werkvormMatch?.reason || 'Werkvorm onbekend',
    confidence: 0.7
  });
  
  // 5. Expert/specialisme match
  if (score.hasExpertAdvies && score.expertAdvies.length > 0) {
    const topExpert = score.expertAdvies[0];
    niceToHaves.push({
      requirement: `Specialisme: ${topExpert.specialisme}`,
      met: topExpert.score > 0,
      evidence: topExpert.advies,
      confidence: topExpert.confidence === 'high' ? 0.9 : topExpert.confidence === 'medium' ? 0.7 : 0.5
    });
  }
  
  // ======= DEALBREAKERS =======
  
  // 1. Functie niveau is echt kritiek
  dealbreakers.push({
    check: 'Functieniveau voldoende',
    passed: score.functieMatch >= 15, // Minimaal 60% van de 25 punten
    reason: score.functieMatch < 15 ? 'Functieniveau matcht niet voldoende' : undefined,
    blocking: true
  });
  
  // 2. Totale score minimaal acceptabel
  dealbreakers.push({
    check: 'Minimale match score',
    passed: score.normalizedScore >= 40,
    reason: score.normalizedScore < 40 ? `Score ${score.normalizedScore}% is te laag voor plaatsing` : undefined,
    blocking: true
  });
  
  // ======= OVERALL FIT DECISION =======
  
  const mustHavesMet = mustHaves.filter(m => m.met).length;
  const mustHavesTotal = mustHaves.length;
  const mustHavePercentage = mustHavesTotal > 0 ? mustHavesMet / mustHavesTotal : 0;
  
  const niceToHavesMet = niceToHaves.filter(n => n.met).length;
  const niceToHavesTotal = niceToHaves.length;
  
  const dealbreakersBlocking = dealbreakers.filter(d => !d.passed && d.blocking);
  
  // Calculate confidence
  const avgMustHaveConfidence = mustHaves.reduce((sum, m) => sum + (m.confidence || 0.5), 0) / mustHaves.length;
  const avgNiceToHaveConfidence = niceToHaves.reduce((sum, n) => sum + (n.confidence || 0.5), 0) / niceToHaves.length;
  const confidence = (avgMustHaveConfidence * 0.7) + (avgNiceToHaveConfidence * 0.3);
  
  // Determine overall fit
  let overallFit: FitAnalysis['overallFit'];
  let recommendation: string;
  let nextSteps: string[] = [];
  
  if (dealbreakersBlocking.length > 0) {
    overallFit = 'reject';
    recommendation = `Afwijzen: ${dealbreakersBlocking.map(d => d.reason).join(', ')}`;
    nextSteps = ['Kandidaat informeren over mismatch', 'Eventueel talentpool overweegen'];
  } else if (mustHavePercentage < 0.5) {
    overallFit = 'review_required';
    recommendation = `Human review nodig: slechts ${mustHavesMet}/${mustHavesTotal} must-haves voldaan`;
    nextSteps = ['Handmatige beoordeling door recruiter', 'Verificatie van ontbrekende informatie'];
  } else if (mustHavePercentage < 0.75 || confidence < 0.6) {
    overallFit = 'needs_info';
    recommendation = `Meer informatie nodig: ${mustHaves.filter(m => !m.met).map(m => m.requirement).join(', ')}`;
    nextSteps = ['Gerichte uitvraag naar ontbrekende informatie', 'CV verificatie'];
  } else {
    overallFit = 'proceed';
    recommendation = `Geschikt: ${mustHavesMet}/${mustHavesTotal} must-haves + ${niceToHavesMet}/${niceToHavesTotal} nice-to-haves`;
    nextSteps = ['Voorstellen aan klant', 'Interview inplannen'];
  }
  
  return {
    mustHaves,
    niceToHaves,
    dealbreakers,
    overallFit,
    confidence,
    recommendation,
    nextSteps,
    matchScore: score
  };
}

/**
 * Async version with expert knowledge preloading
 */
export async function analyzeFitWithEvidenceAsync(
  application: ApplicationMatchSource,
  target: MatchTarget
): Promise<FitAnalysis> {
  // Ensure expert knowledge is loaded
  await preloadExpertKnowledge();
  
  // Calculate score with experts
  const score = await calculateApplicationMatchScoreWithExperts(application, target);
  
  return analyzeFitWithEvidence(application, target, score);
}
