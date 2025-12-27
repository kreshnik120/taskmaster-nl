/**
 * Healthcare Mappings - Single Source of Truth
 * 
 * Centralizes all healthcare-specific mappings used across edge functions:
 * - functie_niveau normalization
 * - Organization detection
 * - Werkvorm validation
 */

// ============================================
// ORGANIZATION IDs
// ============================================
export const ORG_IDS = {
  ABCZORG: '550e8400-e29b-41d4-a716-446655440000',
  CITOZORG: '650e8400-e29b-41d4-a716-446655440001',
} as const;

// ============================================
// FUNCTIE NIVEAU MAPPING
// ============================================

/**
 * Normalizes various representations of functie_niveau to exact database values.
 * The database constraint only accepts: VIG, VP3, VP4, HBO-V, Helpende 2
 */
const FUNCTIE_NIVEAU_MAP: Record<string, string> = {
  // VIG variations
  "verzorgende ig": "VIG",
  "verzorgende IG": "VIG",
  "vig": "VIG",
  "v.i.g": "VIG",
  "v.i.g.": "VIG",
  
  // VP3 variations
  "verzorgende niveau 3": "VP3",
  "verzorgende 3": "VP3",
  "vp3": "VP3",
  "niveau 3": "VP3",
  
  // VP4 variations  
  "verzorgende niveau 4": "VP4",
  "verzorgende 4": "VP4",
  "vp4": "VP4",
  "niveau 4": "VP4",
  
  // HBO-V variations
  "hbo verpleegkundige": "HBO-V",
  "hbo-v": "HBO-V",
  "hbov": "HBO-V",
  "hbo v": "HBO-V",
  "verpleegkundige hbo": "HBO-V",
  
  // Helpende 2 variations
  "helpende": "Helpende 2",
  "helpende 2": "Helpende 2",
  "helpende niveau 2": "Helpende 2",
  "helpende plus": "Helpende 2",
  
  // MBO variations (map to VP4)
  "verpleegkundige mbo": "VP4",
  "mbo verpleegkundige": "VP4",
  
  // Begeleider variations (keep as-is, expanded constraint)
  "begeleider": "Begeleider",
  "persoonlijk begeleider": "Persoonlijk begeleider",
  "ggz-agoog": "GGZ-agoog",
  "ggz agoog": "GGZ-agoog",
};

/**
 * Valid functie_niveau values that the database accepts
 */
export const VALID_FUNCTIE_NIVEAUS = [
  'VIG',
  'VP3', 
  'VP4',
  'HBO-V',
  'Helpende 2',
  'Verpleegkundige MBO',
  'Begeleider',
  'Persoonlijk begeleider',
  'GGZ-agoog',
] as const;

/**
 * Normalizes a functie_niveau value to the exact database format.
 * Returns the original value if no mapping found.
 */
export function normalizeFunctieNiveau(input: string | null | undefined): string | null {
  if (!input) return null;
  
  const normalized = input.toLowerCase().trim();
  
  // Direct mapping
  if (FUNCTIE_NIVEAU_MAP[normalized]) {
    return FUNCTIE_NIVEAU_MAP[normalized];
  }
  
  // Check if it's already a valid value
  if (VALID_FUNCTIE_NIVEAUS.includes(input as any)) {
    return input;
  }
  
  // Return original if no mapping found
  return input;
}

// ============================================
// WERKVORM MAPPING
// ============================================

/**
 * Valid werkvorm values
 */
export const VALID_WERKVORMEN = ['ZZP', 'Uitzendkracht', 'ABCito constructie'] as const;

const WERKVORM_MAP: Record<string, string> = {
  'zzp': 'ZZP',
  'zzper': 'ZZP',
  'zzp\'er': 'ZZP',
  'freelance': 'ZZP',
  'freelancer': 'ZZP',
  'zelfstandig': 'ZZP',
  'uitzend': 'Uitzendkracht',
  'uitzendkracht': 'Uitzendkracht',
  'uitzendwerk': 'Uitzendkracht',
  'payroll': 'Uitzendkracht',
  'abcito': 'ABCito constructie',
  'abcito constructie': 'ABCito constructie',
  'abc constructie': 'ABCito constructie',
};

/**
 * Normalizes werkvorm to valid database value
 */
export function normalizeWerkvorm(input: string | null | undefined): string | null {
  if (!input) return null;
  
  const normalized = input.toLowerCase().trim();
  
  if (WERKVORM_MAP[normalized]) {
    return WERKVORM_MAP[normalized];
  }
  
  if (VALID_WERKVORMEN.includes(input as any)) {
    return input;
  }
  
  return input;
}

// ============================================
// ORGANIZATION DETECTION
// ============================================

export interface OrganizationInfo {
  id: string;
  name: string;
  displayName: string;
  domain: string;
  emailFrom: string;
  replyTo: string;
  color: string;
}

