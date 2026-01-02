/**
 * _shared/pre-validation.ts
 * 
 * Centralized deterministic validation checks for applications.
 * These run BEFORE any AI processing to catch obvious issues.
 * 
 * Used by: receive-external-application, handle-application-reply, extract-cv-data
 */

// ============= INTERFACES =============

export interface PreValidationCheck {
  name: string;
  passed: boolean;
  reason?: string;
  blocking: boolean; // If true, blocks further processing
}

export interface PreValidationResult {
  passed: boolean;
  checks: PreValidationCheck[];
  blockingIssues: string[];
  warnings: string[];
}

export interface ApplicationData {
  email?: string;
  phone?: string;
  name?: string;
  cvFilePath?: string;
  cvFileName?: string;
  documents?: Array<{
    filename: string;
    contentType?: string;
    size?: number;
  }>;
  extractedData?: Record<string, unknown>;
}

// ============= CONSTANTS =============

// Placeholder patterns to detect fake/test data
const PLACEHOLDER_PHONE_PATTERNS = [
  /^0{5,}/,                     // 00000...
  /^06[-\s]?12345678$/,        // 06-12345678 (classic test)
  /^06[-\s]?00000000$/,        // 06-00000000
  /^123456789\d*$/,            // 123456789...
  /^(\d)\1{7,}$/,              // Repeated digits like 88888888
  /^0612345678$/,              // No separators
  /^\+31[-\s]?6[-\s]?12345678$/,  // International format test
];

const PLACEHOLDER_EMAIL_PATTERNS = [
  /^test@/i,
  /^example@/i,
  /^demo@/i,
  /^noreply@/i,
  /^fake@/i,
  /^placeholder@/i,
  /@example\./i,
  /@test\./i,
  /^a{3,}@/,  // aaa@...
];

const PLACEHOLDER_NAME_PATTERNS = [
  /^test\s/i,
  /^jan\s*jansen$/i,
  /^john\s*doe$/i,
  /^jane\s*doe$/i,
  /^naam\s*onbekend$/i,
  /^x{3,}/i,
  /^n\.?v\.?t\.?$/i,  // n.v.t. / nvt
  /^onbekend$/i,
];

// Allowed document types for CV/documents
const ALLOWED_CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const ALLOWED_DOCUMENT_TYPES = [
  ...ALLOWED_CV_TYPES,
  'image/jpeg',
  'image/png',
  'image/webp',
];

// ============= VALIDATION FUNCTIONS =============

/**
 * Check if phone number is a placeholder/test value
 */
export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  return PLACEHOLDER_PHONE_PATTERNS.some(pattern => pattern.test(cleaned));
}

/**
 * Check if email is a placeholder/test value
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PLACEHOLDER_EMAIL_PATTERNS.some(pattern => pattern.test(email));
}

/**
 * Check if name is a placeholder/test value
 */
export function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return false;
  return PLACEHOLDER_NAME_PATTERNS.some(pattern => pattern.test(name.trim()));
}

/**
 * Check if email format is valid
 */
export function isValidEmailFormat(email: string | null | undefined): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if phone format is valid Dutch format
 */
export function isValidDutchPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Dutch mobile: 06xxxxxxxx or +316xxxxxxxx
  const mobileRegex = /^(\+31|0031)?6\d{8}$/;
  // Dutch landline: 0xxyyyyyyy (10 digits)
  const landlineRegex = /^(\+31|0031)?[1-9]\d{8}$/;
  
  return mobileRegex.test(cleaned) || landlineRegex.test(cleaned);
}

/**
 * Check document file type
 */
export function isAllowedDocumentType(
  contentType: string | null | undefined, 
  category: 'cv' | 'document' = 'document'
): boolean {
  if (!contentType) return false;
  const allowed = category === 'cv' ? ALLOWED_CV_TYPES : ALLOWED_DOCUMENT_TYPES;
  return allowed.includes(contentType.toLowerCase());
}

/**
 * Check if filename suggests a valid document
 */
export function hasValidDocumentExtension(filename: string | null | undefined): boolean {
  if (!filename) return false;
  const validExtensions = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.webp'];
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return validExtensions.includes(ext);
}

// ============= MAIN VALIDATION FUNCTION =============

/**
 * Run all pre-validation checks on application data
 * Returns structured result with pass/fail status for each check
 */
