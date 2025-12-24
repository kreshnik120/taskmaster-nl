import { AlertCircle, GraduationCap, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';
import { isValidHealthcareDiploma, VALID_HEALTHCARE_DIPLOMAS } from '@/lib/hrValidation';

interface DiplomaVerificationBannerProps {
  applicationId: string;
  functieNiveau: string | null | undefined;
  diplomaFilePath: string | null | undefined;
  diplomaStatus: string | null | undefined;
  onStatusUpdated: () => void;
}

export function DiplomaVerificationBanner({
  applicationId,
  functieNiveau,
  diplomaFilePath,
  diplomaStatus,
  onStatusUpdated
}: DiplomaVerificationBannerProps) {
  const [rejecting, setRejecting] = useState(false);

  // Check if diploma is valid healthcare diploma
  const hasValidDiploma = isValidHealthcareDiploma(functieNiveau);
  const hasDiplomaFile = !!diplomaFilePath;

  // If has valid diploma, don't show warning
  if (hasValidDiploma && hasDiplomaFile) {
    return null;
  }

  // Handle auto-rejection for missing healthcare diploma
  const handleAutoReject = async () => {
    if (!window.confirm(
      'Weet u zeker dat u deze sollicitant wilt afwijzen wegens ontbreken zorgdiploma?\n\n' +
      'Er wordt automatisch een vriendelijke afwijzingsmail verzonden.'
    )) {
      return;
    }

    setRejecting(true);
    try {
      // Update application status to rejected with reason
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          status: 'afgewezen',
          pipeline_stage: 'afgewezen',
          rejection_reason: 'Geen geldig zorgdiploma aanwezig. Voor onze opdrachtgevers is een erkend zorgdiploma (VIG, HBO-V, MBO-V, etc.) vereist.'
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Log system event for AI learning
      await supabase.from('system_events').insert({
        org_id: '550e8400-e29b-41d4-a716-446655440000', // Default org
        event_type: 'application_auto_rejected',
        entity_type: 'professional_application',
        entity_id: applicationId,
        event_data: {
          reason: 'no_healthcare_diploma',
          functie_niveau: functieNiveau,
          has_diploma_file: hasDiplomaFile
        },
        metadata: { source: 'diploma_verification_banner' }
      });

      // Trigger rejection email via AI agent
      await supabase.functions.invoke('ai-agent-orchestrator', {
        body: {
          action: 'send_rejection_email',
          application_id: applicationId,
          reason: 'no_healthcare_diploma'
        }
      });

      toast.success('Sollicitant afgewezen - afwijzingsmail wordt verzonden');
      onStatusUpdated();
    } catch (error) {
      console.error('Error rejecting application:', error);
      toast.error('Fout bij afwijzen sollicitant');
    } finally {
      setRejecting(false);
    }
  };

  // Show different warnings based on situation
  if (!functieNiveau && !hasDiplomaFile) {
    // No diploma info at all
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle className="font-semibold">Diploma informatie ontbreekt</AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Er is geen functieniveau of diploma geüpload. Vraag de kandidaat om diploma-informatie.
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-xs text-muted-foreground">Geaccepteerde diploma's:</span>
            {VALID_HEALTHCARE_DIPLOMAS.slice(0, 8).map(d => (
              <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
            ))}
            <Badge variant="outline" className="text-xs">...</Badge>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (!hasValidDiploma) {
    // Has functie_niveau but not a valid healthcare diploma
    return (
      <Alert variant="destructive" className="mb-4 border-red-500 bg-red-50 dark:bg-red-950/30">
        <XCircle className="h-5 w-5 text-red-600" />
        <AlertTitle className="text-red-800 dark:text-red-400 font-semibold flex items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          Geen erkend zorgdiploma
        </AlertTitle>
        <AlertDescription className="text-red-700 dark:text-red-300">
          <p className="mb-2">
            <strong>Functieniveau:</strong> {functieNiveau || 'Niet opgegeven'}
          </p>
          <p className="mb-3">
            Dit is geen erkend zorgdiploma. Voor bemiddeling in de zorg is een geldig 
            diploma vereist (VIG, HBO-V, MBO-V, Verpleegkundige, Verzorgende, Helpende, etc.).
          </p>
          <div className="flex items-center gap-3">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleAutoReject}
              disabled={rejecting}
            >
              <XCircle className="h-4 w-4 mr-2" />
              {rejecting ? 'Afwijzen...' : 'Afwijzen (geen zorgdiploma)'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Er wordt automatisch een vriendelijke afwijzingsmail verzonden
            </span>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Has valid diploma type but no file uploaded
  if (hasValidDiploma && !hasDiplomaFile) {
    return (
      <Alert className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
        <GraduationCap className="h-5 w-5 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-400 font-semibold">
          Diploma document ontbreekt
        </AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <p>
            Functieniveau <strong>{functieNiveau}</strong> is een geldig zorgdiploma, 
            maar het diploma document is nog niet geüpload. Vraag de kandidaat het diploma te uploaden.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
