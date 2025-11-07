/**
 * Response Validation
 * Validates AI response BEFORE streaming to user
 * Checks: fact-sourcing, contradictions, completeness
 */

interface ValidationResult {
  passed: boolean;
  completenessScore: number;
  accuracyScore: number;
  coverageScore: number;
  issues: {
    missingAspects: string[];
    contradictions: string[];
    unsourcedFacts: string[];
  };
  shouldRetry: boolean;
  improvementSuggestions: string[];
}

/**
 * Validate response against knowledge used
 */
export async function validateResponse(
  question: string,
  response: string,
  knowledgeUsed: any[],
  supabase: any,
  orgId: string
): Promise<ValidationResult> {
  const startTime = Date.now();
  
  console.log('🔍 Validating AI response...');

  // Quick validation checks first
  const issues = {
    missingAspects: [] as string[],
    contradictions: [] as string[],
    unsourcedFacts: [] as string[]
  };

  // 1. Completeness check: Does response address all parts of the question?
  const completenessScore = await checkCompleteness(question, response);
  
  // 2. Accuracy check: Are facts backed by sources?
  const accuracyScore = await checkAccuracy(response, knowledgeUsed);
  
  // 3. Coverage check: Did we use relevant knowledge?
  const coverageScore = checkCoverage(question, knowledgeUsed);

  // Detect specific issues
  if (completenessScore < 0.7) {
    issues.missingAspects.push('Response may not fully address the question');
  }

  if (accuracyScore < 0.6) {
    issues.unsourcedFacts.push('Response contains claims without clear source attribution');
  }

  if (coverageScore < 0.5) {
    issues.missingAspects.push('Insufficient knowledge base coverage for this question');
  }

  // Check for contradictions between sources
  const contradictions = detectContradictions(knowledgeUsed);
  if (contradictions.length > 0) {
    issues.contradictions.push(...contradictions);
  }

  // Determine if validation passed
  const overallScore = (completenessScore + accuracyScore + coverageScore) / 3;
  const passed = overallScore >= 0.7 && issues.contradictions.length === 0;

  // Generate improvement suggestions
  const improvementSuggestions: string[] = [];
  if (completenessScore < 0.7) {
    improvementSuggestions.push('Expand response to cover all aspects of the question');
  }
  if (accuracyScore < 0.7) {
    improvementSuggestions.push('Add explicit source references for key facts');
  }
  if (issues.contradictions.length > 0) {
    improvementSuggestions.push('Resolve contradictions between sources before responding');
  }

  const validationTime = Date.now() - startTime;
  console.log(`✅ Validation complete in ${validationTime}ms (score: ${overallScore.toFixed(2)})`);

  // Log validation to database (async, non-blocking)
  logValidation(
    supabase,
    orgId,
    question,
    response,
    knowledgeUsed.map((kb: any) => kb.id || kb.knowledge_id),
    {
      passed,
      completenessScore,
      accuracyScore,
      coverageScore,
      issues,
      validationTime
    }
  ).catch(err => console.error('Failed to log validation:', err));

  return {
    passed,
    completenessScore,
    accuracyScore,
    coverageScore,
    issues,
    shouldRetry: !passed && overallScore < 0.6,
    improvementSuggestions
  };
}

/**
 * Check if response fully addresses the question
 */
async function checkCompleteness(question: string, response: string): Promise<number> {
  // Extract key question aspects
  const questionWords = question.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3 && !['waar', 'wanneer', 'welke', 'hoeveel'].includes(w));

  if (questionWords.length === 0) return 0.8; // Short question, hard to assess

  // Check how many question aspects are addressed in response
  const responseLower = response.toLowerCase();
  let addressedCount = 0;

  for (const word of questionWords) {
    if (responseLower.includes(word) || 
        responseLower.includes(word.slice(0, -1)) || // Stemming approximation
        responseLower.includes(word + 'en')) {
      addressedCount++;
    }
  }

  const completeness = addressedCount / questionWords.length;

  // Penalty for very short responses
  if (response.length < 100) {
    return completeness * 0.7;
  }

  return completeness;
}

/**
 * Check if response facts are backed by knowledge sources
 */
