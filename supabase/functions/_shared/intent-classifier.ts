/**
 * Intent Classifier Module - Fase 1: Quick Wins
 * 
 * Centrale classificatie van email intents met:
 * - Urgentie/frustratie detectie
 * - Cooldown bypass logic
 * - Audit logging
 */

// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

export type IntentType = 
  | 'slot_selection'
  | 'slot_rejection'
  | 'question'
  | 'document_upload'
  | 'frustration'
  | 'urgency'
  | 'confirmation'
  | 'cancellation'
  | 'availability_update'
  | 'general_reply'
  | 'unknown';

export interface IntentScore {
  intent: IntentType;
  confidence: number;
  indicators: string[];
}

export interface IntentClassificationResult {
  detectedIntents: IntentScore[];
  primaryIntent: IntentType;
  primaryConfidence: number;
  isUrgent: boolean;
  urgencyScore: number;
  frustrationIndicators: string[];
  bypassCooldown: boolean;
  processingTimeMs: number;
}

// Frustration/urgency indicators met gewichten
const FRUSTRATION_INDICATORS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Hoge urgentie
  { pattern: /waarom.*(geen|niks|niet).*(reactie|antwoord|terug)/i, weight: 0.9, label: 'waarom_geen_reactie' },
  { pattern: /hoor\s+ik\s+(niks|niets)\s+terug/i, weight: 0.9, label: 'hoor_niks_terug' },
  { pattern: /wacht\s+(al\s+)?(lang|dagen|weken)/i, weight: 0.85, label: 'wacht_lang' },
  { pattern: /geen\s+(reactie|antwoord)\s+(gehad|gekregen|ontvangen)/i, weight: 0.85, label: 'geen_reactie_gehad' },
  { pattern: /dringend|urgent|spoed|asap|zsm|zo\s+snel\s+mogelijk/i, weight: 0.9, label: 'urgentie_woord' },
  
  // Medium urgentie
  { pattern: /wanneer\s+(krijg|hoor|kom)/i, weight: 0.6, label: 'wanneer_vraag' },
  { pattern: /status|update|voortgang/i, weight: 0.5, label: 'status_vraag' },
  { pattern: /nog\s+(steeds|altijd)\s+wacht/i, weight: 0.7, label: 'nog_steeds_wacht' },
  
  // Frustratie
  { pattern: /gefrustreerd|teleurgesteld|boos|geïrriteerd/i, weight: 0.95, label: 'emotie_woord' },
  { pattern: /slecht(e)?\s+(service|communicatie|ervaring)/i, weight: 0.9, label: 'slechte_ervaring' },
  { pattern: /onprofessioneel/i, weight: 0.9, label: 'onprofessioneel' },
  { pattern: /!{2,}/i, weight: 0.4, label: 'uitroeptekens' },
  { pattern: /\?\?+/i, weight: 0.3, label: 'vraagtekens' },
  { pattern: /CAPS\s+LOCK|[A-Z]{10,}/i, weight: 0.5, label: 'caps_lock' },
];

// Intent detection patterns
const INTENT_PATTERNS: Array<{ intent: IntentType; pattern: RegExp; weight: number }> = [
  // Slot selection
  { intent: 'slot_selection', pattern: /^[1-6](?:\.\d+)?[\s:,.!?]*$/im, weight: 0.95 },
  { intent: 'slot_selection', pattern: /(?:optie|slot|keuze|moment)\s*[1-6]/i, weight: 0.85 },
  { intent: 'slot_selection', pattern: /(?:de\s+)?(eerste|tweede|derde|vierde|vijfde)/i, weight: 0.8 },
  { intent: 'slot_selection', pattern: /(?:graag|kies|neem)\s+(?:optie\s+)?[1-6]/i, weight: 0.85 },
  
  // Slot rejection
  { intent: 'slot_rejection', pattern: /geen\s+van\s+(de|deze)/i, weight: 0.9 },
  { intent: 'slot_rejection', pattern: /andere\s+(tijden|momenten|opties)/i, weight: 0.85 },
  { intent: 'slot_rejection', pattern: /niet\s+mogelijk|kan\s+niet|lukt\s+niet/i, weight: 0.7 },
  { intent: 'slot_rejection', pattern: /allemaal\s+(verhinderd|bezet|vol)/i, weight: 0.9 },
  
  // Document upload
  { intent: 'document_upload', pattern: /(?:bijlage|bijgevoegd|attached|attachment)/i, weight: 0.9 },
  { intent: 'document_upload', pattern: /(?:cv|vog|diploma|certificaat)\s+(?:bijgevoegd|gestuurd)/i, weight: 0.95 },
  
  // Question
  { intent: 'question', pattern: /\?{1,3}$/m, weight: 0.6 },
  { intent: 'question', pattern: /(?:hoe|wat|waar|wanneer|waarom|wie|welke)\s+/i, weight: 0.7 },
  { intent: 'question', pattern: /kan\s+(?:ik|u|je)\s+/i, weight: 0.5 },
  
  // Confirmation
  { intent: 'confirmation', pattern: /(?:ja|yes|akkoord|ok|oke|prima|goed|klopt)/i, weight: 0.6 },
  { intent: 'confirmation', pattern: /bevestig|confirm/i, weight: 0.8 },
  
  // Cancellation
  { intent: 'cancellation', pattern: /(?:annuleer|cancel|afzeggen|intrekken)/i, weight: 0.9 },
  { intent: 'cancellation', pattern: /niet\s+meer\s+geïnteresseerd/i, weight: 0.95 },
  { intent: 'cancellation', pattern: /stop|ophouden/i, weight: 0.5 },
  
  // Availability update
  { intent: 'availability_update', pattern: /beschikbaar(?:heid)?/i, weight: 0.7 },
  { intent: 'availability_update', pattern: /(?:dagen|uren|tijd)\s+(?:per\s+week|beschikbaar)/i, weight: 0.8 },
];

