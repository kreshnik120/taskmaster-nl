import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default timeout per test scenario (60 seconds - increased for complex queries)
const DEFAULT_TIMEOUT_MS = 60000;

// Stream read timeout (5 seconds per chunk - prevents premature stream termination)
const STREAM_READ_TIMEOUT_MS = 5000;

// Maximum run time before graceful shutdown (150s to leave buffer before 180s hard limit)
const DEFAULT_MAX_RUN_TIME_MS = 150000;

// Retry configuration
const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // Start with 1 second delay
const MAX_DELAY_MS = 10000; // Max 10 seconds delay
const JITTER_FACTOR = 0.2;  // 20% random jitter to prevent thundering herd

// Errors that should trigger a retry
const RETRYABLE_ERRORS = [
  'timeout',
  'AbortError', 
  'ECONNRESET',
  'ETIMEDOUT',
  'rate limit',
  '429',           // Too Many Requests
  '503',           // Service Unavailable
  '502',           // Bad Gateway
  '504',           // Gateway Timeout
  'network error',
  'fetch failed',
  'connection refused',
  'socket hang up'
];

// Circuit Breaker configuration
const DEFAULT_FAILURE_THRESHOLD = 3;      // Open circuit after 3 consecutive failures
const DEFAULT_RECOVERY_TIMEOUT_MS = 30000; // Wait 30s before trying HALF_OPEN
const HALF_OPEN_MAX_ATTEMPTS = 1;         // Try 1 test in HALF_OPEN state

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  openedAt: number | null;
  totalTripped: number;
  halfOpenAttempts: number;
}

// Calculate delay with exponential backoff and jitter
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    BASE_DELAY_MS * Math.pow(2, attempt),
    MAX_DELAY_MS
  );
  // Add random jitter to prevent thundering herd
  const jitter = exponentialDelay * JITTER_FACTOR * Math.random();
  return Math.round(exponentialDelay + jitter);
}

// Check if an error should trigger a retry
function isRetryableError(error: string): boolean {
  const lowerError = error.toLowerCase();
  return RETRYABLE_ERRORS.some(retryable => 
    lowerError.includes(retryable.toLowerCase())
  );
}

// Sleep helper for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Circuit Breaker helper functions
function createCircuitBreaker(): CircuitBreaker {
  return {
    state: 'CLOSED',
    consecutiveFailures: 0,
    lastFailureTime: null,
    openedAt: null,
    totalTripped: 0,
    halfOpenAttempts: 0
  };
}

function recordSuccess(breaker: CircuitBreaker): void {
  breaker.consecutiveFailures = 0;
  if (breaker.state === 'HALF_OPEN') {
    console.log('[circuit-breaker] Recovered - closing circuit');
    breaker.state = 'CLOSED';
    breaker.halfOpenAttempts = 0;
  }
}

function recordFailure(breaker: CircuitBreaker, error: string, failureThreshold: number): void {
  // Only count retryable errors (network/timeout issues, not validation failures)
  if (!isRetryableError(error)) {
    return; // Validation failures don't trip the circuit
  }
  
  breaker.consecutiveFailures++;
  breaker.lastFailureTime = Date.now();
  
  if (breaker.state === 'HALF_OPEN') {
    // Failed during recovery attempt - reopen
    console.log('[circuit-breaker] HALF_OPEN test failed - reopening circuit');
    breaker.state = 'OPEN';
    breaker.openedAt = Date.now();
    breaker.halfOpenAttempts = 0;
    return;
  }
  
  if (breaker.consecutiveFailures >= failureThreshold) {
    if (breaker.state !== 'OPEN') {
      console.log(`[circuit-breaker] OPENING - ${breaker.consecutiveFailures} consecutive failures`);
      breaker.state = 'OPEN';
      breaker.openedAt = Date.now();
      breaker.totalTripped++;
    }
  }
}

