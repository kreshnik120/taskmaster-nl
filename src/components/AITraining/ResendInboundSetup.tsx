import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Mail, CheckCircle2, AlertCircle, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";

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
      console.error("Setup error:", error);
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
        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Deze setup maakt een inbound email domein aan zodat kandidaten kunnen 
              reageren op emails en de AI agent automatisch hun profiel kan bijwerken.
            </p>
            <Button onClick={runSetup} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setup uitvoeren...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Start Resend Inbound Setup
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Domain Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Domain:</span>
              <Badge variant={result.domain?.status === 'verified' ? 'default' : 'secondary'}>
                {result.domain?.name || 'inbound.citozorg.nl'}
              </Badge>
              {result.domain?.status === 'verified' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <span className="text-xs text-muted-foreground">
                ({result.domain?.status || result.is_verified ? 'verified' : 'pending'})
              </span>
            </div>

            {/* MX Record for DNS */}
            {result.mx_record && (
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="text-sm font-medium">📋 DNS Record toe te voegen:</h4>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Host:</span>
                    <div className="font-mono bg-background p-1 rounded flex items-center justify-between">
                      {result.mx_record.host}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 w-5 p-0"
                        onClick={() => copyToClipboard(result.mx_record!.host)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <div className="font-mono bg-background p-1 rounded">{result.mx_record.type}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Value:</span>
                    <div className="font-mono bg-background p-1 rounded flex items-center justify-between text-[10px]">
                      <span className="truncate">{result.mx_record.value}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 w-5 p-0 ml-1"
                        onClick={() => copyToClipboard(result.mx_record!.value)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-muted-foreground">Priority:</span>
                  <span className="font-mono">{result.mx_record.priority || 10}</span>
                  <span className="text-muted-foreground ml-4">TTL:</span>
                  <span className="font-mono">{result.mx_record.ttl || '3600'}</span>
                </div>
              </div>
            )}

            {/* Webhook Info */}
            {result.webhook && (
              <div className="text-sm">
                <span className="font-medium">Webhook:</span>
                <span className="ml-2 text-green-600">✓ Geconfigureerd</span>
              </div>
            )}

            {/* Webhook Secret Warning */}
            {result.webhook_secret && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <p className="text-xs text-amber-800">
                  ⚠️ Webhook Secret gegenereerd. Deze is al opgeslagen als RESEND_WEBHOOK_SIGNING_SECRET.
                </p>
              </div>
            )}

            {/* Reply-To Address */}
            {result.reply_to_address && (
              <div className="bg-primary/5 p-3 rounded-lg">
                <span className="text-sm font-medium">Reply-To adres:</span>
                <code className="ml-2 bg-background px-2 py-1 rounded text-sm">
                  {result.reply_to_address}
                </code>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => copyToClipboard(result.reply_to_address!)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}

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
            <div className="flex gap-2 pt-2">
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
                Trigger Verificatie
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
