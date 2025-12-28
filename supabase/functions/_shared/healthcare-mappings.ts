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

// ============================================
// FASE 2B: EMAIL & INPUT VALIDATION HELPERS
// ============================================

/**
 * Validates email format using RFC 5322 compliant regex
 * @param email - Email address to validate
 * @returns true if email format is valid
 */
export function isValidEmailFormat(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  
  // Trim and check length
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  
  // RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(trimmed)) return false;
  
  // Additional checks
  const [local, domain] = trimmed.split('@');
  
  // Local part validations
  if (!local || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (local.includes('..')) return false;
  
  // Domain part validations
  if (!domain || domain.length > 253) return false;
  if (domain.startsWith('-') || domain.endsWith('-')) return false;
  if (!domain.includes('.')) return false; // Must have at least one dot
  
  // TLD check - must be at least 2 chars
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) return false;
  
  return true;
}

/**
 * Sanitizes candidate name to prevent XSS and injection attacks
 * @param name - Name to sanitize
 * @returns Sanitized name safe for HTML display
 */
export function sanitizeCandidateName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return 'sollicitant';
  
  // Remove HTML tags and entities
  let sanitized = name
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&[#\w]+;/g, '') // Remove HTML entities
    .replace(/[<>\"\'&]/g, '') // Remove dangerous characters
    .trim();
  
  // Limit length
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }
  
  // If empty after sanitization, return fallback
  if (!sanitized || sanitized.length < 2) {
    return 'sollicitant';
  }
  
  return sanitized;
}

/**
 * Valid pipeline stages where AI actions are allowed
 */
export const ACTIONABLE_PIPELINE_STAGES = [
  'nieuw',
  'intake',
  'screening',
  'interview_gepland',
  'interview',
  'wacht_op_documenten',
  'documenten_controle',
  'referentie_check',
  'goedgekeurd',
] as const;

/**
 * Terminal pipeline stages where AI should NOT take email actions
 */
export const TERMINAL_PIPELINE_STAGES = [
  'afgewezen',
  'geplaatst',
  'teruggetrokken',
  'on_hold',
  'archief',
] as const;

/**
 * Checks if an application is in a terminal/inactive state
 * @param stage - Current pipeline stage
 * @returns true if application is in terminal state
 */
export function isTerminalPipelineStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return (TERMINAL_PIPELINE_STAGES as readonly string[]).includes(stage.toLowerCase());
}

/**
 * Result of pre-action validation
 */
export interface PreActionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  blocked_reason?: string;
}

/**
 * Validates all prerequisites before taking an action on an application
 */
export function validatePreActionRequirements(
  application: {
    id: string;
    email?: string | null;
    email_from?: string | null;
    pipeline_stage?: string | null;
    extracted_data?: any;
  } | null,
  actionType: string
): PreActionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check application exists
  if (!application) {
    return {
      valid: false,
      errors: ['Application not found'],
      warnings: [],
      blocked_reason: 'APPLICATION_NOT_FOUND',
    };
  }
  
  // Check email validity - support both 'email' and 'email_from' field names
  const candidateEmail = application.email || application.email_from;
  if (!isValidEmailFormat(candidateEmail)) {
    errors.push(`Invalid email format: ${candidateEmail}`);
  }
  
  // Check pipeline stage for email actions
  const emailActions = [
    'send_followup_question',
    'send_welcome_and_intake',
    'request_interview_availability',
    'send_document_request',
    'send_interview_email',
    'send_general_email',
    'send_reminder',
    'send_emrex_invitation_email',
    'send_emrex_reminder_email',
  ];
  
  if (emailActions.includes(actionType)) {
    if (isTerminalPipelineStage(application.pipeline_stage)) {
      errors.push(`Application in terminal stage: ${application.pipeline_stage}`);
    }
  }
  
  // Check for document quarantine flags on interview-related actions
  const interviewActions = [
    'request_interview_availability',
    'send_interview_email',
  ];
  
  if (interviewActions.includes(actionType)) {
    const extractedData = application.extracted_data || {};
    
    // Check for identity mismatch flags
    if (extractedData.vog_validation_flags?.includes('name_identity_mismatch')) {
      warnings.push('VOG has identity mismatch - HR review required');
    }
    
    if (extractedData.diploma_validation_flags?.includes('name_identity_mismatch')) {
      warnings.push('Diploma has identity mismatch - HR review required');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blocked_reason: errors.length > 0 ? errors[0] : undefined,
  };
}

