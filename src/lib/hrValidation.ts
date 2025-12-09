/**
 * HR Specialist Level Validation Functions
 * 
 * Smart validation functions that detect placeholder data, validate ZZP-specific
 * requirements, ensure completeness like a real HR professional would,
 * and validate VOG expiration (max 3 months).
 */

// =====================================================
// VOG VALIDITY CONFIGURATION
// =====================================================
export const VOG_VALIDITY_MONTHS = 3;

// =====================================================
// PLACEHOLDER PHONE DETECTION
// =====================================================
// Placeholder phone patterns that indicate fake/test data
const PLACEHOLDER_PHONE_PATTERNS = [
  /^06[-\s]?0{6,}$/,              // 06-00000000, 06 000000
  /^06[-\s]?1234567[89]?$/,       // 06-12345678, 06-123456789
  /^000/,                          // starts with 000
  /^06[-\s]?9{6,}$/,              // 06-99999999
  /^(\d)\1{7,}$/,                  // all same digit like 00000000
  /^0612345/,                      // obvious test pattern
];

/**
 * Validates if a phone number is a real number vs placeholder
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  
  // Clean phone number
  const cleaned = phone.replace(/[\s-]/g, '');
  
  // Must be at least 10 digits for Dutch numbers
  if (cleaned.length < 10) return false;
  
  // Check against placeholder patterns
  for (const pattern of PLACEHOLDER_PHONE_PATTERNS) {
    if (pattern.test(phone) || pattern.test(cleaned)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Checks if phone is explicitly a placeholder
 */
export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return true;
  return !isValidPhone(phone);
}

// =====================================================
// VOG EXPIRATION VALIDATION
// =====================================================

/**
 * Checks if a VOG has expired (older than 3 months)
 */
export function isVogExpired(vogDate: string | Date | null | undefined): boolean {
  if (!vogDate) return true; // No date means expired/missing
  
  try {
    const vogDateObj = typeof vogDate === 'string' ? new Date(vogDate) : vogDate;
    if (isNaN(vogDateObj.getTime())) return true; // Invalid date
    
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - VOG_VALIDITY_MONTHS);
    
    return vogDateObj < threeMonthsAgo;
  } catch {
    return true;
  }
}

/**
 * Gets the VOG expiry status with detailed information
 */
export function getVogExpiryStatus(vogDate: string | Date | null | undefined): 
  'valid' | 'expiring_soon' | 'expired' | 'missing' {
  if (!vogDate) return 'missing';
  
  try {
    const vogDateObj = typeof vogDate === 'string' ? new Date(vogDate) : vogDate;
    if (isNaN(vogDateObj.getTime())) return 'missing';
    
    const now = new Date();
    
    // Calculate expiry date (VOG date + 3 months)
    const expiryDate = new Date(vogDateObj);
    expiryDate.setMonth(expiryDate.getMonth() + VOG_VALIDITY_MONTHS);
    
    // Check if expired
    if (now > expiryDate) return 'expired';
    
    // Check if expiring soon (within 2 weeks)
    const twoWeeksFromNow = new Date();
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
    if (expiryDate <= twoWeeksFromNow) return 'expiring_soon';
    
    return 'valid';
  } catch {
    return 'missing';
  }
}

/**
 * Calculates days until VOG expires (negative = already expired)
 */
