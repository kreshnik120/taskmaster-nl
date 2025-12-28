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
 * NOTE: naam and email are essential for identification
 */
export const CRITICAL_FIELDS = [
  'naam',           // Essential: candidate identification
  'email',          // Essential: contact & matching
  'functie_niveau',
  'werkvorm', 
  'regio',
  'beschikbaarheid',
  'telefoonnummer',
  'diploma'
] as const;

/**
 * Field aliases for consistent checking across different data formats
 * Maps canonical field names to their common aliases in extracted_data
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  'naam': ['naam', 'full_name', 'name'],
  'email': ['email', 'email_from', 'e-mail'],
  'telefoonnummer': ['telefoonnummer', 'phone', 'telefoon', 'tel'],
  'diploma': ['diploma', 'diploma_type', 'opleiding'],
  'regio': ['regio', 'woonplaats', 'stad', 'plaats'],
  'beschikbaarheid': ['beschikbaarheid', 'availability', 'uren_per_week'],
} as const;

/**
 * Checks if a field has a valid value, using aliases and placeholder detection
 * @param data - The extracted_data object to check
 * @param field - The canonical field name to check
 * @returns true if field has a valid (non-placeholder) value
 */
export function hasField(
  data: Record<string, unknown>, 
  field: string
): boolean {
  const aliasesToCheck = FIELD_ALIASES[field] || [field];
  
  for (const alias of aliasesToCheck) {
    const value = data[alias];
    if (value === null || value === undefined || value === '') continue;
    
    // Special case: telefoonnummer must not be placeholder
    if (field === 'telefoonnummer' && typeof value === 'string') {
      if (isPlaceholderPhone(value)) continue;
    }
    
    return true; // Valid value found
  }
  
  return false;
}

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
 * Recalculates missing_info based on extracted_data using aliases and placeholder detection
 */
export function recalculateMissingInfo(
  extractedData: Record<string, unknown> | null
): string[] {
  if (!extractedData) return [...CRITICAL_FIELDS];
  
  return CRITICAL_FIELDS.filter(field => !hasField(extractedData, field));
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

// ============================================
// DOCUMENT VALIDATION HELPERS
// ============================================

/**
 * PDF magic bytes signature
 */
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * Validates if content is a valid PDF by checking magic bytes
 */
export function isValidPdf(content: Uint8Array): boolean {
  if (content.length < 4) return false;
  
  return content[0] === PDF_MAGIC_BYTES[0] &&
         content[1] === PDF_MAGIC_BYTES[1] &&
         content[2] === PDF_MAGIC_BYTES[2] &&
         content[3] === PDF_MAGIC_BYTES[3];
}

/**
 * VOG required keywords that must appear in a valid VOG document
 */
const VOG_REQUIRED_KEYWORDS = [
  'verklaring omtrent het gedrag',
  'vog',
  'ministerie',
  'justitie',
  'justis',
  'screeningsautoriteit',
];

/**
 * VOG optional keywords that increase confidence
 */
const VOG_OPTIONAL_KEYWORDS = [
  'geen bezwaar',
  'afgegeven',
  'aanvraagnummer',
  'functieomschrijving',
];

/**
 * Validates if text content appears to be from a VOG document
 * Returns a score 0-100 indicating confidence
 */
export function validateVogContent(textContent: string): {
  isValid: boolean;
  score: number;
  foundKeywords: string[];
  missingRequired: string[];
} {
  const lowerText = textContent.toLowerCase();
  const foundKeywords: string[] = [];
  const missingRequired: string[] = [];
  
  // Check required keywords
  let requiredScore = 0;
  for (const keyword of VOG_REQUIRED_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      foundKeywords.push(keyword);
      requiredScore += 20; // Each required keyword = 20 points
    } else {
      missingRequired.push(keyword);
    }
  }
  
  // Check optional keywords
  let optionalScore = 0;
  for (const keyword of VOG_OPTIONAL_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      foundKeywords.push(keyword);
      optionalScore += 5; // Each optional keyword = 5 points
    }
  }
  
  // Cap at 100
  const score = Math.min(100, requiredScore + optionalScore);
  
  // Valid if score >= 40 (at least 2 required keywords)
  const isValid = score >= 40;
  
  return { isValid, score, foundKeywords, missingRequired };
}

/**
 * Diploma required keywords
 */
const DIPLOMA_KEYWORDS = [
  'diploma',
  'getuigschrift', 
  'certificaat',
  'mbo',
  'hbo',
  'opleiding',
  'geslaagd',
  'examen',
  'kwalificatie',
];

/**
 * Healthcare-specific diploma keywords
 */
const HEALTHCARE_DIPLOMA_KEYWORDS = [
  'verpleegkund',
  'verzorgend',
  'helpende',
  'zorg',
  'ggz',
  'gehandicaptenzorg',
  'welzijn',
  'maatschappelijk',
];

