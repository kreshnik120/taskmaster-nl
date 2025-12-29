import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, FileWarning, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MonitorResult {
  success: boolean;
  checked_at: string;
  expiring_documents_found: number;
  goals_created: number;
  reminders_marked: number;
  expired_documents_count: number;
}

export function ManualDocumentMonitorTrigger() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<MonitorResult | null>(null);

  const triggerMonitor = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-document-expiry', {
        body: {}
      });

      if (error) throw error;

      setLastResult(data);
      
      if (data.goals_created > 0) {
        toast.success(`${data.goals_created} renewal goal(s) aangemaakt`);
      } else if (data.expiring_documents_found === 0) {
        toast.info('Geen documenten gevonden die bijna verlopen');
      } else {
        toast.info('Monitor check voltooid');
      }
    } catch (error) {
      console.error('Monitor error:', error);
      toast.error('Fout bij document monitor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileWarning className="h-4 w-4" />
          Document Expiry Monitor
        </CardTitle>
        <CardDescription>
          Handmatig triggeren van document verval check (normaal dagelijks om 6:00)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={triggerMonitor} 
          disabled={isLoading}
          variant="outline"
          className="w-full"
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Check Expiring Documents
        </Button>

        {lastResult && (
          <div className="text-sm space-y-2 p-3 rounded-md bg-muted">
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">
                Laatste check: {new Date(lastResult.checked_at).toLocaleTimeString('nl-NL')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>Expiring docs: {lastResult.expiring_documents_found}</div>
              <div>Goals created: {lastResult.goals_created}</div>
              <div>Reminders sent: {lastResult.reminders_marked}</div>
              <div>Expired: {lastResult.expired_documents_count}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
