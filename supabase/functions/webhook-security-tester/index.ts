import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  test_name: string;
  endpoint: string;
  passed: boolean;
  expected: string;
  actual: string;
  response_code: number;
  duration_ms: number;
  details?: string;
}

interface TestSuite {
  suite_name: string;
  started_at: string;
  completed_at?: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  results: TestResult[];
}

// Helper to create HMAC-SHA256 signature (for testing purposes)
async function createHmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = Uint8Array.from(atob(secret.startsWith('whsec_') ? secret.substring(6) : secret), c => c.charCodeAt(0));
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return btoa(String.fromCharCode(...signatureArray));
}

// Test helper to call endpoints
async function callEndpoint(
  url: string, 
  method: string = 'POST',
  headers: Record<string, string> = {},
  body?: string
): Promise<{ status: number; body: string; duration: number }> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body
    });
    const responseBody = await response.text();
    return {
      status: response.status,
      body: responseBody,
      duration: Date.now() - start
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      status: 0,
      body: `Connection error: ${error.message}`,
      duration: Date.now() - start
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendWebhookSecret = Deno.env.get('RESEND_WEBHOOK_SIGNING_SECRET');
  const deployWebhookSecret = Deno.env.get('DEPLOY_WEBHOOK_SECRET');
  const externalApiKey = Deno.env.get('CITOZORG_API_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('🔐 [PENTEST] Starting Webhook Security Penetration Tests...');

  const suite: TestSuite = {
    suite_name: 'Webhook Security Penetration Test',
    started_at: new Date().toISOString(),
    total_tests: 0,
    passed_tests: 0,
    failed_tests: 0,
    results: []
  };

  const baseUrl = supabaseUrl.replace('/rest/v1', '').replace('https://', 'https://');
  const functionsUrl = `${baseUrl}/functions/v1`;

  // ============================================================================
  // TEST SUITE 1: Resend Webhook Signature Validation (process-application-email)
  // ============================================================================
  console.log('\n📧 [PENTEST] Testing process-application-email signature validation...');

  const testPayload = JSON.stringify({
    type: 'email.received',
    data: {
      from: 'test@example.com',
      to: ['recruitment@inbound.citozorg.nl'],
      subject: 'PENTEST - Security Test Email',
      text: 'This is a penetration test email'
    }
  });

  // Test 1.1: Missing svix headers
  {
    const result = await callEndpoint(
      `${functionsUrl}/process-application-email`,
      'POST',
      {},
      testPayload
    );
    
    const passed = result.status === 401 || result.status === 403 || result.body.includes('Missing') || result.body.includes('unauthorized');
    suite.results.push({
      test_name: 'Missing Svix Headers',
      endpoint: 'process-application-email',
      passed,
      expected: '401/403 Unauthorized',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected request without svix headers' : 'VULNERABILITY: Accepted request without svix headers!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Missing Svix Headers: ${result.status}`);
  }

  // Test 1.2: Invalid signature
  {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_pentest_' + crypto.randomUUID();
    
    const result = await callEndpoint(
      `${functionsUrl}/process-application-email`,
      'POST',
      {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,INVALID_SIGNATURE_12345'
      },
      testPayload
    );
    
    const passed = result.status === 401 || result.status === 403;
    suite.results.push({
      test_name: 'Invalid Signature',
      endpoint: 'process-application-email',
      passed,
      expected: '401/403 Unauthorized',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected invalid signature' : 'VULNERABILITY: Accepted invalid signature!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Invalid Signature: ${result.status}`);
  }

  // Test 1.3: Expired timestamp (replay attack prevention)
  {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
    const msgId = 'msg_pentest_replay_' + crypto.randomUUID();
    
    // Create valid signature with old timestamp (simulating replay)
    let signature = 'v1,REPLAY_SIGNATURE';
    if (resendWebhookSecret) {
      const signedContent = `${msgId}.${oldTimestamp}.${testPayload}`;
      signature = 'v1,' + await createHmacSha256(resendWebhookSecret, signedContent);
    }
    
    const result = await callEndpoint(
      `${functionsUrl}/process-application-email`,
      'POST',
      {
        'svix-id': msgId,
        'svix-timestamp': oldTimestamp,
        'svix-signature': signature
      },
      testPayload
    );
    
    const passed = result.status === 401 || result.status === 403;
    suite.results.push({
      test_name: 'Replay Attack (Expired Timestamp)',
      endpoint: 'process-application-email',
      passed,
      expected: '401/403 (timestamp > 5 min)',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected expired timestamp' : 'VULNERABILITY: Accepted replay attack!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Replay Attack Prevention: ${result.status}`);
  }

  // Test 1.4: Payload tampering (signature mismatch)
  {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_pentest_tamper_' + crypto.randomUUID();
    const originalPayload = JSON.stringify({ type: 'email.received', data: { from: 'original@test.com' } });
    const tamperedPayload = JSON.stringify({ type: 'email.received', data: { from: 'tampered@attacker.com' } });
    
    let signature = 'v1,TAMPERED_SIGNATURE';
    if (resendWebhookSecret) {
      const signedContent = `${msgId}.${timestamp}.${originalPayload}`;
      signature = 'v1,' + await createHmacSha256(resendWebhookSecret, signedContent);
    }
    
    const result = await callEndpoint(
      `${functionsUrl}/process-application-email`,
      'POST',
      {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': signature
      },
      tamperedPayload // Send tampered payload with original's signature
    );
    
    const passed = result.status === 401 || result.status === 403;
    suite.results.push({
      test_name: 'Payload Tampering',
      endpoint: 'process-application-email',
      passed,
      expected: '401/403 (signature mismatch)',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected tampered payload' : 'VULNERABILITY: Accepted tampered payload!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Payload Tampering: ${result.status}`);
  }

  // ============================================================================
  // TEST SUITE 2: API Key Validation (receive-external-application)
  // ============================================================================
  console.log('\n🔑 [PENTEST] Testing receive-external-application API key validation...');

  const externalAppPayload = JSON.stringify({
    full_name: 'PENTEST User',
    email: 'pentest@security-test.com',
    phone: '0612345678',
    functie_niveau: 'Verpleegkundige Niveau 4'
  });

  // Test 2.1: Missing API key
  {
    const result = await callEndpoint(
      `${functionsUrl}/receive-external-application`,
      'POST',
      {},
      externalAppPayload
    );
    
    const passed = result.status === 401;
    suite.results.push({
      test_name: 'Missing API Key',
      endpoint: 'receive-external-application',
      passed,
      expected: '401 Unauthorized',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected request without API key' : 'VULNERABILITY: Accepted request without API key!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Missing API Key: ${result.status}`);
  }

  // Test 2.2: Invalid API key
  {
    const result = await callEndpoint(
      `${functionsUrl}/receive-external-application`,
      'POST',
      { 'x-api-key': 'INVALID_KEY_12345' },
      externalAppPayload
    );
    
    const passed = result.status === 401;
    suite.results.push({
      test_name: 'Invalid API Key',
      endpoint: 'receive-external-application',
      passed,
      expected: '401 Unauthorized',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected invalid API key' : 'VULNERABILITY: Accepted invalid API key!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Invalid API Key: ${result.status}`);
  }

  // Test 2.3: SQL Injection in payload
  {
    const sqlInjectionPayload = JSON.stringify({
      full_name: "Robert'; DROP TABLE professionals; --",
      email: 'test@test.com',
      phone: "'; DELETE FROM professional_applications; --"
    });
    
    const result = await callEndpoint(
      `${functionsUrl}/receive-external-application`,
      'POST',
      { 'x-api-key': externalApiKey || 'test-key' },
      sqlInjectionPayload
    );
    
    // Should either reject with validation error OR sanitize the input
    const passed = result.status === 400 || result.status === 401 || !result.body.includes('DROP TABLE');
    suite.results.push({
      test_name: 'SQL Injection Attempt',
      endpoint: 'receive-external-application',
      passed,
      expected: '400 Bad Request or sanitized',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'SQL injection attempt handled safely' : 'POTENTIAL VULNERABILITY: Check SQL injection handling!'
    });
    console.log(`  ${passed ? '✅' : '⚠️'} SQL Injection Test: ${result.status}`);
  }

  // Test 2.4: XSS in payload
  {
    const xssPayload = JSON.stringify({
      full_name: '<script>alert("XSS")</script>',
      email: 'test@test.com',
      motivation: '<img src=x onerror=alert("XSS")>'
    });
    
    const result = await callEndpoint(
      `${functionsUrl}/receive-external-application`,
      'POST',
      { 'x-api-key': externalApiKey || 'test-key' },
      xssPayload
    );
    
    const passed = result.status === 400 || result.status === 401 || 
                   !result.body.includes('<script>') || result.body.includes('escaped');
    suite.results.push({
      test_name: 'XSS Attempt',
      endpoint: 'receive-external-application',
      passed,
      expected: '400 or sanitized output',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'XSS attempt handled safely' : 'POTENTIAL VULNERABILITY: Check XSS handling!'
    });
    console.log(`  ${passed ? '✅' : '⚠️'} XSS Test: ${result.status}`);
  }

  // ============================================================================
  // TEST SUITE 3: Deploy Webhook Security (deploy-test-webhook)
  // ============================================================================
  console.log('\n🚀 [PENTEST] Testing deploy-test-webhook security...');

  const deployPayload = JSON.stringify({
    deployment_id: 'pentest-deploy-' + crypto.randomUUID(),
    project_name: 'PENTEST Project',
    environment: 'test',
    status: 'success'
  });

  // Test 3.1: Missing deploy signature (if secret is configured)
  {
    const result = await callEndpoint(
      `${functionsUrl}/deploy-test-webhook`,
      'POST',
      {},
      deployPayload
    );
    
    // If DEPLOY_WEBHOOK_SECRET is set, should reject. Otherwise note vulnerability
    const hasSecret = !!deployWebhookSecret;
    const passed = hasSecret ? (result.status === 401 || result.status === 403) : true;
    
    suite.results.push({
      test_name: 'Deploy Webhook - No Signature',
      endpoint: 'deploy-test-webhook',
      passed: hasSecret ? passed : false,
      expected: hasSecret ? '401/403 Unauthorized' : 'N/A (no secret configured)',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: hasSecret 
        ? (passed ? 'Correctly rejected unsigned request' : 'VULNERABILITY: Accepted unsigned deploy webhook!')
        : 'WARNING: DEPLOY_WEBHOOK_SECRET not configured - endpoint unprotected!'
    });
    console.log(`  ${hasSecret && passed ? '✅' : '⚠️'} Deploy Webhook Security: ${result.status} (secret configured: ${hasSecret})`);
  }

  // ============================================================================
  // TEST SUITE 4: handle-application-reply Security
  // ============================================================================
  console.log('\n📬 [PENTEST] Testing handle-application-reply security...');

  // Test 4.1: Missing svix headers
  {
    const replyPayload = JSON.stringify({
      type: 'email.received',
      data: {
        from: 'candidate@example.com',
        to: ['recruitment@inbound.citozorg.nl'],
        subject: 'Re: PENTEST Application',
        text: 'This is a test reply'
      }
    });
    
    const result = await callEndpoint(
      `${functionsUrl}/handle-application-reply`,
      'POST',
      {},
      replyPayload
    );
    
    const passed = result.status === 401 || result.status === 403 || result.body.includes('Missing');
    suite.results.push({
      test_name: 'Reply Handler - Missing Headers',
      endpoint: 'handle-application-reply',
      passed,
      expected: '401/403 Unauthorized',
      actual: `${result.status}`,
      response_code: result.status,
      duration_ms: result.duration,
      details: passed ? 'Correctly rejected request without svix headers' : 'VULNERABILITY: Accepted unsigned reply webhook!'
    });
    console.log(`  ${passed ? '✅' : '❌'} Reply Handler Security: ${result.status}`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  suite.completed_at = new Date().toISOString();
  suite.total_tests = suite.results.length;
  suite.passed_tests = suite.results.filter(r => r.passed).length;
  suite.failed_tests = suite.results.filter(r => !r.passed).length;

  console.log('\n📊 [PENTEST] Test Summary:');
  console.log(`   Total: ${suite.total_tests}`);
  console.log(`   Passed: ${suite.passed_tests} ✅`);
  console.log(`   Failed: ${suite.failed_tests} ❌`);

  // Log results to database
  try {
    await supabase.from('system_events').insert({
      event_type: 'security_penetration_test',
      event_data: {
        suite_name: suite.suite_name,
        total_tests: suite.total_tests,
        passed_tests: suite.passed_tests,
        failed_tests: suite.failed_tests,
        results: suite.results
      },
      processed: false,
      org_id: '550e8400-e29b-41d4-a716-446655440000'
    });
    console.log('📝 [PENTEST] Results logged to system_events');
  } catch (err) {
    console.error('Failed to log results:', err);
  }

  return new Response(
    JSON.stringify({
      success: suite.failed_tests === 0,
      summary: {
        total: suite.total_tests,
        passed: suite.passed_tests,
        failed: suite.failed_tests,
        pass_rate: `${Math.round((suite.passed_tests / suite.total_tests) * 100)}%`
      },
      results: suite.results,
      vulnerabilities: suite.results.filter(r => !r.passed).map(r => ({
        test: r.test_name,
        endpoint: r.endpoint,
        severity: r.test_name.includes('SQL') || r.test_name.includes('Signature') ? 'HIGH' : 'MEDIUM',
        details: r.details
      }))
    }, null, 2),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