/**
 * Validates if text content appears to be from a diploma document
 */
export function validateDiplomaContent(textContent: string): {
  isValid: boolean;
  score: number;
  foundKeywords: string[];
  isHealthcareRelated: boolean;
} {
  const lowerText = textContent.toLowerCase();
  const foundKeywords: string[] = [];
  let isHealthcareRelated = false;
  
  // Check diploma keywords
  let diplomaScore = 0;
  for (const keyword of DIPLOMA_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      foundKeywords.push(keyword);
      diplomaScore += 15;
    }
  }
  
  // Check healthcare keywords
  for (const keyword of HEALTHCARE_DIPLOMA_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      foundKeywords.push(keyword);
      diplomaScore += 10;
      isHealthcareRelated = true;
    }
  }
  
  const score = Math.min(100, diplomaScore);
  const isValid = score >= 30;
  
  return { isValid, score, foundKeywords, isHealthcareRelated };
}

/**
 * Calculates SHA256 hash of content for duplicate detection
 */
export async function calculateContentHash(content: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(content).buffer as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Document validation result interface
 */
export interface DocumentValidationResult {
  isValidFormat: boolean;
  formatError?: string;
  contentValidation?: {
    isValid: boolean;
    score: number;
    foundKeywords: string[];
    warnings: string[];
  };
  isDuplicate: boolean;
  duplicateOf?: {
    applicationId: string;
    filename: string;
    uploadedAt: string;
  };
  contentHash?: string;
  validationFlags: string[];
  requiresManualReview: boolean;
}

/**
 * Placeholder email patterns (expanded from phone)
 */
const PLACEHOLDER_EMAIL_PATTERNS = [
  /^test@/i,
  /^example@/i,
  /^noreply@/i,
  /^no-reply@/i,
  /^nobody@/i,
  /^null@/i,
  /^fake@/i,
  /@example\.(com|org|net)$/i,
  /@test\.(com|org|net)$/i,
  /^user@/i,
  /^admin@admin/i,
  /^info@info/i,
];

/**
 * Detects if an email is a placeholder/test value
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  
  const cleaned = email.toLowerCase().trim();
  return PLACEHOLDER_EMAIL_PATTERNS.some(p => p.test(cleaned));
}

/**
 * Simple text extraction from PDF (for validation purposes)
 * This is a basic implementation - for full extraction use AI Vision
 */
export function extractBasicTextFromPdf(pdfBytes: Uint8Array): string {
  // Convert to string for text extraction
  const decoder = new TextDecoder('latin1');
  const pdfString = decoder.decode(pdfBytes);
  
  // Extract text between stream markers (basic approach)
  const textParts: string[] = [];
  
  // Look for text in parentheses (PDF text objects)
  const textRegex = /\(([^)]+)\)/g;
  let match;
  while ((match = textRegex.exec(pdfString)) !== null) {
    const text = match[1]
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, '')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (text.length > 2) {
      textParts.push(text);
    }
  }
  
  // Also look for BT...ET text blocks with Tj/TJ operators
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
  while ((match = btEtRegex.exec(pdfString)) !== null) {
    const block = match[1];
    // Extract Tj content
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const text = tjMatch[1].replace(/\\./g, '');
      if (text.length > 2) {
        textParts.push(text);
      }
    }
  }
  
  return textParts.join(' ').toLowerCase();
}

// ============================================
// PHASE 2A: NAME CROSS-VALIDATION HELPERS
// ============================================

/**
 * Dutch name particles (tussenvoegels) to normalize
 */
const DUTCH_NAME_PARTICLES = [
  'van', 'de', 'den', 'der', 'het', 'ter', 'ten', 'te', 
  "'t", 'in', 'op', 'aan', 'bij', 'tot', 'uit', 'voor'
];

/**
 * Normalize a name for comparison:
 * - Lowercase
 * - Remove accents
 * - Remove punctuation
 * - Optionally remove tussenvoegels
 */
function normalizeName(name: string, removeTussenvoegels = true): string {
  let normalized = name
    .toLowerCase()
    .trim()
    // Remove accents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove punctuation except spaces and hyphens
    .replace(/[^\w\s-]/g, '')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();
  
  if (removeTussenvoegels) {
    const words = normalized.split(' ');
    const filtered = words.filter(w => !DUTCH_NAME_PARTICLES.includes(w));
    normalized = filtered.join(' ');
  }
  
  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Early exit for empty strings
  if (m === 0) return n;
  if (n === 0) return m;
  
  // Create matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize first column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  // Initialize first row
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return dp[m][n];
}

/**
 * Check if one name is an initials match of another
 * e.g. "J. Pietersen" matches "Jan Pietersen"
 */