// ============================================
// FASE 2C: AI HALLUCINATION DETECTION HELPERS
// ============================================

/**
 * Validates BIG (Beroepen in de Individuele Gezondheidszorg) registration number
 * BIG numbers are 11 digits with a checksum
 */
export function validateBIGNumber(bigNumber: string | null | undefined): {
  valid: boolean;
  reason?: string;
  confidence_penalty: number;
} {
  if (!bigNumber) {
    return { valid: true, confidence_penalty: 0 }; // Null is acceptable
  }
  
  // Clean the input - remove spaces, dots, dashes
  const cleaned = String(bigNumber).replace(/[\s.\-]/g, '');
  
  // BIG numbers must be exactly 11 digits (or 9-digit variant)
  if (!/^\d{9,11}$/.test(cleaned)) {
    return { 
      valid: false, 
      reason: 'BIG nummer moet 9-11 cijfers bevatten',
      confidence_penalty: 0.9 // Severe penalty - likely hallucinated
    };
  }
  
  // Check for obvious fake patterns
  const fakePatterns = [
    /^0{9,11}$/,           // All zeros
    /^1{9,11}$/,           // All ones
    /^(\d)\1{8,10}$/,      // All same digit
    /^12345678/,           // Sequential
    /^98765432/,           // Reverse sequential
    /^1234567890/,         // Test pattern
  ];
  
  for (const pattern of fakePatterns) {
    if (pattern.test(cleaned)) {
      return {
        valid: false,
        reason: `BIG nummer lijkt een placeholder/test waarde: ${cleaned}`,
        confidence_penalty: 1.0 // Full penalty - definitely fake
      };
    }
  }
  
  // For 11-digit numbers, validate checksum (Modulus 11 check)
  if (cleaned.length === 11) {
    const weights = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1]; // Standard BIG weights
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += parseInt(cleaned[i], 10) * weights[i];
    }
    
    // Simple modulus check (not perfect but catches obvious fakes)
    if (sum % 11 !== 0 && sum % 11 !== 1) {
      // Don't fail but add uncertainty
      return {
        valid: true, // May still be valid - checksum algorithm varies
        reason: 'BIG nummer checksum onzeker - handmatige verificatie aanbevolen',
        confidence_penalty: 0.2
      };
    }
  }
  
  return { valid: true, confidence_penalty: 0 };
}

/**
 * Common placeholder/hallucination value patterns by field type
 */
const PLACEHOLDER_PATTERNS: Record<string, RegExp[]> = {
  geboortedatum: [
    /^1970-01-01$/,           // Unix epoch
    /^2000-01-01$/,           // Y2K
    /^1990-01-01$/,           // Round date
    /^0000-00-00$/,           // Null date
    /^1234-12-12$/,           // Pattern
  ],
  postcode: [
    /^1234\s?AB$/i,           // Example format
    /^0000\s?[A-Z]{2}$/i,     // Null postcode
    /^1111\s?AA$/i,           // Repeated
  ],
  jaren_ervaring: [
    /^99$/,                   // Unrealistic (99 years)
    /^100$/,                  // Impossible
    /^0$/,                    // If specified as 0, likely missing
  ],
  naam: [
    /^test\s/i,               // Test name
    /^voornaam\s/i,           // Placeholder label
    /^naam\s/i,               // Generic
    /^xxx/i,                  // Placeholder
    /^N\.?V\.?T\.?$/i,        // "Niet van toepassing"
    /^onbekend$/i,            // Unknown
  ],
};

/**
 * Detects if a value appears to be a placeholder or hallucinated
 */
