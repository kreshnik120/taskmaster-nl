import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ExternalLink, CheckCircle2, XCircle, Loader2, AlertCircle, ShieldCheck, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
      const { error } = await supabase.functions.invoke('verify-diploma-duo', {
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

  // Show for signature_valid status with enhanced messaging
  const isSignatureValid = currentStatus === 'signature_valid';
  
  // Show for manual_review, error, or signature_valid statuses
  if (!['manual_review', 'duo_error', 'duo_not_digital', 'signature_valid'].includes(currentStatus)) {
    return null;
  }

  return (
    <Card className={`border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 ${isSignatureValid ? 'border-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/20 dark:border-emerald-700' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isSignatureValid ? (
            <>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Digitale Handtekening Gevalideerd (95% betrouwbaar)
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Handmatige Diploma Verificatie
            </>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          {isSignatureValid 
            ? 'DUO digitale handtekening aanwezig. Voor 100% zekerheid: verifieer handmatig op DUO website.'
            : 'Automatische verificatie was niet mogelijk. Volg onderstaande stappen.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSignatureValid && (
          <Alert className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
            <Info className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-400">
              <strong>Goed nieuws:</strong> Dit diploma bevat een cryptografisch geverifieerde DUO digitale handtekening (PKCS7/CMS). 
              Dit is zeer betrouwbaar. De browser verificatie werd geblokkeerd door DUO's bot-detectie, maar de lokale 
              handtekeninganalyse bevestigt authenticiteit.
            </AlertDescription>
          </Alert>
        )}

        {step === 'instructions' && (
          <>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Stappen voor handmatige verificatie:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Open het DUO Diplomacontrole portaal (link hieronder)</li>
                <li>Upload het diploma PDF bestand</li>
                <li>Controleer het resultaat van DUO</li>
                <li>Keer terug en kies hieronder de juiste status</li>
              </ol>
            </div>

            <Button
              variant="outline"
              className="w-full border-primary/50 hover:bg-primary/5"
              onClick={() => window.open(DUO_PORTAL_URL, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open DUO Diplomacontrole (publiek toegankelijk)
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Deze link opent de officiële DUO verificatie website - geen login vereist
            </p>

            <Button
              variant="default"
              className="w-full"
              onClick={() => setStep('verify')}
            >
              Ik heb de controle uitgevoerd
            </Button>

            {isSignatureValid && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-emerald-600 hover:text-emerald-700"
                onClick={() => handleVerification(true)}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Accepteer handtekening als voldoende bewijs
              </Button>
            )}
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