function isInitialsMatch(name1: string, name2: string): boolean {
  const words1 = name1.split(' ').filter(w => w.length > 0);
  const words2 = name2.split(' ').filter(w => w.length > 0);
  
  // Need at least 2 parts to check
  if (words1.length < 2 || words2.length < 2) return false;
  
  // Check if last name matches
  const lastName1 = words1[words1.length - 1];
  const lastName2 = words2[words2.length - 1];
  
  if (lastName1 !== lastName2 && levenshteinDistance(lastName1, lastName2) > 2) {
    return false;
  }
  
  // Check if first name is initial
  const firstName1 = words1[0].replace(/\./g, '');
  const firstName2 = words2[0].replace(/\./g, '');
  
  // One is initial of the other
  if (firstName1.length === 1 && firstName2.startsWith(firstName1)) return true;
  if (firstName2.length === 1 && firstName1.startsWith(firstName2)) return true;
  
  return false;
}

/**
 * Name match result interface
 */
export interface NameMatchResult {
  score: number;           // 0-100 similarity score
  matchType: 'exact' | 'fuzzy' | 'initials' | 'partial' | 'mismatch' | 'not_extractable';
  name1Normalized: string;
  name2Normalized: string;
  details: string;
}

/**
 * Fuzzy name matching with support for Dutch names
 * Returns score 0-100 and match type
 */
export function fuzzyNameMatch(
  documentName: string | null | undefined,
  applicantName: string | null | undefined
): NameMatchResult {
  // Handle null/undefined cases
  if (!documentName || documentName.trim().length === 0) {
    return {
      score: 0,
      matchType: 'not_extractable',
      name1Normalized: '',
      name2Normalized: applicantName ? normalizeName(applicantName) : '',
      details: 'Document name could not be extracted',
    };
  }
  
  if (!applicantName || applicantName.trim().length === 0) {
    return {
      score: 0,
      matchType: 'not_extractable',
      name1Normalized: documentName ? normalizeName(documentName) : '',
      name2Normalized: '',
      details: 'Applicant name not available',
    };
  }
  
  // Normalize both names
  const docNameNorm = normalizeName(documentName, true);
  const appNameNorm = normalizeName(applicantName, true);
  
  // Exact match
  if (docNameNorm === appNameNorm) {
    return {
      score: 100,
      matchType: 'exact',
      name1Normalized: docNameNorm,
      name2Normalized: appNameNorm,
      details: 'Names match exactly after normalization',
    };
  }
  
  // Check initials match (e.g., "J. Pietersen" vs "Jan Pietersen")
  if (isInitialsMatch(docNameNorm, appNameNorm)) {
    return {
      score: 90,
      matchType: 'initials',
      name1Normalized: docNameNorm,
      name2Normalized: appNameNorm,
      details: 'First name matches as initial',
    };
  }
  
  // Calculate Levenshtein-based similarity
  const maxLen = Math.max(docNameNorm.length, appNameNorm.length);
  const distance = levenshteinDistance(docNameNorm, appNameNorm);
  const similarity = Math.round((1 - distance / maxLen) * 100);
  
  // High similarity = fuzzy match
  if (similarity >= 85) {
    return {
      score: similarity,
      matchType: 'fuzzy',
      name1Normalized: docNameNorm,
      name2Normalized: appNameNorm,
      details: `Names similar (Levenshtein distance: ${distance})`,
    };
  }
  
  // Check partial match (last name only)
  const docWords = docNameNorm.split(' ');
  const appWords = appNameNorm.split(' ');
  
  if (docWords.length > 0 && appWords.length > 0) {
    const docLastName = docWords[docWords.length - 1];
    const appLastName = appWords[appWords.length - 1];
    
    if (docLastName === appLastName) {
      return {
        score: 65,
        matchType: 'partial',
        name1Normalized: docNameNorm,
        name2Normalized: appNameNorm,
        details: 'Last name matches exactly, first name different',
      };
    }
    
    // Last name similar but not exact
    const lastNameDistance = levenshteinDistance(docLastName, appLastName);
    const lastNameSimilarity = Math.round((1 - lastNameDistance / Math.max(docLastName.length, appLastName.length)) * 100);
    
    if (lastNameSimilarity >= 80) {
      return {
        score: 55,
        matchType: 'partial',
        name1Normalized: docNameNorm,
        name2Normalized: appNameNorm,
        details: `Last names similar (${lastNameSimilarity}%), first names different`,
      };
    }
  }
  
  // Low similarity = mismatch
  return {
    score: similarity,
    matchType: 'mismatch',
    name1Normalized: docNameNorm,
    name2Normalized: appNameNorm,
    details: `Names do not match (similarity: ${similarity}%)`,
  };
}

/**
 * Identity validation result stored in document metadata
 */
export interface IdentityValidationResult {
  document_name: string | null;
  applicant_name: string;
  match_score: number;
  match_type: NameMatchResult['matchType'];
  confidence: number;
  validated_at: string;
  ai_model?: string;
  extraction_method: 'ai_vision' | 'text_extraction' | 'not_attempted';
}
