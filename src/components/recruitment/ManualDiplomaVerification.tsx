import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ExternalLink, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface ManualDiplomaVerificationProps {
  applicationId: string;
  currentStatus: string;
  onStatusUpdate?: () => void;
}

const DUO_PORTAL_URL = 'https://zakelijk.duo.nl/portaal/diplomacontrole/';

export function ManualDiplomaVerification({
  applicationId,
  currentStatus,
  onStatusUpdate,
}: ManualDiplomaVerificationProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'instructions' | 'verify'>('instructions');

  const handleVerification = async (verified: boolean) => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-diploma-duo', {
        body: {
          action: 'manual_verify',
          application_id: applicationId,
          verified,
          notes: notes || `Handmatig ${verified ? 'goedgekeurd' : 'afgekeurd'} via DUO portaal controle`,
        },
      });

      if (error) throw error;

      toast.success(verified 
        ? 'Diploma is handmatig geverifieerd' 
        : 'Diploma is als ongeldig gemarkeerd'
      );
      onStatusUpdate?.();
    } catch (error) {
      logger.error('Manual verification error:', error);
      toast.error('Fout bij opslaan van verificatie');
    } finally {
      setIsVerifying(false);
    }
  };

  // Only show for manual_review or error statuses
  if (!['manual_review', 'duo_error', 'duo_not_digital'].includes(currentStatus)) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Handmatige Diploma Verificatie
        </CardTitle>
        <CardDescription className="text-xs">
          Automatische verificatie was niet mogelijk. Volg onderstaande stappen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'instructions' && (
          <>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Stappen:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Open het DUO Diplomacontrole portaal (link hieronder)</li>
                <li>Upload het diploma PDF bestand</li>
                <li>Controleer het resultaat van DUO</li>
                <li>Keer terug en kies hieronder de juiste status</li>
              </ol>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(DUO_PORTAL_URL, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open DUO Diplomacontrole
            </Button>

            <Button
              variant="default"
              className="w-full"
              onClick={() => setStep('verify')}
            >
              Ik heb de controle uitgevoerd
            </Button>
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Notities (optioneel)
              </label>
              <Textarea
                placeholder="Bijvoorbeeld: DUO toont 'diploma is authentiek', uitgiftedatum 2019"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                onClick={() => handleVerification(true)}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Geverifieerd
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => handleVerification(false)}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Ongeldig
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setStep('instructions')}
            >
              ← Terug naar instructies
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
