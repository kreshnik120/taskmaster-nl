/**
 * Client Preferences Service
 * 
 * Handles loading and matching client-specific expert preferences for healthcare recruitment.
 * Extracts werkstijlen from descriptions and calculates comorbidity bonuses.
 */

import { supabase } from "@/integrations/supabase/client";

// ============= INTERFACES =============

export interface ClientExpertPreference {
  id: string;
  sublocation_id: string | null;
  organization_id: string | null;
  preferred_werkstijlen: string[];
  required_specialismen: string[];
  preferred_certificaten: string[];
  min_jaren_ervaring: number | null;
  voorkeur_werkvorm: string | null;
  notes: string | null;
}

export interface WerkstijlMatch {
  matched: string[];
  total: number;
  score: number;
  maxScore: number;
}

export interface ComorbidityMatch {
  detected: string[];
  matched: string[];
  matchRatio: number;
  bonus: number;
}

export interface ClientPreferenceMatchResult {
  werkstijlMatch: WerkstijlMatch;
  comorbidityMatch: ComorbidityMatch;
  certificaatMatch: { matched: string[]; missing: string[] };
  ervaringMatch: boolean;
  werkvormMatch: boolean;
  totalBonus: number;
  maxBonus: number;
  reasons: string[];
}

// ============= WERKSTIJL KEYWORDS =============

export const WERKSTIJL_KEYWORDS: Record<string, string[]> = {
  'Relatiegericht werken': [
    'relatiegericht', 'relatie opbouwen', 'vertrouwensband', 'aansluiting zoeken',
    'warme benadering', 'persoonlijke aandacht', 'nabijheid', 'betrokken'
  ],
  'Contextgericht werken': [
    'contextgericht', 'systemisch', 'gezinssysteem', 'netwerk betrekken',
    'omgeving meenemen', 'sociale context', 'systeembenadering'
  ],
  'Structuur bieden': [
    'structuur', 'grenzen stellen', 'kaders', 'duidelijkheid', 'voorspelbaarheid',
    'routine', 'consequent', 'grenzen aangeven', 'structurerend'
  ],
  'Proactieve communicatie': [
    'proactief', 'initiatief', 'signaleren', 'vroegtijdig', 'preventief',
    'vooruitdenken', 'anticiperen', 'alert'
  ],
  'Trauma-sensitief werken': [
    'trauma', 'traumasensitief', 'veiligheid', 'stabilisatie', 'ptss',
    'traumaverwerking', 'traumabewust', 'herstelgericht'
  ],
  'Outreachend werken': [
    'outreachend', 'bemoeizorg', 'actief benaderen', 'naar buiten treden',
    'huisbezoek', 'mobiel', 'wijkgericht'
  ],
  'Oplossingsgerichte benadering': [
    'oplossingsgericht', 'krachtgericht', 'mogelijkheden', 'doelgericht',
    'positieve benadering', 'wat wel kan', 'sterke kanten'
  ],
  'Psycho-educatie': [
    'psycho-educatie', 'voorlichting', 'uitleg geven', 'kennisoverdracht',
    'educatie', 'informeren', 'bewustwording'
  ],
};

// ============= SPECIALISME KEYWORDS FOR COMORBIDITY =============