export function isPlaceholderValue(
  value: any, 
  fieldType: string
): boolean {
  if (value === null || value === undefined) return false;
  
  const stringValue = String(value).trim();
  if (!stringValue) return false;
  
  // Check field-specific patterns
  const patterns = PLACEHOLDER_PATTERNS[fieldType];
  if (patterns) {
    for (const pattern of patterns) {
      if (pattern.test(stringValue)) {
        return true;
      }
    }
  }
  
  // Check phone patterns (reuse existing)
  if (fieldType === 'telefoon' || fieldType === 'telefoonnummer') {
    return isPlaceholderPhone(stringValue);
  }
  
  // Check email patterns
  if (fieldType === 'email') {
    return isPlaceholderEmail(stringValue);
  }
  
  return false;
}

/**
 * Validates extracted CV field values and returns validation result with confidence adjustments
 */
export interface FieldValidationResult {
  valid: boolean;
  reason?: string;
  confidence_penalty: number;
  value_override?: any; // Null if value should be removed
}

/**
 * Validates a single extracted field value
 */
export function validateExtractedValue(
  field: string, 
  value: any
): FieldValidationResult {
  // Handle null/undefined - generally acceptable
  if (value === null || value === undefined) {
    return { valid: true, confidence_penalty: 0 };
  }
  
  // Get the actual value (support nested { value, confidence } format)
  const actualValue = typeof value === 'object' && 'value' in value 
    ? value.value 
    : value;
  
  if (actualValue === null || actualValue === undefined) {
    return { valid: true, confidence_penalty: 0 };
  }
  
  // Field-specific validations
  switch (field.toLowerCase()) {
    case 'big_nummer':
    case 'bignummer':
      return validateBIGNumber(actualValue);
    
    case 'jaren_ervaring':
      const years = Number(actualValue);
      if (isNaN(years) || years < 0) {
        return { valid: false, reason: 'Jaren ervaring moet positief getal zijn', confidence_penalty: 0.8 };
      }
      if (years > 50) {
        return { valid: false, reason: `Onrealistische jaren ervaring: ${years}`, confidence_penalty: 0.9, value_override: null };
      }
      if (years > 40) {
        return { valid: true, reason: 'Hoge maar mogelijke jaren ervaring', confidence_penalty: 0.2 };
      }
      return { valid: true, confidence_penalty: 0 };
    
    case 'geboortedatum':
      if (isPlaceholderValue(actualValue, 'geboortedatum')) {
        return { valid: false, reason: 'Placeholder geboortedatum gedetecteerd', confidence_penalty: 1.0, value_override: null };
      }
      // Check realistic age range (18-80 for healthcare workers)
      const birthDate = new Date(actualValue);
      const age = (Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 16 || age > 85) {
        return { valid: false, reason: `Onrealistische leeftijd: ${Math.round(age)} jaar`, confidence_penalty: 0.8, value_override: null };
      }
      return { valid: true, confidence_penalty: 0 };
    
    case 'telefoon':
    case 'telefoonnummer':
      if (isPlaceholderPhone(String(actualValue))) {
        return { valid: false, reason: 'Placeholder telefoonnummer', confidence_penalty: 1.0, value_override: null };
      }
      return { valid: true, confidence_penalty: 0 };
    
    case 'email':
      if (isPlaceholderEmail(String(actualValue))) {
        return { valid: false, reason: 'Placeholder email', confidence_penalty: 1.0, value_override: null };
      }
      if (!isValidEmailFormat(String(actualValue))) {
        return { valid: false, reason: 'Ongeldig email formaat', confidence_penalty: 0.7 };
      }
      return { valid: true, confidence_penalty: 0 };
    
    case 'naam':
      if (isPlaceholderValue(actualValue, 'naam')) {
        return { valid: false, reason: 'Placeholder naam', confidence_penalty: 1.0, value_override: null };
      }
      // Name should be at least 2 characters and contain a space (full name)
      const nameStr = String(actualValue).trim();
      if (nameStr.length < 2) {
        return { valid: false, reason: 'Naam te kort', confidence_penalty: 0.8, value_override: null };
      }
      return { valid: true, confidence_penalty: 0 };
    
    case 'postcode':
      if (isPlaceholderValue(actualValue, 'postcode')) {
        return { valid: false, reason: 'Placeholder postcode', confidence_penalty: 1.0, value_override: null };
      }
      // Dutch postcode format: 1234 AB
      if (!/^\d{4}\s?[A-Z]{2}$/i.test(String(actualValue))) {
        return { valid: true, reason: 'Ongebruikelijk postcode formaat', confidence_penalty: 0.3 };
      }
      return { valid: true, confidence_penalty: 0 };
    
    default:
      // Check generic placeholder patterns
      if (typeof actualValue === 'string' && isPlaceholderValue(actualValue, field)) {
        return { valid: false, reason: `Placeholder waarde voor ${field}`, confidence_penalty: 0.8 };
      }
      return { valid: true, confidence_penalty: 0 };
  }
}