const ORGANIZATION_CONFIG: Record<string, OrganizationInfo> = {
  abczorg: {
    id: ORG_IDS.ABCZORG,
    name: 'abczorg',
    displayName: 'ABCzorg',
    domain: 'abczorg.nl',
    emailFrom: 'personeel@citozorg.nl', // Verified sending domain (citozorg.nl tot abczorg.nl verified is)
    replyTo: 'recruitment@inbound.citozorg.nl', // Permanent inbound domain - verified
    color: '#0070f3',
  },
  citozorg: {
    id: ORG_IDS.CITOZORG,
    name: 'citozorg',
    displayName: 'CitoZorg',
    domain: 'citozorg.nl',
    emailFrom: 'personeel@citozorg.nl', // Verified sending domain
    replyTo: 'recruitment@inbound.citozorg.nl', // Permanent inbound domain - verified
    color: '#667eea',
  },
};

/**
 * Gets organization info by org_id
 */
export function getOrganizationById(orgId: string | null | undefined): OrganizationInfo {
  if (orgId === ORG_IDS.ABCZORG) {
    return ORGANIZATION_CONFIG.abczorg;
  }
  // Default to CitoZorg
  return ORGANIZATION_CONFIG.citozorg;
}

/**
 * Gets organization info by name
 */
export function getOrganizationByName(name: string | null | undefined): OrganizationInfo {
  if (!name) return ORGANIZATION_CONFIG.citozorg;
  
  const normalized = name.toLowerCase().trim();
  
  if (normalized.includes('abc')) {
    return ORGANIZATION_CONFIG.abczorg;
  }
  
  return ORGANIZATION_CONFIG.citozorg;
}

/**
 * Detects organization from email domain
 */
export function detectOrganizationFromEmail(email: string | null | undefined): OrganizationInfo {
  if (!email) return ORGANIZATION_CONFIG.citozorg;
  
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (domain?.includes('abczorg')) {
    return ORGANIZATION_CONFIG.abczorg;
  }
  
  return ORGANIZATION_CONFIG.citozorg;
}

// ============================================
// EMAIL CONFIGURATION
// ============================================

export interface EmailConfig {
  from: string;
  name: string;
  replyTo: string;
}

/**
 * Gets email configuration for an organization
 */
export function getEmailConfig(orgId: string | null | undefined): EmailConfig {
  const org = getOrganizationById(orgId);
  
  return {
    from: org.emailFrom,
    name: `${org.displayName} Recruitment`,
    replyTo: org.replyTo,
  };
}

// ============================================
// PLACEHOLDER DETECTION
// ============================================

const PLACEHOLDER_PHONE_PATTERNS = [
  /^06[-\s]?0{6,}$/,              // 06-00000000
  /^06[-\s]?1234567[89]?$/,       // 06-12345678
  /^000/,                          // starts with 000
  /^06[-\s]?9{6,}$/,              // 06-99999999
  /^(\d)\1{7,}$/,                  // all same digit
  /^0612345/,                      // test pattern
];

/**
 * Detects if a phone number is a placeholder/test value
 */
export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  
  const cleaned = phone.replace(/[\s-]/g, '');
  return PLACEHOLDER_PHONE_PATTERNS.some(p => p.test(phone) || p.test(cleaned));
}

/**
 * Cleans and validates phone number, returns null if placeholder
 */
export function cleanPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (isPlaceholderPhone(phone)) return null;
  
  // Basic cleanup
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 10) return null;
  
  return phone.trim();
}

// ============================================
// APPLICATION HELPERS
// ============================================

/**
 * Maximum number of follow-up emails before stopping
 */
export const MAX_FOLLOWUP_EMAILS = 5;

/**
 * Cooldown period between follow-ups in hours
 */
export const FOLLOWUP_COOLDOWN_HOURS = 24;

/**
 * Critical fields that determine application completeness
 */
export const CRITICAL_FIELDS = [
  'functie_niveau',
  'werkvorm', 
  'regio',
  'beschikbaarheid',
  'telefoonnummer',
  'diploma'
] as const;

/**
 * All goal types related to application intake
 */
export const APPLICATION_GOAL_TYPES = [
  'send_welcome_and_intake',
  'application_intake_completion',
  'send_reply_response',
  'request_documents'
] as const;

/**
 * Active goal statuses that indicate work in progress
 */
export const ACTIVE_GOAL_STATUSES = [
  'pending',
  'planning', 
  'executing',
  'in_progress'
] as const;

/**
 * Recalculates missing_info based on extracted_data
 */
export function recalculateMissingInfo(
  extractedData: Record<string, unknown> | null
): string[] {
  if (!extractedData) return [...CRITICAL_FIELDS];
  
  return CRITICAL_FIELDS.filter(field => {
    const value = extractedData[field];
    // Field is missing if null, undefined, empty string, or placeholder
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'string' && isPlaceholderPhone(value)) return true;
    return false;
  });
}

/**
 * Pipeline stage progression map
 */
export const PIPELINE_STAGE_PROGRESSION: Record<string, string> = {
  'nieuw': 'screening',
  'screening': 'interview',
  'interview': 'goedgekeurd',
  'goedgekeurd': 'geplaatst'
} as const;

/**
 * Gets the next pipeline stage
 */
export function getNextPipelineStage(currentStage: string): string | null {
  return PIPELINE_STAGE_PROGRESSION[currentStage] || null;
}