function canExecute(breaker: CircuitBreaker, recoveryTimeout: number): boolean {
  if (breaker.state === 'CLOSED') return true;
  
  if (breaker.state === 'OPEN') {
    // Check if recovery timeout has passed
    const timeSinceOpen = Date.now() - (breaker.openedAt || 0);
    if (timeSinceOpen >= recoveryTimeout) {
      console.log('[circuit-breaker] Entering HALF_OPEN state');
      breaker.state = 'HALF_OPEN';
      breaker.halfOpenAttempts = 0;
      return true;
    }
    return false;
  }
  
  // HALF_OPEN - allow limited tests through
  if (breaker.halfOpenAttempts < HALF_OPEN_MAX_ATTEMPTS) {
    breaker.halfOpenAttempts++;
    return true;
  }
  
  return false;
}

// Helper function to read from stream with timeout
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  remainingScenarioTime: number,
  streamReadTimeout: number = STREAM_READ_TIMEOUT_MS
): Promise<ReadableStreamReadResult<Uint8Array>> {
  // Use the smaller of: per-chunk timeout OR remaining scenario time
  const effectiveTimeout = Math.min(streamReadTimeout, remainingScenarioTime);
  
  if (effectiveTimeout <= 0) {
    throw new Error("Stream read timeout - remaining time exceeded");
  }
  
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Stream read timeout after ${effectiveTimeout}ms`)), effectiveTimeout)
  );
  return Promise.race([reader.read(), timeoutPromise]);
}

// Test scenarios for AI chat validation with optional timeout_ms
interface TestScenario {
  id: string;
  question: string;
  expected_tool: string | null;
  timeout_ms?: number; // Optional per-scenario timeout
  validations: Validation[];
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: "count_organizations",
    question: "Hoeveel klantorganisaties hebben we in het systeem?",
    expected_tool: "query_clients",
    timeout_ms: 30000,
    validations: [
      { type: "contains_number", min: 50, max: 100, description: "Moet een getal tussen 50-100 bevatten" },
      { type: "mentions", keywords: ["organisatie", "klant"], description: "Moet organisatie of klant vermelden" }
    ]
  },
  // ═══════════════════════════════════════════════════════════════════
  // FAST PATH TEST SCENARIOS - Alle Nederlandse variaties
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "fast_path_hoeveel_werklocaties",
    question: "Hoeveel werklocaties zijn er?",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 800, max: 1100, description: "Moet een getal tussen 800-1100 bevatten" },
      { type: "mentions", keywords: ["werklocatie", "locatie"], description: "Moet locatie vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms)" }
    ]
  },
  {
    id: "fast_path_tel_werklocaties",
    question: "Tel de werklocaties",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 800, max: 1100, description: "Moet een getal tussen 800-1100 bevatten" },
      { type: "mentions", keywords: ["werklocatie", "locatie"], description: "Moet locatie vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms)" }
    ]
  },
  {
    id: "fast_path_aantal_locaties",
    question: "Wat is het aantal locaties totaal?",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 800, max: 1100, description: "Moet een getal tussen 800-1100 bevatten" },
      { type: "mentions", keywords: ["werklocatie", "locatie"], description: "Moet locatie vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms)" }
    ]
  },
  {
    id: "fast_path_hoeveel_plaatsen",
    question: "Hoeveel plaatsen hebben we?",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 800, max: 1100, description: "Moet een getal tussen 800-1100 bevatten" },
      { type: "mentions", keywords: ["werklocatie", "locatie"], description: "Moet locatie vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms)" }
    ]
  },
  {
    id: "fast_path_totaal_vestigingen",
    question: "Totaal aantal vestigingen",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 800, max: 1100, description: "Moet een getal tussen 800-1100 bevatten" },
      { type: "mentions", keywords: ["werklocatie", "locatie"], description: "Moet locatie vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms)" }
    ]
  },
  {
    id: "fast_path_tel_professionals",
    question: "Tel de professionals",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 0, description: "Moet een getal bevatten (kan 0 zijn)" },
      { type: "mentions", keywords: ["professional"], description: "Moet professional vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms of X-Fast-Path header)" }
    ]
  },
  {
    id: "fast_path_aantal_klanten",
    question: "Aantal klanten totaal",
    expected_tool: null,
    timeout_ms: 5000,
    validations: [
      { type: "contains_number", min: 1, description: "Moet een getal bevatten" },
      { type: "mentions", keywords: ["klant", "organisatie"], description: "Moet klant of organisatie vermelden" },
      { type: "fast_path", description: "Moet via Fast Path verwerkt zijn (< 500ms)" }
    ]
  },
  {
    id: "phone_lookup_prisma",
    question: "Wat is het telefoonnummer van een Prisma werklocatie?",
    expected_tool: "query_sublocations",
    timeout_ms: 30000,
    validations: [
      { type: "matches_regex", pattern: "\\d{2,4}[-\\s]?\\d{6,7}", description: "Moet een geldig telefoonnummer bevatten" },
      { type: "mentions", keywords: ["Prisma"], description: "Moet Prisma vermelden" }
    ]
  },
  {
    id: "sector_filter_ggz",
    question: "Welke werklocaties hebben sector GGZ?",
    expected_tool: "query_sublocations",
    timeout_ms: 30000,
    validations: [
      { type: "mentions", keywords: ["GGZ"], description: "Moet GGZ vermelden" },
      { type: "contains_number", min: 1, description: "Moet minstens 1 resultaat tonen" }
    ]
  },
  {
    id: "organization_detail_lunet",
    question: "Geef me informatie over Lunet zorg",
    expected_tool: "query_clients",
    timeout_ms: 30000,
    validations: [
      { type: "mentions", keywords: ["Lunet"], description: "Moet Lunet vermelden" }
    ]
  },
  {
    id: "function_filter_vig",
    question: "Welke werklocaties zoeken VIG medewerkers?",
    expected_tool: "query_sublocations",
    timeout_ms: 30000,
    validations: [
      { type: "mentions", keywords: ["VIG"], description: "Moet VIG vermelden" },
      { type: "contains_number", min: 1, description: "Moet resultaten bevatten" }
    ]
  },
  {
    id: "count_locations",
    question: "Hoeveel locaties (niet sublocaties) zijn er?",
    expected_tool: "query_clients",
    timeout_ms: 30000,
    validations: [
      { type: "contains_number", min: 50, max: 100, description: "Moet een getal tussen 50-100 bevatten" }
    ]
  },
  {
    id: "applications_count",
    question: "Hoeveel sollicitaties zijn er in het systeem?",
    expected_tool: "query_applications",
    timeout_ms: 30000,
    validations: [
      { type: "contains_number", min: 0, description: "Moet een getal bevatten" },
      { type: "mentions", keywords: ["sollicitatie", "kandidaat", "applicatie"], description: "Moet sollicitatie-gerelateerde term vermelden" }
    ]
  },
  {
    id: "combined_query",
    question: "Hoeveel werklocaties heeft de organisatie met de meeste locaties?",
    expected_tool: "query_clients",
    timeout_ms: 90000, // Extra long timeout for complex multi-step queries
    validations: [
      { type: "contains_number", min: 1, description: "Moet een getal bevatten" }
    ]
  },
  {
    id: "knowledge_query",
    question: "Wat zijn de belangrijkste regels voor het werken met clienten in de zorg?",
    expected_tool: null, // Uses knowledge base, not specific tool
    timeout_ms: 60000, // Longer timeout for knowledge retrieval
    validations: [
      { type: "min_length", min: 50, description: "Moet een uitgebreid antwoord zijn" }
    ]
  }
];

// Validation functions
function validateContainsNumber(response: string, min?: number, max?: number): { passed: boolean; details: string } {
  const numbers = response.match(/\d+/g);
  if (!numbers) {
    return { passed: false, details: "Geen getallen gevonden in response" };
  }
  
  const foundNumbers = numbers.map(n => parseInt(n, 10));
  
  if (min !== undefined && max !== undefined) {
    const inRange = foundNumbers.some(n => n >= min && n <= max);
    return {
      passed: inRange,
      details: inRange 
        ? `Getal in range ${min}-${max} gevonden: ${foundNumbers.join(", ")}`
        : `Geen getal in range ${min}-${max}, gevonden: ${foundNumbers.join(", ")}`
    };
  }
  
  if (min !== undefined) {
    const aboveMin = foundNumbers.some(n => n >= min);
    return {
      passed: aboveMin,
      details: aboveMin 
        ? `Getal >= ${min} gevonden: ${foundNumbers.join(", ")}`
        : `Geen getal >= ${min}, gevonden: ${foundNumbers.join(", ")}`
    };
  }
  
  return { passed: true, details: `Getallen gevonden: ${foundNumbers.join(", ")}` };
}

function validateMentions(response: string, keywords: string[]): { passed: boolean; details: string } {
  const lowerResponse = response.toLowerCase();
  const found = keywords.filter(k => lowerResponse.includes(k.toLowerCase()));
  
  return {
    passed: found.length > 0,
    details: found.length > 0 
      ? `Keywords gevonden: ${found.join(", ")}`
      : `Keywords niet gevonden: ${keywords.join(", ")}`
  };
}

function validateMatchesRegex(response: string, pattern: string): { passed: boolean; details: string } {
  const regex = new RegExp(pattern);
  const match = response.match(regex);
  
  return {
    passed: !!match,
    details: match 
      ? `Pattern matched: ${match[0]}`
      : `Pattern niet gevonden: ${pattern}`
  };
}

function validateMinLength(response: string, min: number): { passed: boolean; details: string } {
  return {
    passed: response.length >= min,
    details: `Response lengte: ${response.length} (min: ${min})`
  };
}

interface Validation {
  type: string;
  min?: number;
  max?: number;
  keywords?: string[];
  pattern?: string;
  description: string;
}

// Track if X-Fast-Path header was received (set during executeScenario)
let lastFastPathHeader: string | null = null;

function runValidation(response: string, validation: Validation, responseTimeMs?: number): { passed: boolean; details: string } {
  switch (validation.type) {
    case "contains_number":
      return validateContainsNumber(response, validation.min, validation.max);
    case "mentions":
      return validateMentions(response, validation.keywords || []);
    case "matches_regex":
      return validateMatchesRegex(response, validation.pattern || "");
    case "min_length":
      return validateMinLength(response, validation.min || 0);
    case "fast_path":
      // Fast Path validation: check X-Fast-Path header OR response < 500ms
      const hasHeader = lastFastPathHeader === 'count-query';
      const isFast = responseTimeMs !== undefined && responseTimeMs < 500;
      const passed = hasHeader || isFast;
      return {
        passed,
        details: passed 
          ? `Fast Path success: ${hasHeader ? 'X-Fast-Path header present' : `${responseTimeMs}ms (< 500ms)`}`
          : `Fast Path failed: no X-Fast-Path header and ${responseTimeMs || 'unknown'}ms (expected < 500ms or header)`
      };
    default:
      return { passed: false, details: `Onbekend validatie type: ${validation.type}` };
  }
}

// Default concurrency for parallel test execution
const DEFAULT_MAX_CONCURRENT = 5;

// Scenario result interface
interface ScenarioResult {
  scenario_id: string;
  question: string;
  response: string | null;
  expected_tool: string | null;
  actual_tool_used: string | null;
  passed: boolean;
  validation_details: Array<{ validation: string; passed: boolean; details: string }>;
  response_time_ms: number;
  error_message: string | null;
  attempts: number;      // Number of attempts made
  retried: boolean;      // Was this test retried?
  retry_errors?: string[]; // Errors from failed attempts
  skipped_by_circuit_breaker?: boolean; // Was this test skipped due to circuit breaker?
}

// Execute a single test scenario
async function executeScenario(
  scenario: TestScenario,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<ScenarioResult> {
  const scenarioStart = Date.now();
  let response = "";
  let actualToolUsed: string | null = null;
  let errorMessage: string | null = null;
  const validationResults: Array<{ validation: string; passed: boolean; details: string }> = [];
  
  // Reset Fast Path header tracking for this scenario
  lastFastPathHeader = null;
  
  // Get scenario-specific timeout or use default
  const scenarioTimeout = scenario.timeout_ms || DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), scenarioTimeout);
  
  try {
    console.log(`[ai-chat-tester] Testing scenario: ${scenario.id} (timeout: ${scenarioTimeout}ms)`);
    
    // Generate a valid UUID for conversation_id
    const conversationId = crypto.randomUUID();
    
    // Call ai-chat function with abort signal for timeout
    const chatResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "user", content: scenario.question }
        ],
        conversation_id: conversationId
      }),
      signal: abortController.signal,
    });
    
    if (!chatResponse.ok) {
      throw new Error(`ai-chat returned ${chatResponse.status}: ${await chatResponse.text()}`);
    }
    
    // Capture X-Fast-Path header for fast_path validation
    lastFastPathHeader = chatResponse.headers.get('X-Fast-Path');
    if (lastFastPathHeader) {
      console.log(`[ai-chat-tester] Fast Path header detected: ${lastFastPathHeader}`);
    }
    
    // Parse SSE streaming response from ai-chat with timeout
    const reader = chatResponse.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";
    let detectedTool: string | null = null;
    
    if (reader) {
      while (true) {
        // Calculate remaining time for this scenario
        const elapsedTime = Date.now() - scenarioStart;
        const remainingTime = scenarioTimeout - elapsedTime;
        
        if (remainingTime <= 0) {
          reader.cancel();
          throw new Error(`Scenario timeout: response duurde langer dan ${scenarioTimeout}ms`);
        }
        
        // Read with timeout (5s per chunk, bounded by remaining scenario time)
        const { done, value } = await readWithTimeout(reader, remainingTime, STREAM_READ_TIMEOUT_MS);
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]" || !jsonStr) continue;
          
          try {
            const parsed = JSON.parse(jsonStr);
            
            // Extract content from delta (OpenAI streaming format)
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullResponse += content;
            
            // Detect tool calls from stream
            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
            if (toolCalls?.[0]?.function?.name) {
              detectedTool = toolCalls[0].function.name;
            }
            
            // Also check for finished tool calls
            if (parsed.choices?.[0]?.message?.tool_calls?.[0]?.function?.name) {
              detectedTool = parsed.choices[0].message.tool_calls[0].function.name;
            }
            
            // Handle our custom chunk format (if ai-chat sends different format)
            if (parsed.chunk) fullResponse += parsed.chunk;
            if (parsed.content) fullResponse += parsed.content;
            if (parsed.tool_used) detectedTool = parsed.tool_used;
            if (parsed.tool_calls?.[0]?.name) detectedTool = parsed.tool_calls[0].name;
            
          } catch {
            // Ignore invalid JSON chunks - normal in SSE streaming
          }
        }
      }
    }
    
    response = fullResponse;
    actualToolUsed = detectedTool;
    
    console.log(`[ai-chat-tester] Scenario ${scenario.id} response length: ${response.length}, tool: ${actualToolUsed || 'none'}`);
    
    // Run validations - pass response time for fast_path validation
    const responseTimeMs = Date.now() - scenarioStart;
    for (const validation of scenario.validations) {
      const result = runValidation(response, validation, responseTimeMs);
      validationResults.push({
        validation: validation.description,
        passed: result.passed,
        details: result.details
      });
    }
    
  } catch (error) {
    // Handle specific abort/timeout errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = `Timeout: AI response duurde langer dan ${scenarioTimeout}ms`;
      } else if (error.message.includes('timeout')) {
        errorMessage = error.message;
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = String(error);
    }
    console.error(`[ai-chat-tester] Scenario ${scenario.id} failed:`, errorMessage);
  } finally {
    // Always clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
  }
  
  const responseTime = Date.now() - scenarioStart;
  const allValidationsPassed = validationResults.every(v => v.passed) && !errorMessage;
  
  return {
    scenario_id: scenario.id,
    question: scenario.question,
    response: response.substring(0, 5000), // Limit response size
    expected_tool: scenario.expected_tool,
    actual_tool_used: actualToolUsed,
    passed: allValidationsPassed,
    validation_details: validationResults,
    response_time_ms: responseTime,
    error_message: errorMessage,
    attempts: 1,
    retried: false
  };
}

// Execute scenario with retry logic
async function executeScenarioWithRetry(
  scenario: TestScenario,
  supabaseUrl: string,
  serviceRoleKey: string,
  maxRetries: number
): Promise<ScenarioResult> {
  const retryErrors: string[] = [];
  let lastResult: ScenarioResult | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Wait before retry (not on first attempt)
    if (attempt > 0) {
      const delay = calculateBackoffDelay(attempt - 1);
      console.log(`[ai-chat-tester] Scenario ${scenario.id} retry ${attempt}/${maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
    
    // Execute the scenario
    const result = await executeScenario(scenario, supabaseUrl, serviceRoleKey);
    lastResult = result;
    
    // If passed, return immediately with retry info
    if (result.passed) {
      return { 
        ...result, 
        attempts: attempt + 1, 
        retried: attempt > 0,
        retry_errors: retryErrors.length > 0 ? retryErrors : undefined
      };
    }
    
    // Check if error is retryable
    if (result.error_message && isRetryableError(result.error_message)) {
      console.log(`[ai-chat-tester] Scenario ${scenario.id} failed with retryable error: ${result.error_message}`);
      retryErrors.push(`Attempt ${attempt + 1}: ${result.error_message}`);
      continue; // Try again
    }
    
    // Non-retryable error or validation failure - stop trying
    if (result.error_message) {
      console.log(`[ai-chat-tester] Scenario ${scenario.id} failed with permanent error: ${result.error_message}`);
    } else {
      console.log(`[ai-chat-tester] Scenario ${scenario.id} failed validation, not retrying`);
    }
    break;
  }
  
  // Return last result with retry info
  return {
    ...lastResult!,
    attempts: retryErrors.length + 1,
    retried: retryErrors.length > 0,
    retry_errors: retryErrors.length > 0 ? retryErrors : undefined
  };
}