export function runPreValidationChecks(data: ApplicationData): PreValidationResult {
  const checks: PreValidationCheck[] = [];
  
  // 1. Email checks
  if (data.email) {
    // Format check
    checks.push({
      name: 'email_format',
      passed: isValidEmailFormat(data.email),
      reason: isValidEmailFormat(data.email) ? undefined : 'Ongeldig email formaat',
      blocking: true,
    });
    
    // Placeholder check
    checks.push({
      name: 'email_not_placeholder',
      passed: !isPlaceholderEmail(data.email),
      reason: isPlaceholderEmail(data.email) ? 'Test/placeholder email gedetecteerd' : undefined,
      blocking: true,
    });
  } else {
    checks.push({
      name: 'email_present',
      passed: false,
      reason: 'Email adres ontbreekt',
      blocking: true,
    });
  }
  
  // 2. Phone checks (non-blocking but flagged)
  if (data.phone) {
    checks.push({
      name: 'phone_not_placeholder',
      passed: !isPlaceholderPhone(data.phone),
      reason: isPlaceholderPhone(data.phone) ? 'Test/placeholder telefoonnummer gedetecteerd' : undefined,
      blocking: false, // We accept but flag for follow-up
    });
    
    checks.push({
      name: 'phone_valid_format',
      passed: isValidDutchPhone(data.phone),
      reason: isValidDutchPhone(data.phone) ? undefined : 'Telefoonnummer heeft geen geldig Nederlands formaat',
      blocking: false,
    });
  }
  
  // 3. Name checks (non-blocking)
  if (data.name) {
    checks.push({
      name: 'name_not_placeholder',
      passed: !isPlaceholderName(data.name),
      reason: isPlaceholderName(data.name) ? 'Test/placeholder naam gedetecteerd' : undefined,
      blocking: false,
    });
    
    checks.push({
      name: 'name_length',
      passed: data.name.trim().length >= 2,
      reason: data.name.trim().length < 2 ? 'Naam te kort' : undefined,
      blocking: false,
    });
  }
  
  // 4. CV checks
  if (data.cvFileName) {
    checks.push({
      name: 'cv_extension_valid',
      passed: hasValidDocumentExtension(data.cvFileName),
      reason: hasValidDocumentExtension(data.cvFileName) ? undefined : 'CV heeft ongeldig bestandstype',
      blocking: false,
    });
  }
  
  // 5. Document checks
  if (data.documents && data.documents.length > 0) {
    const invalidDocs = data.documents.filter(doc => !hasValidDocumentExtension(doc.filename));
    
    checks.push({
      name: 'documents_valid_types',
      passed: invalidDocs.length === 0,
      reason: invalidDocs.length > 0 ? `${invalidDocs.length} document(en) hebben ongeldig bestandstype` : undefined,
      blocking: false,
    });
    
    // Check for empty/tiny files
    const emptyDocs = data.documents.filter(doc => doc.size !== undefined && doc.size < 100);
    checks.push({
      name: 'documents_not_empty',
      passed: emptyDocs.length === 0,
      reason: emptyDocs.length > 0 ? `${emptyDocs.length} document(en) lijken leeg of beschadigd` : undefined,
      blocking: false,
    });
  }
  
  // Compile results
  const blockingIssues = checks.filter(c => !c.passed && c.blocking).map(c => c.reason!);
  const warnings = checks.filter(c => !c.passed && !c.blocking).map(c => c.reason!);
  
  return {
    passed: blockingIssues.length === 0,
    checks,
    blockingIssues,
    warnings,
  };
}

/**
 * Quick check for duplicates based on email
 * Returns the existing application ID if found
 */
export async function checkDuplicateEmail(
  supabaseClient: any,
  email: string,
  hoursWindow: number = 24
): Promise<string | null> {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - hoursWindow);
  
  const { data, error } = await supabaseClient
    .from('professional_applications')
    .select('id')
    .eq('email_from', email.toLowerCase().trim())
    .is('deleted_at', null)
    .gte('created_at', windowStart.toISOString())
    .limit(1)
    .maybeSingle();
  
  if (error || !data) return null;
  return data.id;
}

/**
 * Format validation result as a summary string
 */
export function formatValidationSummary(result: PreValidationResult): string {
  if (result.passed && result.warnings.length === 0) {
    return 'Alle validatie checks geslaagd';
  }
  
  const parts: string[] = [];
  
  if (result.blockingIssues.length > 0) {
    parts.push(`❌ Blokkerende issues: ${result.blockingIssues.join(', ')}`);
  }
  
  if (result.warnings.length > 0) {
    parts.push(`⚠️ Waarschuwingen: ${result.warnings.join(', ')}`);
  }
  
  return parts.join('\n');
}
