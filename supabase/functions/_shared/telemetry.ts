/**
 * TELEMETRY MODULE - Privacy-compliant logging for AI learning
 * Implements PII anonymization to protect user data in logs and learning events
 */

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ============================================
// PII PATTERNS - Dutch & International
// ============================================
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // Email addresses
  { 
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    replacement: '[EMAIL]',
    name: 'email'
  },
  // Dutch phone numbers (various formats)
  { 
    pattern: /\b(?:\+31|0031|0)[\s.-]?(?:[1-9]\d{1,2})[\s.-]?(?:\d{2,3})[\s.-]?(?:\d{2,4})\b/g,
    replacement: '[TELEFOON]',
    name: 'phone'
  },
  // International phone (generic)
  { 
    pattern: /\b\+?[1-9]\d{1,2}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
    replacement: '[TELEFOON]',
    name: 'phone_intl'
  },
  // Dutch BSN (Burger Service Nummer) - 9 digits
  { 
    pattern: /\b\d{9}\b/g,
    replacement: '[BSN]',
    name: 'bsn'
  },
  // Dutch postcodes (1234 AB format)
  { 
    pattern: /\b[1-9]\d{3}\s?[A-Za-z]{2}\b/g,
    replacement: '[POSTCODE]',
    name: 'postcode'
  },
  // IBAN numbers
  { 
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b/gi,
    replacement: '[IBAN]',
    name: 'iban'
  },
  // Credit card numbers (basic patterns)
  { 
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CREDITCARD]',
    name: 'creditcard'
  },
  // Dutch names (common first names - case insensitive)
  { 
    pattern: /\b(?:Jan|Piet|Klaas|Marie|Anna|Emma|Sophie|Lucas|Daan|Sem|Lieke|Julia|Sara|Eva|Lotte|Lisa|Sanne|Fleur|Mila|Tessa|Nina|Isa|Amy|Noa|Lynn|Evi|Roos|Floor|Fem|Jasmijn|Olivia|Yara|Naomi|Milou|Amber|Lana|Bo|Lina|Fenna|Zoë|Lot|Maud|Sarah|Lauren|Noor|Merel|Silke|Anne|Vera|Lara|Hannah|Elise|Thomas|Luuk|Jesse|Tim|Lars|Bram|Max|Finn|Ruben|Thijs|Milan|Stijn|Noah|Jayden|Julian|Sven|Niels|Joris|Rick|Dylan|Jens|Levi|Mees|Sam|Floris|Cas|Tijn|Gijs|Ties|Pepijn)\b/gi,
    replacement: '[NAAM]',
    name: 'dutch_name'
  },
  // IP addresses
  { 
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP]',
    name: 'ip'
  },
  // Dates of birth patterns (DD-MM-YYYY, DD/MM/YYYY)
  { 
    pattern: /\b(?:0[1-9]|[12]\d|3[01])[-\/](?:0[1-9]|1[0-2])[-\/](?:19|20)\d{2}\b/g,
    replacement: '[GEBOORTEDATUM]',
    name: 'dob'
  }
];

// ============================================
// PII ANONYMIZATION
// ============================================

/**
 * Anonymize PII in text or object
 * @param input - String or object to anonymize
 * @returns Anonymized version with PII replaced by placeholders
 */
export function anonymizePII(input: string | Record<string, unknown>): string | Record<string, unknown> {
  if (typeof input === 'string') {
    return anonymizeString(input);
  }
  
  if (typeof input === 'object' && input !== null) {
    return anonymizeObject(input);
  }
  
  return input;
}

function anonymizeString(text: string): string {
  let result = text;
  
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  
  return result;
}

function anonymizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = anonymizeString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'string' ? anonymizeString(item) :
        typeof item === 'object' && item !== null ? anonymizeObject(item as Record<string, unknown>) :
        item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = anonymizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Check if text contains potential PII
 */
export function containsPII(text: string): boolean {
  for (const { pattern } of PII_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  return false;
}

/**
 * Get list of PII types found in text
 */
export function detectPIITypes(text: string): string[] {
  const found: string[] = [];
  
  for (const { pattern, name } of PII_PATTERNS) {
    if (pattern.test(text)) {
      found.push(name);
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  
  return [...new Set(found)];
}

// ============================================
// STRUCTURED LEARNING EVENTS
// ============================================

export interface LearningEvent {
  event_type: string;
  knowledge_id?: string;
  org_id?: string;
  user_id?: string;
  trigger_type: 'user_feedback' | 'auto_detected' | 'scheduled' | 'system';
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  confidence_delta?: number;
  tokens_used?: number;
  processing_time_ms?: number;
  model_used?: string;
  success: boolean;
  error_message?: string;
}

/**
 * Create structured learning event with PII anonymization
 */
export function createLearningEvent(
  eventType: string,
  triggerType: LearningEvent['trigger_type'],
  inputData: Record<string, unknown>,
  outputData: Record<string, unknown>,
  options: Partial<LearningEvent> = {}
): LearningEvent {
  return {
    event_type: eventType,
    trigger_type: triggerType,
    input_data: anonymizeObject(inputData) as Record<string, unknown>,
    output_data: anonymizeObject(outputData) as Record<string, unknown>,
    success: true,
    ...options
  };
}

/**
 * Log learning event to database
 */
export async function logLearningEvent(
  supabase: SupabaseClient,
  event: LearningEvent
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('ai_learning_events')
      .insert({
        event_type: event.event_type,
        knowledge_id: event.knowledge_id,
        org_id: event.org_id,
        user_id: event.user_id,
        trigger_type: event.trigger_type,
        input_data: event.input_data,
        output_data: event.output_data,
        confidence_delta: event.confidence_delta,
        tokens_used: event.tokens_used,
        processing_time_ms: event.processing_time_ms,
        model_used: event.model_used,
        success: event.success,
        error_message: event.error_message
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('❌ Failed to log learning event:', error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true, id: data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('❌ Failed to log learning event:', msg);
    return { success: false, error: msg };
  }
}

// ============================================
// FUNCTION CALL LOGGING
// ============================================

export interface FunctionCallLog {
  function_name: string;
  org_id?: string;
  user_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  model_used?: string;
  execution_time_ms: number;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log function call to database (for budget tracking)
 */
export async function logFunctionCall(
  supabase: SupabaseClient,
  log: FunctionCallLog
): Promise<void> {
  try {
    await supabase.from('function_call_logs').insert({
      function_name: log.function_name,
      org_id: log.org_id,
      user_id: log.user_id,
      input_tokens: log.input_tokens,
      output_tokens: log.output_tokens,
      total_tokens: log.total_tokens,
      model_used: log.model_used,
      execution_time_ms: log.execution_time_ms,
      success: log.success,
      error_message: log.error_message,
      metadata: log.metadata
    });
  } catch (e) {
    console.error('⚠️ Failed to log function call:', e);
  }
}