const SPECIALISME_KEYWORDS: Record<string, string[]> = {
  'LVB': ['lvb', 'licht verstandelijk', 'zwakbegaafd', 'verstandelijke beperking'],
  'ASS': ['ass', 'autisme', 'autistisch', 'spectrum', 'autismespectrumstoornis'],
  'NAH': ['nah', 'hersenletsel', 'niet-aangeboren', 'cva', 'hersenbeschadiging'],
  'ADHD': ['adhd', 'aandachtsstoornis', 'hyperactief', 'concentratieproblemen'],
  'Gedrag': ['gedrag', 'agressie', 'grensoverschrijdend', 'probleemgedrag', 'weerstand'],
  'PTSS': ['ptss', 'trauma', 'posttraumatisch', 'traumagerelateerd'],
  'Verslaving': ['verslaving', 'middelengebruik', 'alcohol', 'drugs', 'afhankelijkheid'],
  'Epilepsie': ['epilepsie', 'aanval', 'insult', 'toeval'],
  'Dementie': ['dementie', 'alzheimer', 'geheugenproblemen', 'cognitieve achteruitgang'],
  'Depressie': ['depressie', 'depressief', 'somberheid', 'stemmingsstoornis'],
  'Angst': ['angst', 'angststoornis', 'paniek', 'fobisch'],
  'Schizofrenie': ['schizofrenie', 'psychose', 'psychotisch', 'waan'],
  'Borderline': ['borderline', 'persoonlijkheidsstoornis', 'bps', 'emotieregulatie'],
};

// ============= CACHE =============

let preferencesCache: Map<string, ClientExpertPreference> = new Map();
let cacheLoaded = false;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============= LOAD FUNCTIONS =============

export async function loadClientPreferences(orgId?: string): Promise<ClientExpertPreference[]> {
  const now = Date.now();
  
  // Return cache if still valid
  if (cacheLoaded && (now - cacheTimestamp) < CACHE_TTL && preferencesCache.size > 0) {
    return Array.from(preferencesCache.values());
  }

  try {
    let query = supabase
      .from('client_expert_preferences')
      .select('*');
    
    // Note: org_id filter not available on this table, filter by organization_id if needed
    
    const { data, error } = await query;

    if (error) {
      console.error('[loadClientPreferences] Error:', error);
      return [];
    }

    preferencesCache.clear();
    
    for (const row of data || []) {
      const pref: ClientExpertPreference = {
        id: row.id,
        sublocation_id: row.sublocation_id,
        organization_id: row.organization_id,
        preferred_werkstijlen: row.preferred_werkstijlen || [],
        required_specialismen: row.required_specialismen || [],
        preferred_certificaten: row.preferred_certificaten || [],
        min_jaren_ervaring: row.min_jaren_ervaring,
        voorkeur_werkvorm: row.voorkeur_werkvorm,
        notes: row.notes,
      };
      
      // Cache by sublocation_id for quick lookup
      if (pref.sublocation_id) {
        preferencesCache.set(pref.sublocation_id, pref);
      }
    }

    cacheLoaded = true;
    cacheTimestamp = now;
    
    console.log(`[loadClientPreferences] Loaded ${preferencesCache.size} preferences`);
    return Array.from(preferencesCache.values());
  } catch (err) {
    console.error('[loadClientPreferences] Error:', err);
    return [];
  }
}

export function getPreferencesForSublocation(sublocationId: string): ClientExpertPreference | null {
  return preferencesCache.get(sublocationId) || null;
}

export function clearPreferencesCache(): void {
  preferencesCache.clear();
  cacheLoaded = false;
  cacheTimestamp = 0;
}

// ============= WERKSTIJL EXTRACTION =============

/**
 * Extract werkstijlen from a description text (e.g., publieke_opmerking)
 */
export function extractWerkstijlen(description: string | null): string[] {
  if (!description) return [];
  
  const descLower = description.toLowerCase();
  const detected: string[] = [];
  
  for (const [werkstijl, keywords] of Object.entries(WERKSTIJL_KEYWORDS)) {
    if (keywords.some(kw => descLower.includes(kw.toLowerCase()))) {
      detected.push(werkstijl);
    }
  }
  
  return detected;
}

/**
 * Calculate werkstijl match between candidate and requirements
 */