/**
 * Validates all critical fields in extracted CV data
 * Returns validation results and adjusted global confidence
 */
export interface CVValidationResult {
  fieldResults: Record<string, FieldValidationResult>;
  hasHallucinationFlags: boolean;
  adjustedConfidence: number;
  warnings: string[];
  nullifiedFields: string[];
}

export function validateAllExtractedFields(
  extractedData: Record<string, any>
): CVValidationResult {
  const fieldResults: Record<string, FieldValidationResult> = {};
  const warnings: string[] = [];
  const nullifiedFields: string[] = [];
  let totalPenalty = 0;
  let fieldsChecked = 0;
  let hasHallucinationFlags = false;
  
  // Critical fields to validate
  const criticalFields = [
    'naam', 'email', 'telefoon', 'telefoonnummer',
    'geboortedatum', 'postcode', 'BIG_nummer', 
    'jaren_ervaring', 'ervaring_sinds'
  ];
  
  for (const field of criticalFields) {
    const value = extractedData[field];
    if (value === undefined) continue;
    
    const result = validateExtractedValue(field, value);
    fieldResults[field] = result;
    fieldsChecked++;
    
    if (!result.valid) {
      warnings.push(`⚠️ ${field}: ${result.reason}`);
      hasHallucinationFlags = true;
      
      if (result.value_override === null) {
        nullifiedFields.push(field);
      }
    }
    
    totalPenalty += result.confidence_penalty;
  }
  
  // Calculate adjusted confidence
  const originalConfidence = extractedData.global_confidence || 0.5;
  const averagePenalty = fieldsChecked > 0 ? totalPenalty / fieldsChecked : 0;
  const adjustedConfidence = Math.max(0, originalConfidence - averagePenalty);
  
  return {
    fieldResults,
    hasHallucinationFlags,
    adjustedConfidence,
    warnings,
    nullifiedFields,
  };
}

// ============================================
// FASE 2D: PROMPT INJECTION PROTECTION
// ============================================

/**
 * Known prompt injection patterns to detect
 */