/**
 * Detecteer frustratie en urgentie in email content
 */
export function detectFrustrationAndUrgency(content: string): {
  isUrgent: boolean;
  urgencyScore: number;
  indicators: string[];
} {
  const matchedIndicators: string[] = [];
  let totalWeight = 0;
  
  for (const indicator of FRUSTRATION_INDICATORS) {
    if (indicator.pattern.test(content)) {
      matchedIndicators.push(indicator.label);
      totalWeight += indicator.weight;
    }
  }
  
  // Normalize score to 0-1 range
  const urgencyScore = Math.min(1, totalWeight / 2);
  const isUrgent = urgencyScore >= 0.6;
  
  return { isUrgent, urgencyScore, indicators: matchedIndicators };
}

/**
 * Classificeer alle intents in de email content
 */
export function classifyIntents(content: string): IntentScore[] {
  const intentScores: Map<IntentType, IntentScore> = new Map();
  
  for (const pattern of INTENT_PATTERNS) {
    if (pattern.pattern.test(content)) {
      const existing = intentScores.get(pattern.intent);
      if (!existing || existing.confidence < pattern.weight) {
        intentScores.set(pattern.intent, {
          intent: pattern.intent,
          confidence: pattern.weight,
          indicators: [pattern.pattern.toString()],
        });
      } else if (existing.confidence === pattern.weight) {
        existing.indicators.push(pattern.pattern.toString());
      }
    }
  }
  
  // Add frustration as an intent if detected
  const frustration = detectFrustrationAndUrgency(content);
  if (frustration.isUrgent) {
    intentScores.set('frustration', {
      intent: 'frustration',
      confidence: frustration.urgencyScore,
      indicators: frustration.indicators,
    });
  }
  
  // Sort by confidence
  const sortedIntents = Array.from(intentScores.values()).sort((a, b) => b.confidence - a.confidence);
  
  // If no intents detected, return general_reply
  if (sortedIntents.length === 0) {
    return [{ intent: 'general_reply', confidence: 0.5, indicators: [] }];
  }
  
  return sortedIntents;
}

/**
 * Bepaal of anti-spam cooldown moet worden genegeerd
 */
export function shouldBypassCooldown(
  urgencyScore: number,
  lastResponseAt: Date | null,
  responseCount: number
): boolean {
  // Altijd bypass bij hoge urgentie
  if (urgencyScore >= 0.8) return true;
  
  // Geen eerdere responses -> geen cooldown nodig
  if (!lastResponseAt || responseCount === 0) return true;
  
  // Medium urgentie + meer dan 4 uur sinds laatste response
  const hoursSinceLastResponse = (Date.now() - lastResponseAt.getTime()) / (1000 * 60 * 60);
  if (urgencyScore >= 0.6 && hoursSinceLastResponse > 4) return true;
  
  return false;
}

/**
 * Log intent classificatie naar audit table
 */
export async function logIntentClassificationAudit(
  supabase: SupabaseClient,
  applicationId: string,
  emailId: string | undefined,
  content: string,
  result: IntentClassificationResult,
  orgId?: string
): Promise<void> {
  try {
    const { error } = await supabase.from('intent_classification_audit').insert({
      application_id: applicationId,
      email_id: emailId,
      stripped_content: content.substring(0, 2000),
      content_length: content.length,
      detected_intents: result.detectedIntents,
      primary_intent: result.primaryIntent,
      primary_confidence: result.primaryConfidence,
      is_urgent: result.isUrgent,
      urgency_score: result.urgencyScore,
      frustration_indicators: result.frustrationIndicators,
      bypass_cooldown: result.bypassCooldown,
      processing_time_ms: result.processingTimeMs,
      org_id: orgId,
    });
    
    if (error) {
      console.error('❌ Error logging intent classification audit:', error);
    } else {
      console.log('✅ Intent classification audit logged successfully');
    }
  } catch (err) {
    console.error('❌ Exception logging intent classification audit:', err);
  }
}

/**
 * Main classification function
 */
export async function classifyEmailIntent(
  supabase: SupabaseClient,
  content: string,
  applicationId: string,
  emailId?: string,
  lastResponseAt?: Date | null,
  responseCount?: number,
  orgId?: string
): Promise<IntentClassificationResult> {
  const startTime = Date.now();
  
  // Step 1: Classify all intents
  const detectedIntents = classifyIntents(content);
  const primaryIntent = detectedIntents[0];
  
  // Step 2: Detect frustration/urgency
  const frustration = detectFrustrationAndUrgency(content);
  
  // Step 3: Determine cooldown bypass
  const bypassCooldown = shouldBypassCooldown(
    frustration.urgencyScore,
    lastResponseAt ?? null,
    responseCount ?? 0
  );
  
  const result: IntentClassificationResult = {
    detectedIntents,
    primaryIntent: primaryIntent.intent,
    primaryConfidence: primaryIntent.confidence,
    isUrgent: frustration.isUrgent,
    urgencyScore: frustration.urgencyScore,
    frustrationIndicators: frustration.indicators,
    bypassCooldown,
    processingTimeMs: Date.now() - startTime,
  };
  
  console.log(`🎯 Intent classification: primary=${result.primaryIntent} (${result.primaryConfidence}), urgent=${result.isUrgent}, bypass=${result.bypassCooldown}`);
  
  // Step 4: Log to audit table
  await logIntentClassificationAudit(supabase, applicationId, emailId, content, result, orgId);
  
  return result;
}