// Helper to chunk array into batches
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let testRunId: string | null = null;
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  try {
    
    // Parse request body for optional parameters
    let body: { 
      test_run_id?: string; 
      deployment_id?: string; 
      deployment_source?: string; 
      scenarios?: string[];
      max_concurrent?: number;      // Configurable parallelism (1-10)
      max_retries?: number;         // Configurable retries (0-5)
      failure_threshold?: number;   // Circuit breaker: consecutive failures to open (1-10)
      recovery_timeout_ms?: number; // Circuit breaker: wait time before HALF_OPEN (5000-60000)
      max_run_time_ms?: number;     // Max total run time for graceful shutdown (default 150s)
    } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is OK
    }
    
    testRunId = body.test_run_id || crypto.randomUUID();
    const deploymentId = body.deployment_id || null;
    const deploymentSource = body.deployment_source || "manual";
    const scenariosToRun = body.scenarios || TEST_SCENARIOS.map(s => s.id);
    const maxConcurrent = Math.min(Math.max(body.max_concurrent || 2, 1), 10); // Default reduced to 2 for stability
    const maxRetries = Math.min(Math.max(body.max_retries ?? DEFAULT_MAX_RETRIES, 0), 5);
    const failureThreshold = Math.min(Math.max(body.failure_threshold ?? DEFAULT_FAILURE_THRESHOLD, 1), 10);
    const recoveryTimeout = Math.min(Math.max(body.recovery_timeout_ms ?? DEFAULT_RECOVERY_TIMEOUT_MS, 5000), 60000);
    const maxRunTime = Math.min(Math.max(body.max_run_time_ms ?? DEFAULT_MAX_RUN_TIME_MS, 30000), 170000);
    
    // Filter scenarios if specific ones requested
    const scenarios = TEST_SCENARIOS.filter(s => scenariosToRun.includes(s.id));
    
    console.log(`[ai-chat-tester] Starting test run ${testRunId} with ${scenarios.length} scenarios (max concurrent: ${maxConcurrent}, max retries: ${maxRetries}, max run time: ${maxRunTime}ms, circuit breaker: threshold=${failureThreshold}, recovery=${recoveryTimeout}ms)`);
    
    // Create test run record
    const { error: runError } = await supabase
      .from("ai_chat_test_runs")
      .insert({
        id: testRunId,
        deployment_id: deploymentId,
        deployment_source: deploymentSource,
        total_tests: scenarios.length,
        status: "running",
        org_id: "550e8400-e29b-41d4-a716-446655440000" // ABCzorg default
      });
    
    if (runError) {
      console.error("[ai-chat-tester] Failed to create test run:", runError);
    }
    
    // Execute scenarios in parallel batches using Promise.allSettled with circuit breaker
    const scenarioChunks = chunkArray(scenarios, maxConcurrent);
    const allResults: ScenarioResult[] = [];
    const circuitBreaker = createCircuitBreaker();
    const skippedDueToCircuit: string[] = [];
    const skippedDueToTimeout: string[] = [];
    let gracefulShutdownTriggered = false;
    
    for (const chunk of scenarioChunks) {
      // Check graceful shutdown - if we're running out of time, skip remaining tests
      const elapsedRunTime = Date.now() - startTime;
      if (elapsedRunTime > maxRunTime) {
        console.log(`[ai-chat-tester] Graceful shutdown: ${elapsedRunTime}ms elapsed (max: ${maxRunTime}ms) - skipping remaining ${chunk.length} tests`);
        gracefulShutdownTriggered = true;
        
        for (const scenario of chunk) {
          skippedDueToTimeout.push(scenario.id);
          allResults.push({
            scenario_id: scenario.id,
            question: scenario.question,
            response: null,
            expected_tool: scenario.expected_tool,
            actual_tool_used: null,
            passed: false,
            validation_details: [],
            response_time_ms: 0,
            error_message: `Skipped: Graceful shutdown - run time exceeded ${maxRunTime}ms`,
            attempts: 0,
            retried: false,
            skipped_by_circuit_breaker: false
          });
        }
        continue;
      }
      
      // Check circuit breaker before each batch
      if (!canExecute(circuitBreaker, recoveryTimeout)) {
        console.log(`[ai-chat-tester] Circuit OPEN - skipping ${chunk.length} tests`);
        
        // Mark all in this chunk as skipped
        for (const scenario of chunk) {
          skippedDueToCircuit.push(scenario.id);
          allResults.push({
            scenario_id: scenario.id,
            question: scenario.question,
            response: null,
            expected_tool: scenario.expected_tool,
            actual_tool_used: null,
            passed: false,
            validation_details: [],
            response_time_ms: 0,
            error_message: 'Skipped: Circuit breaker OPEN - te veel opeenvolgende AI fouten',
            attempts: 0,
            retried: false,
            skipped_by_circuit_breaker: true
          });
        }
        continue;
      }
      
      console.log(`[ai-chat-tester] Running batch of ${chunk.length} tests in parallel (circuit: ${circuitBreaker.state})`);
      
      const chunkResults = await Promise.allSettled(
        chunk.map(scenario => executeScenarioWithRetry(scenario, supabaseUrl, serviceRoleKey, maxRetries))
      );
      
      // Process settled results and update circuit breaker
      for (let i = 0; i < chunkResults.length; i++) {
        const settledResult = chunkResults[i];
        const scenario = chunk[i];
        
        if (settledResult.status === 'fulfilled') {
          const result = settledResult.value;
          allResults.push(result);
          
          // Update circuit breaker based on result
          if (result.passed) {
            recordSuccess(circuitBreaker);
          } else if (result.error_message) {
            recordFailure(circuitBreaker, result.error_message, failureThreshold);
          }
        } else {
          // Handle rejected promise (unexpected error)
          const errorMessage = `Unexpected error: ${settledResult.reason}`;
          allResults.push({
            scenario_id: scenario.id,
            question: scenario.question,
            response: null,
            expected_tool: scenario.expected_tool,
            actual_tool_used: null,
            passed: false,
            validation_details: [],
            response_time_ms: 0,
            error_message: errorMessage,
            attempts: 1,
            retried: false
          });
          recordFailure(circuitBreaker, errorMessage, failureThreshold);
        }
      }
    }
    
    // Store all results in database
    for (const result of allResults) {
      await supabase
        .from("ai_chat_test_results")
        .insert({
          test_run_id: testRunId,
          deployment_id: deploymentId,
          deployment_source: deploymentSource,
          scenario_id: result.scenario_id,
          question: result.question,
          response: result.response,
          expected_tool: result.expected_tool,
          actual_tool_used: result.actual_tool_used,
          passed: result.passed,
          validation_details: result.validation_details,
          response_time_ms: result.response_time_ms,
          error_message: result.error_message
        });
    }
    
    // Calculate summary
    const passedTests = allResults.filter(r => r.passed).length;
    const failedTests = allResults.filter(r => !r.passed).length;
    const avgResponseTime = allResults.length > 0 
      ? Math.round(allResults.reduce((sum, r) => sum + r.response_time_ms, 0) / allResults.length)
      : 0;
    
    const totalTime = Date.now() - startTime;
    
    // Calculate speedup metrics
    const sumResponseTimes = allResults.reduce((sum, r) => sum + r.response_time_ms, 0);
    const sequentialEstimate = sumResponseTimes; // If run sequentially
    const speedupFactor = sequentialEstimate > 0 ? Math.round((sequentialEstimate / totalTime) * 10) / 10 : 1;
    
    // Calculate retry metrics
    const retriedTests = allResults.filter(r => r.retried).length;
    const totalAttempts = allResults.reduce((sum, r) => sum + r.attempts, 0);
    const retryRate = scenarios.length > 0 ? Math.round((retriedTests / scenarios.length) * 100) : 0;
    
    // Calculate circuit breaker metrics
    const skippedByCircuit = allResults.filter(r => r.skipped_by_circuit_breaker).length;
    
    // Calculate skipped by timeout
    const skippedByTimeout = skippedDueToTimeout.length;
    
    // Determine final status
    let finalStatus = "passed";
    if (gracefulShutdownTriggered) {
      finalStatus = "partial"; // Some tests were skipped due to timeout
    } else if (failedTests > 0) {
      finalStatus = "failed";
    }
    
    // Update test run with summary
    await supabase
      .from("ai_chat_test_runs")
      .update({
        passed_tests: passedTests,
        failed_tests: failedTests,
        avg_response_time_ms: avgResponseTime,
        status: finalStatus,
        completed_at: new Date().toISOString()
      })
      .eq("id", testRunId);
    
    console.log(`[ai-chat-tester] Test run completed: ${passedTests}/${scenarios.length} passed in ${totalTime}ms (${speedupFactor}x speedup, ${retriedTests} retried, ${skippedByCircuit} skipped by circuit, ${skippedByTimeout} skipped by timeout)`);
    
    return new Response(
      JSON.stringify({
        success: true,
        test_run_id: testRunId,
        deployment_id: deploymentId,
        total_tests: scenarios.length,
        passed_tests: passedTests,
        failed_tests: failedTests,
        pass_rate: scenarios.length > 0 ? Math.round((passedTests / scenarios.length) * 100) : 0,
        avg_response_time_ms: avgResponseTime,
        total_time_ms: totalTime,
        sequential_estimate_ms: sequentialEstimate,
        speedup_factor: speedupFactor,
        max_concurrent_used: maxConcurrent,
        max_retries_used: maxRetries,
        max_run_time_used: maxRunTime,
        retried_tests: retriedTests,
        total_attempts: totalAttempts,
        retry_rate: retryRate,
        graceful_shutdown_triggered: gracefulShutdownTriggered,
        circuit_breaker: {
          final_state: circuitBreaker.state,
          times_tripped: circuitBreaker.totalTripped,
          consecutive_failures: circuitBreaker.consecutiveFailures,
          tests_skipped: skippedByCircuit,
          skipped_scenarios: skippedDueToCircuit,
          failure_threshold_used: failureThreshold,
          recovery_timeout_used: recoveryTimeout
        },
        timeout_info: {
          tests_skipped: skippedByTimeout,
          skipped_scenarios: skippedDueToTimeout
        },
        status: finalStatus,
        results: allResults
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("[ai-chat-tester] Fatal error:", error);
    
    // Cleanup: Mark test run as crashed if we have the context
    if (testRunId) {
      try {
        await supabase
          .from("ai_chat_test_runs")
          .update({
            status: "crashed",
            completed_at: new Date().toISOString()
          })
          .eq("id", testRunId)
          .eq("status", "running"); // Only update if still running
        
        console.log(`[ai-chat-tester] Marked test run ${testRunId} as crashed`);
      } catch (cleanupError) {
        console.error("[ai-chat-tester] Failed to mark run as crashed:", cleanupError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        test_run_id: testRunId,
        error: error instanceof Error ? error.message : String(error),
        crashed: true
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