const PROMPT_INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}> = [
  // Critical: Direct instruction override
  { pattern: /ignore.*(?:previous|all|above|prior).*instructions/i, severity: 'critical', description: 'Instruction override attempt' },
  { pattern: /negeer.*(?:vorige|alle|bovenstaande).*instructies/i, severity: 'critical', description: 'Dutch instruction override' },
  { pattern: /vergeet.*alles.*(?:hierboven|wat je)/i, severity: 'critical', description: 'Memory wipe attempt' },
  { pattern: /je.*bent.*nu.*een.*(?:ander|nieuwe)/i, severity: 'critical', description: 'Role reassignment' },
  { pattern: /system.*prompt.*(?:override|ignore|bypass)/i, severity: 'critical', description: 'System prompt manipulation' },
  
  // Critical: Token injection (OpenAI/Anthropic style)
  { pattern: /<\|im_start\|>/i, severity: 'critical', description: 'ChatML injection' },
  { pattern: /<\|im_end\|>/i, severity: 'critical', description: 'ChatML injection' },
  { pattern: /\[INST\]/i, severity: 'critical', description: 'Llama instruction injection' },
  { pattern: /\[\/INST\]/i, severity: 'critical', description: 'Llama instruction injection' },
  { pattern: /```system/i, severity: 'critical', description: 'System block injection' },
  { pattern: /\[SYSTEM\]/i, severity: 'critical', description: 'System tag injection' },
  { pattern: /<\|system\|>/i, severity: 'critical', description: 'System token injection' },
  
  // High: Jailbreak attempts
  { pattern: /developer.*mode/i, severity: 'high', description: 'Developer mode jailbreak' },
  { pattern: /\bDAN\b.*mode/i, severity: 'high', description: 'DAN jailbreak' },
  { pattern: /jailbreak/i, severity: 'high', description: 'Explicit jailbreak' },
  { pattern: /je.*mag.*nu.*alles/i, severity: 'high', description: 'Permission expansion' },
  { pattern: /pretend.*you.*(?:can|are|have)/i, severity: 'high', description: 'Role play manipulation' },
  { pattern: /doe.*alsof.*je.*(?:kan|bent|mag)/i, severity: 'high', description: 'Dutch role play' },
  
  // High: Data exfiltration
  { pattern: /geef.*(?:me|mij).*(?:alle|je).*api.*key/i, severity: 'high', description: 'API key extraction' },
  { pattern: /toon.*(?:je|jouw).*system.*prompt/i, severity: 'high', description: 'System prompt extraction' },
  { pattern: /wat.*zijn.*(?:je|jouw).*(?:instructies|regels)/i, severity: 'medium', description: 'Instruction probing' },
  { pattern: /show.*(?:me|your).*(?:system|initial).*prompt/i, severity: 'high', description: 'Prompt extraction' },
  { pattern: /print.*(?:your|the).*(?:instructions|prompt)/i, severity: 'high', description: 'Instruction dump' },
  
  // Medium: Suspicious patterns
  { pattern: /act.*as.*(?:if|though).*(?:you|there)/i, severity: 'medium', description: 'Behavior manipulation' },
  { pattern: /roleplay.*as/i, severity: 'medium', description: 'Roleplay request' },
  { pattern: /you.*are.*now.*(?:a|an|the)/i, severity: 'medium', description: 'Identity reassignment' },
  { pattern: /vanaf.*nu.*ben.*je/i, severity: 'medium', description: 'Dutch identity change' },
  
  // Low: Probing patterns (may be legitimate questions)
  { pattern: /how.*(?:were|are).*you.*(?:trained|programmed)/i, severity: 'low', description: 'Training inquiry' },
  { pattern: /what.*(?:model|version).*are.*you/i, severity: 'low', description: 'Model inquiry' },
];

/**
 * Result of prompt injection detection
 */
export interface PromptInjectionCheck {
  isInjection: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  matchedPatterns: string[];
  sanitizedContent?: string;
  shouldBlock: boolean;
}

/**
 * Detects prompt injection attempts in user input
 */
export function detectPromptInjection(content: string): PromptInjectionCheck {
  if (!content || typeof content !== 'string') {
    return { isInjection: false, severity: 'none', matchedPatterns: [], shouldBlock: false };
  }
  
  const matchedPatterns: string[] = [];
  let highestSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
  const severityOrder = ['none', 'low', 'medium', 'high', 'critical'];
  
  // Check each pattern
  for (const { pattern, severity, description } of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      matchedPatterns.push(description);
      
      // Update highest severity
      if (severityOrder.indexOf(severity) > severityOrder.indexOf(highestSeverity)) {
        highestSeverity = severity;
      }
    }
  }
  
  const isInjection = matchedPatterns.length > 0;
  const shouldBlock = highestSeverity === 'critical' || 
    (highestSeverity === 'high' && matchedPatterns.length >= 2);
  
  // For medium/high severity, create sanitized version
  let sanitizedContent: string | undefined;
  if (isInjection && !shouldBlock) {
    // Remove suspicious patterns
    sanitizedContent = content;
    for (const { pattern } of PROMPT_INJECTION_PATTERNS) {
      sanitizedContent = sanitizedContent.replace(pattern, '[REMOVED]');
    }
  }
  
  return {
    isInjection,
    severity: highestSeverity,
    matchedPatterns,
    sanitizedContent,
    shouldBlock,
  };
}

/**
 * Patterns that should never appear in AI output (sensitive data leakage)
 */
const FORBIDDEN_OUTPUT_PATTERNS: Array<{
  pattern: RegExp;
  description: string;
}> = [
  // API keys and secrets
  { pattern: /LOVABLE_API_KEY/i, description: 'Lovable API key reference' },
  { pattern: /SUPABASE_SERVICE_ROLE/i, description: 'Supabase service role key' },
  { pattern: /OPENAI_API_KEY/i, description: 'OpenAI API key reference' },
  { pattern: /Bearer\s+[A-Za-z0-9\-_]{50,}/i, description: 'Bearer token' },
  { pattern: /sk-[A-Za-z0-9]{20,}/i, description: 'OpenAI key format' },
  { pattern: /eyJ[A-Za-z0-9\-_]{100,}/i, description: 'JWT token' },
  
  // Database credentials
  { pattern: /password\s*[:=]\s*["']?[^\s"']{8,}/i, description: 'Password in output' },
  { pattern: /postgresql:\/\/[^:]+:[^@]+@/i, description: 'Database connection string' },
  
  // Internal references
  { pattern: /Deno\.env\.get\s*\(/i, description: 'Environment variable access' },
  { pattern: /process\.env\./i, description: 'Node env access' },
];

/**
 * Result of AI output validation
 */
export interface AIOutputValidationResult {
  valid: boolean;
  violations: string[];
  sanitizedOutput?: string;
}

/**
 * Validates AI output for sensitive data leakage
 */
export function validateAIOutput(
  output: string,
  options?: { maxLength?: number }
): AIOutputValidationResult {
  if (!output || typeof output !== 'string') {
    return { valid: true, violations: [] };
  }
  
  const violations: string[] = [];
  let sanitizedOutput = output;
  
  // Check for forbidden patterns
  for (const { pattern, description } of FORBIDDEN_OUTPUT_PATTERNS) {
    if (pattern.test(output)) {
      violations.push(description);
      // Mask the sensitive content
      sanitizedOutput = sanitizedOutput.replace(pattern, '[REDACTED]');
    }
  }
  
  // Check length
  const maxLength = options?.maxLength || 50000;
  if (output.length > maxLength) {
    violations.push(`Output exceeds max length (${output.length} > ${maxLength})`);
    sanitizedOutput = sanitizedOutput.substring(0, maxLength) + '... [TRUNCATED]';
  }
  
  return {
    valid: violations.length === 0,
    violations,
    sanitizedOutput: violations.length > 0 ? sanitizedOutput : undefined,
  };
}

// =============================================================================
// SSRF PROTECTION - URL WHITELIST FOR FIRECRAWL
// =============================================================================

/**
 * IP patterns that should be blocked (private networks, localhost, cloud metadata)
 */
const BLOCKED_IP_PATTERNS: RegExp[] = [
  /^10\./,                            // Private 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./,    // Private 172.16.0.0/12
  /^192\.168\./,                      // Private 192.168.0.0/16
  /^127\./,                           // Localhost 127.0.0.0/8
  /^169\.254\./,                      // Link-local / AWS metadata
  /^0\./,                             // Reserved 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^198\.51\.100\./,                  // TEST-NET-2
  /^203\.0\.113\./,                   // TEST-NET-3
  /^::1$/,                            // IPv6 localhost
  /^fc00:/i,                          // IPv6 unique local
  /^fe80:/i,                          // IPv6 link-local
];

/**
 * Blocked hostnames
 */
const BLOCKED_HOSTNAMES: string[] = [
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  '169.254.169.254',
];

/**
 * Allowed TLDs for scraping (focused on Netherlands and common business domains)
 */
const ALLOWED_TLDS: string[] = [
  '.nl',   // Netherlands
  '.com',  // Commercial
  '.org',  // Organizations
  '.eu',   // European Union
  '.be',   // Belgium
  '.de',   // Germany
  '.net',  // Network
  '.info', // Information
];

/**
 * Explicitly whitelisted domains (healthcare organizations, recruitment platforms)
 */
const WHITELISTED_DOMAINS: string[] = [
  // Nederlandse zorgorganisaties
  'sheerenloo.nl',
  'pluryn.nl',
  'propersona.nl',
  'amarant.nl',
  'legerdesheils.nl',
  'humanitas.nl',
  'lunetzorg.nl',
  'siza.nl',
  'philadelphia.nl',
  'cordaan.nl',
  'abrona.nl',
  'middin.nl',
  'reinaerde.nl',
  'trajectum.nl',
  'prismanet.nl',
  'swzzorg.nl',
  'fokuswonen.nl',
  'dedriestroom.nl',
  'cello.nl',
  'dichterbij.nl',
  'onstweedethuis.nl',
  'gemiva-svg.nl',
  'esdege-reigersdaal.nl',
  // Recruitment platforms
  'linkedin.com',
  'indeed.nl',
  'indeed.com',
  'werkzoeken.nl',
  'nationalevacaturebank.nl',
  'monsterboard.nl',
  // Government
  'rijksoverheid.nl',
  'kvk.nl',
  'overheid.nl',
];

/**
 * Domain patterns that are always allowed (regex patterns)
 */
const ALLOWED_DOMAIN_PATTERNS: RegExp[] = [
  /.*zorg\.nl$/i,        // Any *zorg.nl domain
  /.*care\.nl$/i,        // Any *care.nl domain
  /.*stichting\.nl$/i,   // Any *stichting.nl domain
  /.*gezondheid\.nl$/i,  // Any *gezondheid.nl domain
];

/**
 * Result of URL validation for SSRF protection
 */
export interface UrlValidationResult {
  allowed: boolean;
  reason?: string;
  sanitizedUrl?: string;
}

/**
 * Validates a URL for SSRF protection before scraping
 * Blocks private IPs, localhost, cloud metadata, and non-whitelisted domains
 */
export function isUrlAllowedForScraping(
  url: string,
  options?: { 
    allowAnyDutchDomain?: boolean;
    strictMode?: boolean;
  }
): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { allowed: false, reason: 'URL is required' };
  }

  try {
    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const protocol = parsedUrl.protocol.toLowerCase();

    // 1. Block non-HTTP(S) protocols
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { 
        allowed: false, 
        reason: `Protocol not allowed: ${protocol}. Only HTTP(S) is permitted.` 
      };
    }

    // 2. Block localhost and blocked hostnames
    for (const blocked of BLOCKED_HOSTNAMES) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        return { 
          allowed: false, 
          reason: `Blocked hostname: ${hostname}` 
        };
      }
    }

    // 3. Block private/internal IP ranges
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { 
          allowed: false, 
          reason: `Private/internal IP not allowed: ${hostname}` 
        };
      }
    }

    // 4. Check if it looks like an IP address (not a domain name)
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(hostname)) {
      // Only allow if it's not in any blocked range (double-check)
      const octets = hostname.split('.').map(Number);
      if (octets[0] === 10 || 
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168) ||
          octets[0] === 127 ||
          octets[0] === 169) {
        return { 
          allowed: false, 
          reason: `IP address not allowed for security reasons: ${hostname}` 
        };
      }
      // In strict mode, block all IP addresses
      if (options?.strictMode) {
        return { 
          allowed: false, 
          reason: `Direct IP addresses not allowed in strict mode: ${hostname}` 
        };
      }
    }

    // 5. Check explicitly whitelisted domains
    for (const domain of WHITELISTED_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return { 
          allowed: true, 
          sanitizedUrl: normalizedUrl 
        };
      }
    }

    // 6. Check allowed domain patterns
    for (const pattern of ALLOWED_DOMAIN_PATTERNS) {
      if (pattern.test(hostname)) {
        return { 
          allowed: true, 
          sanitizedUrl: normalizedUrl 
        };
      }
    }

    // 7. Check allowed TLDs
    const hasAllowedTld = ALLOWED_TLDS.some(tld => hostname.endsWith(tld));
    if (hasAllowedTld) {
      // Allow any .nl domain by default (Dutch focus)
      if (hostname.endsWith('.nl') || options?.allowAnyDutchDomain) {
        return { 
          allowed: true, 
          sanitizedUrl: normalizedUrl 
        };
      }
      
      // For other TLDs in non-strict mode, allow
      if (!options?.strictMode) {
        return { 
          allowed: true, 
          sanitizedUrl: normalizedUrl 
        };
      }
    }

    // 8. Block everything else in strict mode
    if (options?.strictMode) {
      return { 
        allowed: false, 
        reason: `Domain not in whitelist: ${hostname}` 
      };
    }

    // Default: allow with warning (non-strict mode)
    return { 
      allowed: true, 
      sanitizedUrl: normalizedUrl,
      reason: `Domain allowed but not explicitly whitelisted: ${hostname}`
    };

  } catch (error) {
    return { 
      allowed: false, 
      reason: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

// ============================================================================
// SECURITY EVENT LOGGING HELPER
// ============================================================================

/**
 * Security event types for centralized logging
 */
export type SecurityEventType = 
  | 'ssrf_blocked' 
  | 'injection_detected' 
  | 'data_leakage_prevented'
  | 'hallucination_detected'
  | 'suspicious_input';

/**
 * Severity levels for security events
 */
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Standardized security event logging interface
 */
export interface SecurityEventDetails {
  function_name: string;
  blocked_url?: string;
  blocked_reason?: string;
  input_content?: string;
  detected_patterns?: string[];
  user_id?: string;
  org_id?: string;
  additional_context?: Record<string, unknown>;
}

/**
 * Log security events to system_events table for monitoring and alerting
 * 
 * @param supabase - Supabase admin client
 * @param eventType - Type of security event
 * @param severity - Severity level
 * @param details - Event details
 */
export async function logSecurityEvent(
  supabase: any,
  eventType: SecurityEventType,
  severity: SecuritySeverity,
  details: SecurityEventDetails
): Promise<void> {
  const titleMap: Record<SecurityEventType, string> = {
    ssrf_blocked: '🚫 SSRF Attempt Blocked',
    injection_detected: '⚠️ Prompt Injection Detected',
    data_leakage_prevented: '🔴 Data Leakage Prevented',
    hallucination_detected: '🧠 AI Hallucination Detected',
    suspicious_input: '👁️ Suspicious Input Detected',
  };

  const descriptionMap: Record<SecurityEventType, string> = {
    ssrf_blocked: `Blocked potentially malicious URL in ${details.function_name}`,
    injection_detected: `Detected prompt injection attempt in ${details.function_name}`,
    data_leakage_prevented: `Prevented sensitive data exposure in ${details.function_name}`,
    hallucination_detected: `Detected potential AI hallucination in ${details.function_name}`,
    suspicious_input: `Flagged suspicious input pattern in ${details.function_name}`,
  };

  try {
    await supabase.from('system_events').insert({
      event_type: 'security_alert',
      severity,
      title: titleMap[eventType],
      description: descriptionMap[eventType],
      details: {
        alert_category: eventType,
        timestamp: new Date().toISOString(),
        function_name: details.function_name,
        blocked_url: details.blocked_url,
        blocked_reason: details.blocked_reason,
        input_preview: details.input_content?.substring(0, 200),
        detected_patterns: details.detected_patterns,
        user_id: details.user_id,
        org_id: details.org_id,
        ...details.additional_context,
      },
      processed: false,
    });
    
    console.log(`📊 Security event logged: ${eventType} (${severity})`);
  } catch (error) {
    // Don't throw - logging failures shouldn't break the main flow
    console.error(`❌ Failed to log security event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