export function getVogDaysUntilExpiry(vogDate: string | Date | null | undefined): number | null {
  if (!vogDate) return null;
  
  try {
    const vogDateObj = typeof vogDate === 'string' ? new Date(vogDate) : vogDate;
    if (isNaN(vogDateObj.getTime())) return null;
    
    const expiryDate = new Date(vogDateObj);
    expiryDate.setMonth(expiryDate.getMonth() + VOG_VALIDITY_MONTHS);
    
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch {
    return null;
  }
}

// =====================================================
// FIELD REQUIREMENTS
// =====================================================

/**
 * Fields required for ZZP (freelance) professionals
 * Note: uurtarief is optional (can be discussed later)
 */
export const ZZP_REQUIRED_FIELDS = [
  'kvk_nummer',
  'btw_nummer',
  'vog_date',
] as const;

/**
 * Fields that are optional but valuable for ZZP
 */
export const ZZP_OPTIONAL_FIELDS = [
  'gewenst_uurloon',
] as const;

/**
 * Fields useful for healthcare matching
 */
export const HEALTHCARE_OPTIONAL_FIELDS = [
  'nachtdienst_bereid',
  'weekenddienst_bereid',
  'beschikbare_uren_per_week',
] as const;

/**
 * Detect missing info like an HR Specialist would
 * Enhanced with VOG expiration validation
 */
export function detectMissingInfoHR(data: {
  naam?: string | null;
  email?: string | null;
  telefoonnummer?: string | null;
  telefoon?: string | null;
  functie_niveau?: string | null;
  werkvorm?: string | null;
  regio?: string | null;
  beschikbaarheid?: string | null;
  gewenst_uurloon?: number | null;
  kvk_nummer?: string | null;
  btw_nummer?: string | null;
  vog_date?: string | null;
  vog_file_path?: string | null;
  nachtdienst_bereid?: boolean | null;
  weekenddienst_bereid?: boolean | null;
}): string[] {
  const missing: string[] = [];
  
  // Basic required fields
  if (!data.naam) missing.push('naam');
  if (!data.email) missing.push('email');
  if (!data.functie_niveau) missing.push('functie_niveau');
  if (!data.werkvorm) missing.push('werkvorm');
  if (!data.regio) missing.push('regio');
  
  // Smart phone validation - detect placeholders!
  const phone = data.telefoonnummer || data.telefoon;
  if (!isValidPhone(phone)) {
    missing.push('telefoonnummer');
  }
  
  // ZZP-specific required fields (uurtarief is now OPTIONAL)
  if (data.werkvorm === 'ZZP') {
    if (!data.kvk_nummer) missing.push('kvk_nummer');
    if (!data.btw_nummer) missing.push('btw_nummer');
  }
  
  // VOG validation with expiration check
  const vogStatus = getVogExpiryStatus(data.vog_date);
  if (vogStatus === 'missing') {
    missing.push('vog');
  } else if (vogStatus === 'expired') {
    missing.push('vog_verlopen'); // Specific key for expired VOG
  }
  // Note: 'expiring_soon' is not added to missing - just a warning
  
  // Healthcare matching fields (optional but valuable)
  if (data.nachtdienst_bereid === null || data.nachtdienst_bereid === undefined) {
    missing.push('nachtdienst_bereid');
  }
  if (data.weekenddienst_bereid === null || data.weekenddienst_bereid === undefined) {
    missing.push('weekenddienst_bereid');
  }
  
  return missing;
}

/**
 * Get human-readable description for missing info field
 */
export function getMissingInfoDescription(field: string): string {
  const descriptions: Record<string, string> = {
    'naam': 'Volledige naam',
    'email': 'E-mailadres',
    'telefoonnummer': 'Geldig telefoonnummer',
    'functie_niveau': 'Functieniveau (VIG, HBO-V, etc.)',
    'werkvorm': 'Gewenste werkvorm',
    'regio': 'Werkgebied/regio',
    'beschikbaarheid': 'Beschikbaarheid (uren/week)',
    'kvk_nummer': 'KvK-nummer (voor ZZP)',
    'btw_nummer': 'BTW-nummer (voor ZZP)',
    'vog': 'Verklaring Omtrent Gedrag',
    'vog_verlopen': 'VOG verlopen (ouder dan 3 maanden)',
    'nachtdienst_bereid': 'Bereidheid nachtdienst',
    'weekenddienst_bereid': 'Bereidheid weekenddienst',
    'uurtarief': 'Gewenst uurtarief',
    'gewenst_uurloon': 'Gewenst uurtarief',
  };
  return descriptions[field] || field;
}

/**
 * Calculate HR-level completeness score
 * Enhanced with VOG expiration validation
 */
export function calculateHRCompletenessScore(data: Record<string, unknown>): number {
  const weights: Record<string, number> = {
    naam: 10,
    email: 10,
    telefoonnummer: 8,
    functie_niveau: 15,
    werkvorm: 10,
    regio: 10,
    beschikbaarheid: 8,
    ervaring_sector: 8,
    doelgroep_ervaring: 5,
    // ZZP fields (conditional weight) - uurtarief now optional (lower weight)
    gewenst_uurloon: data.werkvorm === 'ZZP' ? 3 : 1,
    kvk_nummer: data.werkvorm === 'ZZP' ? 6 : 0,
    btw_nummer: data.werkvorm === 'ZZP' ? 4 : 0,
    vog_date: 6, // Increased weight for VOG
    // Healthcare matching
    nachtdienst_bereid: 3,
    weekenddienst_bereid: 3,
    eigen_vervoer: 3,
  };
  
  let earnedPoints = 0;
  let totalPoints = 0;
  
  for (const [field, weight] of Object.entries(weights)) {
    if (weight === 0) continue;
    totalPoints += weight;
    
    const value = data[field];
    
    // Special phone validation
    if (field === 'telefoonnummer') {
      if (isValidPhone(value as string)) {
        earnedPoints += weight;
      }
    } 
    // Special VOG validation with expiration check
    else if (field === 'vog_date') {
      const vogStatus = getVogExpiryStatus(value as string | null);
      if (vogStatus === 'valid' || vogStatus === 'expiring_soon') {
        earnedPoints += weight;
      }
      // Expired or missing VOG = 0 points
    }
    else if (value !== null && value !== undefined && value !== '') {
      // Handle arrays
      if (Array.isArray(value) && value.length > 0) {
        earnedPoints += weight;
      } else if (!Array.isArray(value)) {
        earnedPoints += weight;
      }
    }
  }
  
  return Math.round((earnedPoints / totalPoints) * 100);
}

/**
 * Document type detection from filename
 */
export function detectDocumentType(filename: string): 'vog' | 'diploma' | 'certificate' | 'cv' | 'id' | 'other' {
  const lower = filename.toLowerCase();
  
  if (lower.includes('vog') || lower.includes('verklaring omtrent') || lower.includes('verklaring_omtrent')) {
    return 'vog';
  }
  if (lower.includes('diploma') || lower.includes('getuigschrift')) {
    return 'diploma';
  }
  if (lower.includes('certificaat') || lower.includes('certificate') || lower.includes('bhv') || lower.includes('ehbo')) {
    return 'certificate';
  }
  if (lower.includes('cv') || lower.includes('curriculum') || lower.includes('resume')) {
    return 'cv';
  }
  if (lower.includes('id') || lower.includes('paspoort') || lower.includes('rijbewijs') || lower.includes('identiteit')) {
    return 'id';
  }
  
  return 'other';
}

/**
 * Check if a filename indicates a VOG document
 */
export function isVogDocument(filename: string): boolean {
  return detectDocumentType(filename) === 'vog';
}

/**
 * Try to extract a date from a VOG filename
 * Looks for patterns like: VOG_2025-01-15.pdf, VOG-15012025.pdf, etc.
 */
export function extractVogDateFromFilename(filename: string): Date | null {
  // Pattern: YYYY-MM-DD
  const isoMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Pattern: DD-MM-YYYY or DDMMYYYY
  const euMatch = filename.match(/(\d{2})[-.]?(\d{2})[-.]?(\d{4})/);
  if (euMatch) {
    const date = new Date(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`);
    if (!isNaN(date.getTime())) return date;
  }
  
  return null;
}
