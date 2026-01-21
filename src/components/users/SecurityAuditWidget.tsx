import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface SecurityAuditEntry {
  id: string;
  event_type: string;
  email: string | null;
  provider: string | null;
  blocked_reason: string | null;
  created_at: string;
}

export function SecurityAuditWidget() {
  const { data: blockedAttempts, isLoading } = useQuery({
    queryKey: ['security-audit-blocked'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_audit_log')
        .select('*')
        .eq('event_type', 'oauth_signup_blocked')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as SecurityAuditEntry[];
    },
  });

  // Don't render if no blocked attempts
  if (!isLoading && (!blockedAttempts || blockedAttempts.length === 0)) {
    return null;
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          Geblokkeerde OAuth Pogingen ({blockedAttempts?.length || 0})
        </CardTitle>
        <CardDescription>
          Recente pogingen om in te loggen via Google/GitHub zonder uitnodiging
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Laden...</div>
        ) : (
          <div className="space-y-3">
            {blockedAttempts?.map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center justify-between p-3 bg-background rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="font-medium text-sm">{attempt.email || 'Onbekend'}</p>
                    <p className="text-xs text-muted-foreground">
                      {attempt.blocked_reason}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {attempt.provider}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(attempt.created_at), { 
                      addSuffix: true, 
                      locale: nl 
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