export function calculateWerkstijlMatch(
  candidateWerkstijlen: string[],
  requiredWerkstijlen: string[]
): WerkstijlMatch {
  if (requiredWerkstijlen.length === 0) {
    return { matched: [], total: 0, score: 0, maxScore: 0 };
  }

  const candidateLower = candidateWerkstijlen.map(w => w.toLowerCase());
  const matched: string[] = [];
  
  for (const required of requiredWerkstijlen) {
    if (candidateLower.includes(required.toLowerCase())) {
      matched.push(required);
    }
  }
  
  const maxScore = Math.min(requiredWerkstijlen.length * 2, 6); // Max 6 points
  const score = Math.round((matched.length / requiredWerkstijlen.length) * maxScore);
  
  return {
    matched,
    total: requiredWerkstijlen.length,
    score,
    maxScore
  };
}

// ============= COMORBIDITY DETECTION & MATCHING =============

/**
 * Detect specialisms from description text
 */
export function detectSpecialismen(description: string | null): string[] {
  if (!description) return [];
  
  const descLower = description.toLowerCase();
  const detected: string[] = [];
  
  for (const [specialisme, keywords] of Object.entries(SPECIALISME_KEYWORDS)) {
    if (keywords.some(kw => descLower.includes(kw))) {
      detected.push(specialisme);
    }
  }
  
  return detected;
}

/**
 * Count how many specialisms the candidate matches
 */
export function countComorbidityMatches(
  candidateSpecialismen: string[],
  requiredSpecialismen: string[]
): ComorbidityMatch {
  if (requiredSpecialismen.length === 0) {
    return { detected: [], matched: [], matchRatio: 0, bonus: 0 };
  }

  const candidateLower = candidateSpecialismen.map(s => s.toLowerCase());
  const matched: string[] = [];
  
  for (const required of requiredSpecialismen) {
    const reqLower = required.toLowerCase();
    
    // Direct match
    if (candidateLower.includes(reqLower)) {
      matched.push(required);
      continue;
    }
    
    // Check aliases
    const aliases = SPECIALISME_KEYWORDS[required];
    if (aliases && candidateLower.some(c => aliases.some(a => c.includes(a) || a.includes(c)))) {
      matched.push(required);
    }
  }
  
  const matchRatio = matched.length / requiredSpecialismen.length;
  
  // Bonus calculation: proportional to match ratio
  // 3/3 = +10, 2/3 = +6, 1/3 = +3
  let bonus = 0;
  if (matchRatio === 1) {
    bonus = 10;
  } else if (matchRatio >= 0.66) {
    bonus = 6;
  } else if (matchRatio >= 0.33) {
    bonus = 3;
  }
  
  return {
    detected: requiredSpecialismen,
    matched,
    matchRatio,
    bonus
  };
}

// ============= FULL PREFERENCE MATCHING =============

/**
 * Calculate full client preference match for a candidate
 */
