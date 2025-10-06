import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DNSSetupResponse {
  success: boolean;
  message: string;
  actions_taken?: string[];
  new_dns_records?: Array<{
    name: string;
    type: string;
    content: string;
  }>;
  mailgun_status?: {
    state: string;
    domain: string;
  };
  next_steps?: string[];
}

export function MailgunDNSSetup() {
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<DNSSetupResponse | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSetup = async () => {
    setIsRunning(true);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke('mailgun-transip-dns-setup');

      if (error) throw error;

      setResponse(data);

      if (data.success) {
        toast({
          title: "✅ DNS Setup Succesvol",
          description: data.message || "Mailgun DNS is geconfigureerd in TransIP",
        });
      } else {
        toast({
          title: "⚠️ DNS Setup Gedeeltelijk Succesvol",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("DNS Setup error:", error);
      toast({
        title: "❌ DNS Setup Mislukt",
        description: error.message || "Er is een fout opgetreden",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📧 Mailgun DNS Setup
        </CardTitle>
        <CardDescription>
          Automatische configuratie van Mailgun DNS records in TransIP voor apply.citozorg.nl
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleSetup}
          disabled={isRunning}
          className="w-full"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              DNS Setup uitvoeren...
            </>
          ) : (
            "🚀 Start DNS Setup"
          )}
        </Button>

        {response && (
          <div className="space-y-4 mt-4">
            <div className={`p-4 rounded-lg border-2 ${
              response.success 
                ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" 
                : "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800"
            }`}>
              <div className="flex items-start gap-2">
                {response.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{response.message}</p>
                </div>
              </div>
            </div>

            {response.actions_taken && response.actions_taken.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Uitgevoerde acties:</h4>
                <ul className="space-y-1">
                  {response.actions_taken.map((action, index) => (
                    <li key={index} className="text-sm flex items-start gap-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {response.new_dns_records && response.new_dns_records.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Nieuwe DNS records:</h4>
                <div className="space-y-2">
                  {response.new_dns_records.map((record, index) => (
                    <div key={index} className="p-3 bg-muted rounded-lg text-sm">
                      <div className="font-mono">
                        <span className="font-semibold">{record.type}</span> - {record.name}
                      </div>
                      <div className="text-muted-foreground mt-1 break-all">
                        {record.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {response.mailgun_status && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Mailgun Status:</h4>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <div><span className="font-semibold">Domain:</span> {response.mailgun_status.domain}</div>
                  <div><span className="font-semibold">Status:</span> {response.mailgun_status.state}</div>
                </div>
              </div>
            )}

            {response.next_steps && response.next_steps.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Volgende stappen:</h4>
                <ul className="space-y-1">
                  {response.next_steps.map((step, index) => (
                    <li key={index} className="text-sm flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400">→</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full">
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Verberg volledige response
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Toon volledige response (JSON)
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto max-h-96 mt-2">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-4 p-3 bg-muted rounded-lg">
          <p className="font-semibold mb-1">💡 Tip:</p>
          <p>Deze functie configureert automatisch alle benodigde DNS records voor Mailgun email verzending via apply.citozorg.nl in TransIP.</p>
        </div>
      </CardContent>
    </Card>
  );
}
