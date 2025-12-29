import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default timeout per test scenario (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000;

// Helper function to read from stream with timeout
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (timeoutMs <= 0) {
    throw new Error("Stream read timeout - remaining time exceeded");
  }
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Stream read timeout after ${timeoutMs}ms`)), timeoutMs)
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
  {
    id: "count_sublocations",
    question: "Hoeveel werklocaties of sublocaties zijn er totaal in het systeem?",
    expected_tool: "query_sublocations",
    timeout_ms: 30000,
    validations: [
      { type: "contains_number", min: 800, max: 1000, description: "Moet een getal tussen 800-1000 bevatten" },
      { type: "mentions", keywords: ["werklocatie", "sublocatie", "locatie"], description: "Moet locatie vermelden" }
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
    timeout_ms: 45000, // Longer timeout for complex queries
    validations: [
      { type: "contains_number", min: 1, description: "Moet een getal bevatten" }
    ]
  },
  {
    id: "knowledge_query",
    question: "Wat zijn de belangrijkste regels voor het werken met clienten in de zorg?",
    expected_tool: null, // Uses knowledge base, not specific tool
    timeout_ms: 40000, // Longer timeout for knowledge retrieval
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

function runValidation(response: string, validation: Validation): { passed: boolean; details: string } {
  switch (validation.type) {
    case "contains_number":
      return validateContainsNumber(response, validation.min, validation.max);
    case "mentions":
      return validateMentions(response, validation.keywords || []);
    case "matches_regex":
      return validateMatchesRegex(response, validation.pattern || "");
    case "min_length":
      return validateMinLength(response, validation.min || 0);
    default:
      return { passed: false, details: `Onbekend validatie type: ${validation.type}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Parse request body for optional parameters
    let body: { test_run_id?: string; deployment_id?: string; deployment_source?: string; scenarios?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is OK
    }
    
    const testRunId = body.test_run_id || crypto.randomUUID();
    const deploymentId = body.deployment_id || null;
    const deploymentSource = body.deployment_source || "manual";
    const scenariosToRun = body.scenarios || TEST_SCENARIOS.map(s => s.id);
    
    // Filter scenarios if specific ones requested
    const scenarios = TEST_SCENARIOS.filter(s => scenariosToRun.includes(s.id));
    
    console.log(`[ai-chat-tester] Starting test run ${testRunId} with ${scenarios.length} scenarios`);
    
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
    
    const results: Array<{
      scenario_id: string;
      question: string;
      response: string | null;
      expected_tool: string | null;
      actual_tool_used: string | null;
      passed: boolean;
      validation_details: Array<{ validation: string; passed: boolean; details: string }>;
      response_time_ms: number;
      error_message: string | null;
    }> = [];
    
    // Run each test scenario
    for (const scenario of scenarios) {
      const scenarioStart = Date.now();
      let response = "";
      let actualToolUsed: string | null = null;
      let errorMessage: string | null = null;
      const validationResults: Array<{ validation: string; passed: boolean; details: string }> = [];
      
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
            
            // Read with timeout
            const { done, value } = await readWithTimeout(reader, remainingTime);
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
        
        console.log(`[ai-chat-tester] Scenario ${scenario.id} response length: ${response.length}, tool: ${actualToolUsed || 'none'}`)
        
        // Run validations
        for (const validation of scenario.validations) {
          const result = runValidation(response, validation);
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
      
      results.push({
        scenario_id: scenario.id,
        question: scenario.question,
        response: response.substring(0, 5000), // Limit response size
        expected_tool: scenario.expected_tool,
        actual_tool_used: actualToolUsed,
        passed: allValidationsPassed,
        validation_details: validationResults,
        response_time_ms: responseTime,
        error_message: errorMessage
      });
      
      // Store individual result
      await supabase
        .from("ai_chat_test_results")
        .insert({
          test_run_id: testRunId,
          deployment_id: deploymentId,
          deployment_source: deploymentSource,
          scenario_id: scenario.id,
          question: scenario.question,
          response: response.substring(0, 5000),
          expected_tool: scenario.expected_tool,
          actual_tool_used: actualToolUsed,
          passed: allValidationsPassed,
          validation_details: validationResults,
          response_time_ms: responseTime,
          error_message: errorMessage
        });
    }
    
    // Calculate summary
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.filter(r => !r.passed).length;
    const avgResponseTime = Math.round(results.reduce((sum, r) => sum + r.response_time_ms, 0) / results.length);
    
    // Update test run with summary
    await supabase
      .from("ai_chat_test_runs")
      .update({
        passed_tests: passedTests,
        failed_tests: failedTests,
        avg_response_time_ms: avgResponseTime,
        status: failedTests > 0 ? "failed" : "passed",
        completed_at: new Date().toISOString()
      })
      .eq("id", testRunId);
    
    const totalTime = Date.now() - startTime;
    
    console.log(`[ai-chat-tester] Test run completed: ${passedTests}/${scenarios.length} passed in ${totalTime}ms`);
    
    return new Response(
      JSON.stringify({
        success: true,
        test_run_id: testRunId,
        deployment_id: deploymentId,
        total_tests: scenarios.length,
        passed_tests: passedTests,
        failed_tests: failedTests,
        pass_rate: Math.round((passedTests / scenarios.length) * 100),
        avg_response_time_ms: avgResponseTime,
        total_time_ms: totalTime,
        status: failedTests > 0 ? "failed" : "passed",
        results: results
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
    
  } catch (error) {
    console.error("[ai-chat-tester] Fatal error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