async function checkAccuracy(response: string, knowledgeUsed: any[]): Promise<number> {
  if (knowledgeUsed.length === 0) {
    return 0.3; // No sources = low accuracy confidence
  }

  // Extract claims from response (sentences with factual content)
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  if (sentences.length === 0) return 0.5;

  let sourcedCount = 0;

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    
    // Check if sentence contains info from knowledge base
    for (const kb of knowledgeUsed) {
      const kbText = JSON.stringify(kb.value || {}).toLowerCase();
      const kbKey = (kb.key || '').toLowerCase();
      
      // Simple word overlap check
      const sentenceWords = sentenceLower.split(/\W+/).filter(w => w.length > 3);
      const kbWords = (kbText + ' ' + kbKey).split(/\W+/).filter(w => w.length > 3);
      
      const overlap = sentenceWords.filter(w => kbWords.includes(w)).length;
      if (overlap >= 2) {
        sourcedCount++;
        break;
      }
    }
  }

  return Math.min(1.0, sourcedCount / sentences.length);
}

/**
 * Check if knowledge base has good coverage for the question
 */
function checkCoverage(question: string, knowledgeUsed: any[]): number {
  if (knowledgeUsed.length === 0) return 0.2;

  // More knowledge items used = better coverage
  const itemScore = Math.min(1.0, knowledgeUsed.length / 5); // Ideal: 5+ items

  // Higher confidence items = better coverage
  const avgConfidence = knowledgeUsed.reduce((sum, kb) => {
    return sum + (kb.confidence_score || kb.similarity || 0.5);
  }, 0) / knowledgeUsed.length;

  return (itemScore + avgConfidence) / 2;
}

/**
 * Detect contradictions between knowledge items
 */
function detectContradictions(knowledgeUsed: any[]): string[] {
  const contradictions: string[] = [];

  // Check for items with same key but different values
  const keyGroups = new Map<string, any[]>();

  for (const kb of knowledgeUsed) {
    const key = kb.key || '';
    if (!keyGroups.has(key)) {
      keyGroups.set(key, []);
    }
    keyGroups.get(key)!.push(kb);
  }

  for (const [key, items] of keyGroups.entries()) {
    if (items.length > 1) {
      // Check if values differ significantly
      const values = items.map(item => JSON.stringify(item.value || {}));
      const uniqueValues = new Set(values);
      
      if (uniqueValues.size > 1) {
        contradictions.push(`Conflicting values found for "${key}"`);
      }
    }
  }

  return contradictions;
}

/**
 * Log validation result to database (async)
 */
async function logValidation(
  supabase: any,
  orgId: string,
  question: string,
  response: string,
  knowledgeIds: string[],
  validation: {
    passed: boolean;
    completenessScore: number;
    accuracyScore: number;
    coverageScore: number;
    issues: any;
    validationTime: number;
  }
): Promise<void> {
  try {
    const { error } = await supabase
      .from('response_validations')
      .insert({
        org_id: orgId,
        question: question.substring(0, 1000), // Limit length
        ai_response: response.substring(0, 2000),
        knowledge_ids: knowledgeIds,
        validation_passed: validation.passed,
        completeness_score: validation.completenessScore,
        accuracy_score: validation.accuracyScore,
        coverage_score: validation.coverageScore,
        missing_aspects: validation.issues.missingAspects,
        contradictions_found: validation.issues.contradictions,
        unsourced_facts: validation.issues.unsourcedFacts,
        validation_time_ms: validation.validationTime
      });

    if (error) {
      console.error('Failed to log validation:', error);
    }
  } catch (err) {
    console.error('Exception logging validation:', err);
  }
}

/**
 * Improve prompt based on validation issues
 */
export function addValidationContext(
  originalPrompt: string,
  issues: ValidationResult['issues']
): string {
  let improvementContext = '\n\n⚠️ VERBETER JE ANTWOORD:\n';

  if (issues.missingAspects.length > 0) {
    improvementContext += '- Dek alle aspecten van de vraag af\n';
  }

  if (issues.contradictions.length > 0) {
    improvementContext += '- Los tegenstrijdigheden tussen bronnen op\n';
    improvementContext += `  Tegenstrijdigheden: ${issues.contradictions.join(', ')}\n`;
  }

  if (issues.unsourcedFacts.length > 0) {
    improvementContext += '- Voeg expliciete bronverwijzingen toe voor alle feiten\n';
  }

  return originalPrompt + improvementContext;
}
