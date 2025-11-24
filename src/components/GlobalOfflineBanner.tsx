import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const GlobalOfflineBanner = () => {
  const { status, lastCheck, errorMessage, retry, isHealthy } = useBackendHealth();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (isHealthy || dismissed) return null;

  const formatLastCheck = () => {
    if (!lastCheck) return 'Nog niet gecontroleerd';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastCheck.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s geleden`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m geleden`;
    return `${Math.floor(diff / 3600)}u geleden`;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-destructive/50 shadow-lg">
      <Alert variant="destructive" className="rounded-none border-0">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="text-base font-bold flex items-center gap-2">
          🔴 Backend Kritiek Offline - 504/544 Timeouts
        </AlertTitle>
        <AlertDescription className="mt-2">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="space-y-2 flex-1">
              <p className="font-semibold text-sm">De backend database is al 48+ uur onbereikbaar. Data kan niet worden opgeslagen.</p>
              <div className="flex flex-col gap-1 text-xs">
                {lastCheck && (
                  <p className="opacity-80">
                    📅 Laatste controle: {formatLastCheck()}
                  </p>
                )}
                {errorMessage && (
                  <p className="opacity-90 font-mono bg-destructive/20 px-2 py-1 rounded max-w-fit">
                    ⚠️ {errorMessage}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:flex-shrink-0">
              <Button 
                size="sm"
                variant="outline"
                onClick={retry}
                disabled={status === 'checking'}
                className="bg-background hover:bg-accent"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${status === 'checking' ? 'animate-spin' : ''}`} />
                Opnieuw
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed(true)}
                className="hover:bg-background/50"
              >
                <X className="h-3 w-3 mr-1" />
                Sluiten
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};
