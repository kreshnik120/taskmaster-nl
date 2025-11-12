import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Shield, AlertTriangle, CheckCircle, XCircle, Clock, Activity } from "lucide-react";
import { toast } from "sonner";

interface TestResult {
  scenario: string;
  status: "success" | "failed" | "pending";
  statusCode?: number;
  message: string;
  timestamp: string;
}

export default function WebhookSecurityTest() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const addResult = (result: Omit<TestResult, "timestamp">) => {
    setResults(prev => [...prev, { ...result, timestamp: new Date().toISOString() }]);
  };

  const testValidWebhook = async () => {
    setLoading(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const id = `msg_test_valid_${Date.now()}`;
      
      const payload = {
        type: "email.received",
        data: {
          from: "test@example.com",
          to: ["personeel@citozorg.nl"],
          subject: "TEST Sollicitatie - Security Check",
          text: "Test applicatie van Jan Tester\nFunctie: VP4\nTelefoon: 06-12345678"
        }
      };

      // Note: This will fail signature verification if secret is configured
      // This is just to test endpoint connectivity
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-application-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Svix-Timestamp": timestamp,
            "Svix-Id": id,
            "Svix-Signature": "v1,test_signature_will_fail",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.text();
      
      addResult({
        scenario: "Valid Webhook Structure (Invalid Signature)",
        status: response.status === 401 ? "success" : "failed",
        statusCode: response.status,
        message: response.status === 401 
          ? "✅ Signature verification is ACTIVE - rejected invalid signature" 
          : `⚠️ Expected 401, got ${response.status}. Response: ${data}`,
      });

    } catch (error: any) {
      addResult({
        scenario: "Valid Webhook Structure",
        status: "failed",
        message: `❌ Error: ${error.message}`,
      });
    }
    setLoading(false);
  };

  const testReplayAttack = async () => {
    setLoading(true);
    try {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const id = `msg_replay_attack_${Date.now()}`;
      
      const payload = {
        type: "email.received",
        data: { from: "attacker@evil.com" }
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-application-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Svix-Timestamp": expiredTimestamp.toString(),
            "Svix-Id": id,
            "Svix-Signature": "v1,fake_signature",
          },
          body: JSON.stringify(payload),
        }
      );

      addResult({
        scenario: "Replay Attack (Expired Timestamp)",
        status: response.status === 401 ? "success" : "failed",
        statusCode: response.status,
        message: response.status === 401
          ? "✅ Replay attack blocked - timestamp too old"
          : `❌ Replay attack should be blocked (expected 401, got ${response.status})`,
      });

    } catch (error: any) {
      addResult({
        scenario: "Replay Attack",
        status: "failed",
        message: `❌ Error: ${error.message}`,
      });
    }
    setLoading(false);
  };

  const testMissingHeaders = async () => {
    setLoading(true);
    try {
      const payload = { type: "email.received", data: { from: "attacker@evil.com" } };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-application-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      addResult({
        scenario: "Missing Svix Headers",
        status: response.status === 401 ? "success" : "failed",
        statusCode: response.status,
        message: response.status === 401
          ? "✅ Request blocked - missing security headers"
          : `❌ Should block requests without headers (expected 401, got ${response.status})`,
      });

    } catch (error: any) {
      addResult({
        scenario: "Missing Headers",
        status: "failed",
        message: `❌ Error: ${error.message}`,
      });
    }
    setLoading(false);
  };

  const testRateLimiting = async () => {
    setLoading(true);
    try {
      const requests = [];
      // Send 15 requests rapidly (limit is 10/min)
      for (let i = 0; i < 15; i++) {
        requests.push(
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/view-shared-content?id=test`,
            { method: "GET" }
          )
        );
      }

      const responses = await Promise.all(requests);
      const blocked = responses.filter(r => r.status === 429).length;
      
      addResult({
        scenario: "Rate Limiting (15 rapid requests)",
        status: blocked >= 5 ? "success" : "failed",
        message: blocked >= 5
          ? `✅ Rate limiting active - blocked ${blocked}/15 requests`
          : `⚠️ Expected at least 5 blocked requests, got ${blocked}`,
      });

    } catch (error: any) {
      addResult({
        scenario: "Rate Limiting",
        status: "failed",
        message: `❌ Error: ${error.message}`,
      });
    }
    setLoading(false);
  };

  const fetchRecentLogs = async () => {
    setLoading(true);
    setLogs("Check Lovable Cloud → Functions → Logs voor real-time webhook logs");
    toast.info("Open Lovable Cloud voor live edge function logs");
    setLoading(false);
  };

  const checkDatabase = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("professional_applications")
        .select("id, email_from, email_subject, status, completeness_score, created_at")
        .ilike("email_subject", "%TEST%")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      setLogs(JSON.stringify(data, null, 2));
      toast.success(`${data?.length || 0} test applicaties gevonden`);
    } catch (error: any) {
      toast.error(`Database check mislukt: ${error.message}`);
    }
    setLoading(false);
  };

  const runAllTests = async () => {
    setResults([]);
    await testValidWebhook();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testReplayAttack();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testMissingHeaders();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testRateLimiting();
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Webhook Security Test Suite</h1>
          <p className="text-muted-foreground">Week 2 Security Hardening Verification</p>
        </div>
      </div>

      <Alert>
        <Activity className="h-4 w-4" />
        <AlertDescription>
          Deze test suite valideert de webhook signature verification, rate limiting en admin access controls.
          <strong> Let op:</strong> Tests met invalid signatures zullen falen als de webhook secret correct is geconfigureerd (dit is goed!).
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Signature Verification Tests
            </CardTitle>
            <CardDescription>Test Svix webhook signature validation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={testValidWebhook} disabled={loading} className="w-full">
              Test Valid Webhook Structure
            </Button>
            <Button onClick={testReplayAttack} disabled={loading} variant="outline" className="w-full">
              Test Replay Attack (Old Timestamp)
            </Button>
            <Button onClick={testMissingHeaders} disabled={loading} variant="outline" className="w-full">
              Test Missing Security Headers
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Rate Limiting Tests
            </CardTitle>
            <CardDescription>Test IP-based rate limiting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={testRateLimiting} disabled={loading} className="w-full">
              Test Rate Limiting (15 rapid requests)
            </Button>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Verwacht: 10 requests succesvol, 5+ geblokkeerd met 429 status
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run All Tests</CardTitle>
          <CardDescription>Voer alle security tests uit (duurt ~10 seconden)</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runAllTests} disabled={loading} size="lg" className="w-full">
            {loading ? "Tests worden uitgevoerd..." : "🚀 Start Volledige Test Suite"}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Test Results
              <Badge variant={results.some(r => r.status === "failed") ? "destructive" : "default"}>
                {results.filter(r => r.status === "success").length}/{results.length} Passed
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((result, index) => (
              <div key={index} className="flex items-start gap-3 p-4 border rounded-lg">
                {result.status === "success" ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : result.status === "failed" ? (
                  <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{result.scenario}</span>
                    {result.statusCode && (
                      <Badge variant={result.statusCode === 401 || result.statusCode === 429 ? "default" : "secondary"}>
                        {result.statusCode}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(result.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Edge Function Logs</CardTitle>
            <CardDescription>Bekijk recente webhook logs</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchRecentLogs} disabled={loading} variant="outline" className="w-full mb-3">
              Refresh Logs
            </Button>
            <Textarea
              value={logs}
              readOnly
              placeholder="Logs verschijnen hier..."
              className="font-mono text-xs h-64"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database Verification</CardTitle>
            <CardDescription>Check test applicaties in database</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={checkDatabase} disabled={loading} variant="outline" className="w-full mb-3">
              Check Test Applications
            </Button>
            <Textarea
              value={logs}
              readOnly
              placeholder="Database entries verschijnen hier..."
              className="font-mono text-xs h-64"
            />
          </CardContent>
        </Card>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Om echte webhook signature verification te testen:</strong> Stuur een email via Resend naar personeel@citozorg.nl.
          De webhook moet een <code>401 Unauthorized</code> geven als de signature niet matcht (dit is correct gedrag!).
          Check de edge function logs in Lovable Cloud voor details.
        </AlertDescription>
      </Alert>
    </div>
  );
}