export function calculateClientPreferenceMatch(
  candidate: {
    specialisaties?: string[] | null;
    certificaten?: string[] | null;
    jaren_ervaring?: number | null;
    werkvorm?: string | null;
    werkstijlen?: string[] | null;
  },
  preferences: ClientExpertPreference,
  sublocationDescription?: string | null
): ClientPreferenceMatchResult {
  const reasons: string[] = [];
  let totalBonus = 0;
  const maxBonus = 20; // Max bonus from client preferences
  
  // 1. Werkstijl matching
  const candidateWerkstijlen = candidate.werkstijlen || [];
  const descriptionWerkstijlen = extractWerkstijlen(sublocationDescription);
  const allRequiredWerkstijlen = [...new Set([
    ...preferences.preferred_werkstijlen,
    ...descriptionWerkstijlen
  ])];
  
  const werkstijlMatch = calculateWerkstijlMatch(candidateWerkstijlen, allRequiredWerkstijlen);
  totalBonus += werkstijlMatch.score;
  
  if (werkstijlMatch.matched.length > 0) {
    reasons.push(`Werkstijl match: ${werkstijlMatch.matched.join(', ')}`);
  }
  
  // 2. Comorbidity/Specialisme matching
  const candidateSpecialismen = candidate.specialisaties || [];
  const descriptionSpecialismen = detectSpecialismen(sublocationDescription);
  const allRequiredSpecialismen = [...new Set([
    ...preferences.required_specialismen,
    ...descriptionSpecialismen
  ])];
  
  const comorbidityMatch = countComorbidityMatches(candidateSpecialismen, allRequiredSpecialismen);
  totalBonus += comorbidityMatch.bonus;
  
  if (comorbidityMatch.matched.length > 0) {
    reasons.push(`Specialisme match: ${comorbidityMatch.matched.join(', ')} (${comorbidityMatch.matched.length}/${comorbidityMatch.detected.length})`);
  }
  
  // 3. Certificaat matching
  const candidateCerts = (candidate.certificaten || []).map(c => c.toLowerCase());
  const requiredCerts = preferences.preferred_certificaten || [];
  const matchedCerts = requiredCerts.filter(c => candidateCerts.includes(c.toLowerCase()));
  const missingCerts = requiredCerts.filter(c => !candidateCerts.includes(c.toLowerCase()));
  
  if (matchedCerts.length > 0) {
    totalBonus += Math.min(matchedCerts.length, 2); // Max 2 points for certs
    reasons.push(`Certificaten: ${matchedCerts.join(', ')}`);
  }
  
  // 4. Ervaring matching
  const ervaringMatch = preferences.min_jaren_ervaring === null || 
    (candidate.jaren_ervaring !== null && candidate.jaren_ervaring >= preferences.min_jaren_ervaring);
  
  if (ervaringMatch && preferences.min_jaren_ervaring !== null) {
    totalBonus += 1;
    reasons.push(`Voldoende ervaring (${candidate.jaren_ervaring || 0}+ jaar)`);
  }
  
  // 5. Werkvorm matching
  const werkvormMatch = !preferences.voorkeur_werkvorm || 
    candidate.werkvorm?.toLowerCase() === preferences.voorkeur_werkvorm?.toLowerCase();
  
  if (werkvormMatch && preferences.voorkeur_werkvorm) {
    totalBonus += 1;
    reasons.push(`Werkvorm match: ${preferences.voorkeur_werkvorm}`);
  }
  
  return {
    werkstijlMatch,
    comorbidityMatch,
    certificaatMatch: { matched: matchedCerts, missing: missingCerts },
    ervaringMatch,
    werkvormMatch,
    totalBonus: Math.min(totalBonus, maxBonus),
    maxBonus,
    reasons
  };
}

// ============= DATABASE OPERATIONS =============

export async function upsertClientPreferences(
  sublocationId: string,
  preferences: Partial<ClientExpertPreference>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if exists
    const existing = preferencesCache.get(sublocationId);
    
    if (existing) {
      // Update
      const { error } = await supabase
        .from('client_expert_preferences')
        .update({
          preferred_werkstijlen: preferences.preferred_werkstijlen,
          required_specialismen: preferences.required_specialismen,
          preferred_certificaten: preferences.preferred_certificaten,
          min_jaren_ervaring: preferences.min_jaren_ervaring,
          voorkeur_werkvorm: preferences.voorkeur_werkvorm,
          notes: preferences.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      
      if (error) throw error;
    } else {
      // Insert
      const { error } = await supabase
        .from('client_expert_preferences')
        .insert({
          sublocation_id: sublocationId,
          preferred_werkstijlen: preferences.preferred_werkstijlen || [],
          required_specialismen: preferences.required_specialismen || [],
          preferred_certificaten: preferences.preferred_certificaten || [],
          min_jaren_ervaring: preferences.min_jaren_ervaring,
          voorkeur_werkvorm: preferences.voorkeur_werkvorm,
          notes: preferences.notes,
        });
      
      if (error) throw error;
    }
    
    // Clear cache to force reload
    clearPreferencesCache();
    
    return { success: true };
  } catch (err: any) {
    console.error('[upsertClientPreferences] Error:', err);
    return { success: false, error: err.message };
  }
}
