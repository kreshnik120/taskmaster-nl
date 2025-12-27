/**
 * Slot Detection Module - Fase 1: Quick Wins
 * 
 * Geïsoleerde module voor interview slot detectie met:
 * - Confidence scoring
 * - Audit logging
 * - Meerdere detectie strategieën
 */

// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

export interface SlotDetectionResult {
  detectedSlot: number | null;
  confidence: number;
  method: 'regex' | 'ai' | 'confirmation_requested' | 'none';
  requiresConfirmation: boolean;
  regexResult: number | null;
  aiResult: number | null;
  aiConfidence: number;
  processingTimeMs: number;
}

export interface SlotDetectionInput {
  rawEmailText: string;
  strippedReply: string;
  offeredSlots: Array<{ date: string; time: string }>;
  applicationId: string;
  emailId?: string;
  messageId?: string;
  orgId?: string;
}

// Confidence thresholds
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.9,      // Direct bevestiging zonder check
  MEDIUM: 0.7,    // Bevestig met AI check
  LOW: 0.5,       // Vraag bevestiging aan kandidaat
  REJECT: 0.3,    // Te laag, behandel als geen selectie
};

/**
 * Strip quoted email content om alleen het antwoord van de kandidaat te krijgen
 */
export function stripQuotedContent(emailBody: string): string {
  if (!emailBody) return '';
  
  const lines = emailBody.split('\n');
  const cleanLines: string[] = [];
  
  for (const line of lines) {
    // Stop bij quote markers
    if (line.match(/^(>|_{3,}|─{3,}|Van:|From:|Op \d|On \d|Verzonden:|Sent:|-----Original|Oorspronkelijk bericht)/i)) {
      break;
    }
    // Skip embedded image references
    if (line.match(/^\[cid:/)) continue;
    // Skip lege Outlook signature blocks
    if (line.match(/^(\[|\<)?(image\d+|signature)/i)) continue;
    
    cleanLines.push(line);
  }
  
  return cleanLines.join('\n').trim();
}

/**
 * Regex-based slot detectie met confidence scoring
 */
export function detectSlotWithRegex(text: string, slotCount: number): { slot: number | null; confidence: number; pattern: string | null } {
  if (!text || slotCount === 0) return { slot: null, confidence: 0, pattern: null };
  
  const trimmed = text.trim().toLowerCase();
  
  // Pattern 1: Alleen een nummer (hoogste confidence)
  const simpleNumberMatch = trimmed.match(/^(\d)(?:\.\d+)?[\s:,.!?]*$/);
  if (simpleNumberMatch) {
    const num = parseInt(simpleNumberMatch[1]);
    if (num >= 1 && num <= slotCount) {
      return { slot: num, confidence: 0.95, pattern: 'simple_number' };
    }
  }
  
  // Pattern 1b: Nummer op eerste regel
  const firstLineMatch = trimmed.split('\n')[0].trim().match(/^(\d)(?:\.\d+)?[\s:,.!?]*$/);
  if (firstLineMatch) {
    const num = parseInt(firstLineMatch[1]);
    if (num >= 1 && num <= slotCount) {
      return { slot: num, confidence: 0.9, pattern: 'first_line_number' };
    }
  }
  
  // Pattern 2: "optie X", "slot X", etc.
  const optionPattern = /(?:optie|slot|nummer|keuze|moment|mogelijkheid)\s*(\d)/i;
  const optionMatch = trimmed.match(optionPattern);
  if (optionMatch) {
    const num = parseInt(optionMatch[1]);
    if (num >= 1 && num <= slotCount) {
      return { slot: num, confidence: 0.85, pattern: 'option_keyword' };
    }
  }
  
  // Pattern 3: Ordinalen
  const ordinalMap: Record<string, number> = {
    'eerste': 1, 'een': 1, '1e': 1, '1ste': 1,
    'tweede': 2, 'twee': 2, '2e': 2, '2de': 2,
    'derde': 3, 'drie': 3, '3e': 3, '3de': 3,
    'vierde': 4, 'vier': 4, '4e': 4, '4de': 4,
    'vijfde': 5, 'vijf': 5, '5e': 5, '5de': 5,
    'zesde': 6, 'zes': 6, '6e': 6, '6de': 6,
  };
  const ordinalPattern = /(?:de\s+)?(eerste|tweede|derde|vierde|vijfde|zesde|\d+e|\d+ste|\d+de)/i;
  const ordinalMatch = trimmed.match(ordinalPattern);
  if (ordinalMatch) {
    const ordinal = ordinalMatch[1].toLowerCase();
    const num = ordinalMap[ordinal];
    if (num && num >= 1 && num <= slotCount) {
      return { slot: num, confidence: 0.8, pattern: 'ordinal' };
    }
  }
  
  // Pattern 4: "graag X", "kies X", etc.
  const preferencePattern = /(?:graag|kies|wordt|neem|wil)\s+(?:optie\s+)?(\d)/i;
  const prefMatch = trimmed.match(preferencePattern);
  if (prefMatch) {
    const num = parseInt(prefMatch[1]);
    if (num >= 1 && num <= slotCount) {
      return { slot: num, confidence: 0.75, pattern: 'preference' };
    }
  }
  
  // Pattern 5: Datum/tijd matching (medium confidence)
  // TODO: Implement date matching against offered slots
  
  return { slot: null, confidence: 0, pattern: null };
}

/**
 * Combine regex + AI results met weighted confidence
 */
export function combineDetectionResults(
  regexResult: { slot: number | null; confidence: number },
  aiResult: { slot: number | null; confidence: number }
): SlotDetectionResult {
  const startTime = Date.now();
  
  // Als beide hetzelfde slot detecteren -> hoge confidence
  if (regexResult.slot !== null && aiResult.slot !== null && regexResult.slot === aiResult.slot) {
    const combinedConfidence = Math.min(0.98, (regexResult.confidence + aiResult.confidence) / 2 + 0.1);
    return {
      detectedSlot: regexResult.slot,
      confidence: combinedConfidence,
      method: 'regex',
      requiresConfirmation: false,
      regexResult: regexResult.slot,
      aiResult: aiResult.slot,
      aiConfidence: aiResult.confidence,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  // Alleen regex heeft resultaat met hoge confidence
  if (regexResult.slot !== null && regexResult.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return {
      detectedSlot: regexResult.slot,
      confidence: regexResult.confidence,
      method: 'regex',
      requiresConfirmation: false,
      regexResult: regexResult.slot,
      aiResult: aiResult.slot,
      aiConfidence: aiResult.confidence,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  // AI heeft resultaat met hoge confidence
  if (aiResult.slot !== null && aiResult.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return {
      detectedSlot: aiResult.slot,
      confidence: aiResult.confidence,
      method: 'ai',
      requiresConfirmation: false,
      regexResult: regexResult.slot,
      aiResult: aiResult.slot,
      aiConfidence: aiResult.confidence,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  // Conflict tussen regex en AI -> vraag bevestiging
  if (regexResult.slot !== null && aiResult.slot !== null && regexResult.slot !== aiResult.slot) {
    const bestResult = regexResult.confidence >= aiResult.confidence ? regexResult : aiResult;
    return {
      detectedSlot: bestResult.slot,
      confidence: bestResult.confidence * 0.8, // Penalty voor conflict
      method: 'confirmation_requested',
      requiresConfirmation: true,
      regexResult: regexResult.slot,
      aiResult: aiResult.slot,
      aiConfidence: aiResult.confidence,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  // Eén van beide heeft medium confidence
  const bestResult = regexResult.slot !== null ? regexResult : aiResult;
  if (bestResult.slot !== null && bestResult.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return {
      detectedSlot: bestResult.slot,
      confidence: bestResult.confidence,
      method: regexResult.slot !== null ? 'regex' : 'ai',
      requiresConfirmation: bestResult.confidence < CONFIDENCE_THRESHOLDS.HIGH,
      regexResult: regexResult.slot,
      aiResult: aiResult.slot,
      aiConfidence: aiResult.confidence,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  // Lage of geen confidence -> geen detectie
  return {
    detectedSlot: null,
    confidence: 0,
    method: 'none',
    requiresConfirmation: false,
    regexResult: regexResult.slot,
    aiResult: aiResult.slot,
    aiConfidence: aiResult.confidence,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Log slot detectie resultaat naar audit table
 */
export async function logSlotDetectionAudit(
  supabase: SupabaseClient,
  input: SlotDetectionInput,
  result: SlotDetectionResult
): Promise<void> {
  try {
    const { error } = await supabase.from('slot_detection_audit').insert({
      application_id: input.applicationId,
      email_id: input.emailId,
      message_id: input.messageId,
      raw_email_text: input.rawEmailText.substring(0, 5000), // Limit size
      stripped_reply: input.strippedReply.substring(0, 2000),
      offered_slots: input.offeredSlots,
      regex_result: result.regexResult,
      ai_result: result.aiResult,
      ai_confidence: result.aiConfidence,
      final_result: result.detectedSlot,
      detection_method: result.method,
      processing_time_ms: result.processingTimeMs,
      org_id: input.orgId,
    });
    
    if (error) {
      console.error('❌ Error logging slot detection audit:', error);
    } else {
      console.log('✅ Slot detection audit logged successfully');
    }
  } catch (err) {
    console.error('❌ Exception logging slot detection audit:', err);
  }
}

/**
 * Main detection function - combines all strategies
 */
export async function detectInterviewSlot(
  supabase: SupabaseClient,
  input: SlotDetectionInput,
  aiAnalysisResult?: { selected_slot_index?: number; confidence?: number }
): Promise<SlotDetectionResult> {
  const startTime = Date.now();
  
  // Step 1: Regex detection
  const regexResult = detectSlotWithRegex(input.strippedReply, input.offeredSlots.length);
  console.log(`🎯 Regex detection: slot=${regexResult.slot}, confidence=${regexResult.confidence}, pattern=${regexResult.pattern}`);
  
  // Step 2: Get AI result (passed in from existing AI analysis)
  const aiResult = {
    slot: aiAnalysisResult?.selected_slot_index ?? null,
    confidence: aiAnalysisResult?.confidence ?? 0,
  };
  console.log(`🤖 AI detection: slot=${aiResult.slot}, confidence=${aiResult.confidence}`);
  
  // Step 3: Combine results
  const combinedResult = combineDetectionResults(regexResult, aiResult);
  combinedResult.processingTimeMs = Date.now() - startTime;
  
  console.log(`📊 Combined result: slot=${combinedResult.detectedSlot}, confidence=${combinedResult.confidence}, method=${combinedResult.method}, requiresConfirmation=${combinedResult.requiresConfirmation}`);
  
  // Step 4: Log to audit table
  await logSlotDetectionAudit(supabase, input, combinedResult);
  
  return combinedResult;
}
