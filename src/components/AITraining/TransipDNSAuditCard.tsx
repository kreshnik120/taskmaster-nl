import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface TransIPDNSEntry {
  name: string;
  expire: number;
  type: string;
  content: string;
}

interface QuickChecks {
  mx_ok: boolean;
  spf_ok: boolean;
  dkim_ok: boolean;
  tracking_ok: boolean;
}

interface AuditResult {
  success: boolean;
  total_entries: number;
  filtered_entries: TransIPDNSEntry[];
  quick_checks: QuickChecks;
  notes: string[];
  error?: string;
}

export function TransipDNSAuditCard() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const handleAudit = async () => {
    setIsChecking(true);
    setResult(null);

    try {
      console.log('🔍 Starting TransIP DNS audit...');
      
      const { data, error } = await supabase.functions.invoke('transip-dns-audit', {
        body: {
          base_domain: 'citozorg.nl',
          filter_subdomain: 'apply'
        }
      });

      if (error) throw error;

      console.log('✅ Audit complete:', data);
      setResult(data);

      if (data.success) {
        const allOk = Object.values(data.quick_checks).every(v => v === true);
        if (allOk) {
          toast.success("Alle DNS records zijn correct geconfigureerd!");
        } else {
          toast.warning("Sommige DNS records ontbreken of zijn incorrect");
        }
      } else {
        const errorMsg = data.error || "Audit mislukt";
        toast.error(errorMsg);
        
        // Extra hints voor 401 errors
        if (errorMsg.includes('401') || errorMsg.includes('authentication')) {
          console.error('💡 TransIP Auth Hint: Controleer 1) issuer="atashi", 2) private key format (PKCS#8), 3) key is niet verlopen');
        }
      }
    } catch (error: any) {
      console.error('❌ Audit error:', error);
      const errorMsg = error.message || 'Onbekende fout';
      toast.error(`Fout bij controleren: ${errorMsg}`);
      
      // Extra hints voor auth problemen
      if (errorMsg.includes('401') || errorMsg.includes('authentication')) {
        toast.error('Authenticatie mislukt. Check: 1) Issuer moet "atashi" zijn, 2) Private key formaat moet PKCS#8 zijn, 3) Key moet geldig zijn');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const getCheckIcon = (isOk: boolean) => {
    return isOk ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <CardTitle>TransIP DNS Audit</CardTitle>
        </div>
        <CardDescription>
          Controleer welke DNS records momenteel in TransIP staan voor apply.citozorg.nl
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleAudit} 
          disabled={isChecking}
          className="w-full"
        >
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              DNS records controleren...
            </>
          ) : (
            'Check TransIP DNS'
          )}
        </Button>

        {result && (
          <div className="space-y-4 mt-4">
            {/* Quick Checks */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Status Checks</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  {getCheckIcon(result.quick_checks.mx_ok)}
                  <span className="text-sm">MX Records</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  {getCheckIcon(result.quick_checks.spf_ok)}
                  <span className="text-sm">SPF Record</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  {getCheckIcon(result.quick_checks.dkim_ok)}
                  <span className="text-sm">DKIM Records</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  {getCheckIcon(result.quick_checks.tracking_ok)}
                  <span className="text-sm">Tracking CNAME</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {result.notes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Opmerkingen</h3>
                <div className="space-y-1">
                  {result.notes.map((note, idx) => (
                    <p key={idx} className="text-sm text-muted-foreground">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* DNS Records */}
            {result.filtered_entries.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Relevante DNS Records ({result.filtered_entries.length} van {result.total_entries})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.filtered_entries.map((entry, idx) => (
                    <div key={idx} className="p-3 bg-muted rounded-md space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{entry.type}</Badge>
                        <span className="text-sm font-mono">{entry.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        {entry.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        TTL: {entry.expire}s
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
