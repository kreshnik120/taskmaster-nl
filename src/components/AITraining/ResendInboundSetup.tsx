import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Mail, CheckCircle2, AlertCircle, Copy, ExternalLink, Loader2, RefreshCw, Bug, Zap } from "lucide-react";
import { logger } from "@/lib/logger";

const log = logger.create('ResendInboundSetup');

interface DnsRecord {
  host: string;
  type: string;
  value: string;
  priority?: number;
  ttl?: string;
}

interface SetupResult {
  success: boolean;
  domain?: {
    id: string;
    name: string;
    status: string;
  };
  dns_records?: any[];
  mx_record?: DnsRecord;
  webhook?: {
    id: string;
    endpoint_url: string;
    events: string[];
  };
  webhook_secret?: string;
  next_steps?: string[];
  reply_to_address?: string;
  error?: string;
  message?: string;
  is_verified?: boolean;
}

export function ResendInboundSetup() {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);

  const runSetup = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-resend-inbound', {
        body: { action: 'setup' }
      });

      if (error) throw error;

      setResult(data);
      if (data.success) {
        toast.success("Resend Inbound setup gestart!");
      } else {
        toast.error(data.error || "Setup mislukt");
      }
    } catch (error: any) {
      log.error("Setup error:", error);
      toast.error(error.message || "Setup mislukt");
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-resend-inbound', {
        body: { action: 'check_status' }
      });

      if (error) throw error;

      setResult(data);
      if (data.is_verified) {
        toast.success("Domain is geverifieerd! 🎉");
      } else {
        toast.info("Domain nog niet geverifieerd - check DNS");
      }
    } catch (error: any) {
      toast.error(error.message || "Status check mislukt");
    } finally {
      setCheckingStatus(false);
    }
  };

  const triggerVerify = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('setup-resend-inbound', {
        body: { action: 'verify' }
      });

      if (error) throw error;
      toast.success(data.message || "Verificatie gestart");
    } catch (error: any) {
      toast.error(error.message || "Verificatie mislukt");
    }
  };

  const testWebhook = async () => {
    setTestingWebhook(true);
    try {
      // Simulate a minimal inbound email to test the webhook handler
      const testPayload = {
        type: "email.received",
        data: {
          from: "test@example.com",
          to: "recruitment@inbound.citozorg.nl",
          subject: "TEST - Webhook Test",
          text: "Dit is een test bericht om te controleren of de webhook werkt. Mijn telefoonnummer is 0612345678."
        }
      };

      // Test the main webhook entry point (process-application-email routes replies internally)
      const { data, error } = await supabase.functions.invoke('process-application-email', {
        body: testPayload
      });

      if (error) {
        log.error("Webhook test error:", error);
        toast.error(`Webhook test mislukt: ${error.message}`);
      } else {
        log.log("Webhook test response:", data);
        toast.success("Webhook test succesvol! Check de logs voor details.");
      }
    } catch (error: any) {
      log.error("Webhook test error:", error);
      toast.error(error.message || "Webhook test mislukt");
    } finally {
      setTestingWebhook(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Gekopieerd naar klembord");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Resend Inbound Email Setup
        </CardTitle>
        <CardDescription>
          Configureer automatische email verwerking voor AI recruitment agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* DNS Configuration Instructions - Always Show */}
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg space-y-2">
          <h4 className="text-sm font-medium text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Vereiste DNS Configuratie
          </h4>
          <p className="text-xs text-amber-700">
            Voeg het volgende MX record toe aan je DNS bij citozorg.nl:
          </p>
          <div className="bg-white p-3 rounded border border-amber-200 space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Host/Name:</span>
              <code className="bg-amber-100 px-2 py-0.5 rounded font-mono">inbound</code>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard('inbound')}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Type:</span>
              <code className="bg-amber-100 px-2 py-0.5 rounded font-mono">MX</code>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Value:</span>
              <code className="bg-amber-100 px-2 py-0.5 rounded font-mono text-[10px]">inbound.resend.com</code>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard('inbound.resend.com')}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Priority:</span>
              <code className="bg-amber-100 px-2 py-0.5 rounded font-mono">10</code>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            Na het toevoegen duurt het 5-30 minuten voordat DNS propageert.
          </p>
        </div>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Deze setup maakt een inbound email domein aan zodat kandidaten kunnen 
              reageren op emails en de AI agent automatisch hun profiel kan bijwerken.
            </p>
            <div className="flex gap-2">
              <Button onClick={runSetup} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setup uitvoeren...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Start Setup
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={checkStatus} disabled={checkingStatus}>
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check Status
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Domain Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Domain:</span>
              <Badge variant={result.domain?.status === 'verified' || result.is_verified ? 'default' : 'secondary'}>
                {result.domain?.name || 'inbound.citozorg.nl'}
              </Badge>
              {result.domain?.status === 'verified' || result.is_verified ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <span className="text-xs text-muted-foreground">
                ({result.domain?.status || (result.is_verified ? 'verified' : 'pending')})
              </span>
            </div>

            {/* Webhook Info */}
            {result.webhook && (
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Webhook:</span>
                  <span className="text-green-600">✓ Geconfigureerd</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  URL: {result.webhook.endpoint_url}
                </div>
              </div>
            )}

            {/* Reply-To Address */}
            <div className="bg-primary/5 p-3 rounded-lg">
              <span className="text-sm font-medium">Reply-To adres:</span>
              <code className="ml-2 bg-background px-2 py-1 rounded text-sm">
                recruitment@inbound.citozorg.nl
              </code>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => copyToClipboard('recruitment@inbound.citozorg.nl')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            {/* Next Steps */}
            {result.next_steps && result.next_steps.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Volgende stappen:</h4>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  {result.next_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={checkStatus} disabled={checkingStatus}>
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check Status
              </Button>
              <Button variant="outline" size="sm" onClick={triggerVerify}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Verificatie
              </Button>
              <Button variant="outline" size="sm" onClick={testWebhook} disabled={testingWebhook}>
                {testingWebhook ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Bug className="h-4 w-4 mr-2" />
                )}
                Test Webhook
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.open('https://resend.com/domains', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Resend Dashboard
              </Button>
            </div>

            {/* Message */}
            {result.message && (
              <p className="text-sm text-muted-foreground">{result.message}</p>
            )}

            {/* Error */}
            {result.error && (
              <p className="text-sm text-red-600">{result.error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
