/**
 * HR Specialist Level Validation Functions
 * 
 * Smart validation functions that detect placeholder data, validate ZZP-specific
 * requirements, and ensure completeness like a real HR professional would.
 */

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

/**
 * Fields required for ZZP (freelance) professionals
 */
export const ZZP_REQUIRED_FIELDS = [
  'gewenst_uurloon',
  'kvk_nummer',
  'btw_nummer',
  'vog_date',
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
  
  // ZZP-specific required fields
  if (data.werkvorm === 'ZZP') {
    if (!data.gewenst_uurloon) missing.push('uurtarief');
    if (!data.kvk_nummer) missing.push('kvk_nummer');
    if (!data.btw_nummer) missing.push('btw_nummer');
    if (!data.vog_date) missing.push('vog');
  }
  
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
 * Calculate HR-level completeness score
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
    // ZZP fields (conditional weight)
    gewenst_uurloon: data.werkvorm === 'ZZP' ? 8 : 2,
    kvk_nummer: data.werkvorm === 'ZZP' ? 6 : 0,
    btw_nummer: data.werkvorm === 'ZZP' ? 4 : 0,
    vog_date: 5,
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
    } else if (value !== null && value !== undefined && value !== '') {
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
