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
    <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Alert variant="destructive" className="relative">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="pr-8">Backend tijdelijk offline</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p className="text-sm">
            De backend is momenteel niet bereikbaar. Dit is waarschijnlijk een tijdelijke platformstoring.
            Laatste check: {formatLastCheck()}
          </p>
          {errorMessage && (
            <p className="text-xs opacity-80 font-mono">{errorMessage}</p>
          )}
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              variant="outline"
              onClick={retry}
              disabled={status === 'checking'}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${status === 'checking' ? 'animate-spin' : ''}`} />
              Opnieuw proberen
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => navigate('/diagnostics')}
            >
              Diagnostics
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="ml-auto"
            >
              Sluiten
            </Button>
          </div>
        </AlertDescription>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-6 w-6"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    </div>
  );
};
