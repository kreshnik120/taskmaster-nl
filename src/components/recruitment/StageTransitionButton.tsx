import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, ShieldAlert, FileWarning } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type PipelineStage = 'nieuw' | 'interview' | 'screening' | 'goedgekeurd' | 'geplaatst' | 'afgewezen';

interface StageTransitionButtonProps {
  applicationId: string;
  currentStage: PipelineStage;
  targetStage: PipelineStage;
  vogStatus?: string;
  diplomaStatus?: string;
  onSuccess?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  nieuw: 'Nieuw',
  interview: 'Interview',
  screening: 'Screening',
  goedgekeurd: 'Goedgekeurd',
  geplaatst: 'Geplaatst',
  afgewezen: 'Afgewezen'
};

// Define which transitions require document verification
const DOCUMENT_REQUIREMENTS: Partial<Record<PipelineStage, { vog?: string[]; diploma?: string[] }>> = {
  screening: {
    vog: ['received', 'validating', 'authentic_ok', 'manual_review'] // VOG must at least be received
  },
  goedgekeurd: {
    vog: ['authentic_ok'] // VOG must be verified
  }
};

export function StageTransitionButton({
  applicationId,
  currentStage,
  targetStage,
  vogStatus = 'missing',
  diplomaStatus = 'missing',
  onSuccess,
  variant = 'default',
  size = 'default',
  className,
  children
}: StageTransitionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showBlockingDialog, setShowBlockingDialog] = useState(false);
  const [blockingReason, setBlockingReason] = useState<string | null>(null);

  // Check if transition is blocked by document requirements
  const checkDocumentRequirements = (): { blocked: boolean; reason: string | null } => {
    const requirements = DOCUMENT_REQUIREMENTS[targetStage];
    if (!requirements) return { blocked: false, reason: null };

    if (requirements.vog && !requirements.vog.includes(vogStatus)) {
      if (targetStage === 'goedgekeurd') {
        return { 
          blocked: true, 
          reason: 'VOG moet geverifieerd zijn (GAAV of handmatig) voordat de kandidaat goedgekeurd kan worden.'
        };
      }
      if (targetStage === 'screening') {
        return { 
          blocked: true, 
          reason: 'VOG document moet ontvangen zijn voordat screening kan starten.'
        };
      }
    }

    return { blocked: false, reason: null };
  };

  const handleTransition = async () => {
    // First check document requirements
    const { blocked, reason } = checkDocumentRequirements();
    if (blocked) {
      setBlockingReason(reason);
      setShowBlockingDialog(true);
      return;
    }

    setIsLoading(true);
    try {
      // Use the central transition function
      const { data, error } = await supabase.rpc('transition_application_stage', {
        p_application_id: applicationId,
        p_to_stage: targetStage,
        p_reason: `Stage transition via UI: ${currentStage} → ${targetStage}`,
        p_metadata: {
          source: 'ui_button',
          vog_status: vogStatus,
          diploma_status: diplomaStatus,
          timestamp: new Date().toISOString()
        }
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; idempotent?: boolean };

      if (result.success) {
        if (result.idempotent) {
          toast.info('Kandidaat is al in deze fase');
        } else {
          toast.success(`Kandidaat verplaatst naar ${STAGE_LABELS[targetStage]}`);
        }
        onSuccess?.();
      } else {
        // Check if blocked by document requirement
        if (result.error?.includes('VOG') || result.error?.includes('document')) {
          setBlockingReason(result.error);
          setShowBlockingDialog(true);
        } else {
          toast.error(result.error || 'Transitie niet toegestaan');
        }
      }
    } catch (error) {
      console.error('Stage transition error:', error);
      toast.error('Fout bij verplaatsen van kandidaat');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleTransition}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          children || (
            <>
              <span>{STAGE_LABELS[targetStage]}</span>
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )
        )}
      </Button>

      {/* Document Blocking Dialog */}
      <AlertDialog open={showBlockingDialog} onOpenChange={setShowBlockingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Document Verificatie Vereist
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>{blockingReason}</p>
              
              <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm">VOG Status:</span>
                  <Badge variant={vogStatus === 'authentic_ok' ? 'default' : 'secondary'}>
                    {vogStatus === 'missing' && '❌ Ontbreekt'}
                    {vogStatus === 'received' && '📥 Ontvangen'}
                    {vogStatus === 'validating' && '⏳ Valideren...'}
                    {vogStatus === 'authentic_ok' && '✅ Geverifieerd'}
                    {vogStatus === 'authentic_fail' && '❌ Ongeldig'}
                    {vogStatus === 'expired' && '⚠️ Verlopen'}
                    {vogStatus === 'manual_review' && '👁️ Handmatig'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Diploma Status:</span>
                  <Badge variant={diplomaStatus.includes('verified') ? 'default' : 'secondary'}>
                    {diplomaStatus === 'missing' && '❌ Ontbreekt'}
                    {diplomaStatus === 'received' && '📥 Ontvangen'}
                    {diplomaStatus === 'verified_emrex' && '✅ EMREX'}
                    {diplomaStatus === 'verified_manual' && '✅ Handmatig'}
                    {diplomaStatus === 'manual_review' && '👁️ Controle'}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Upload het benodigde document of verifieer het handmatig in het Document tab.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Sluiten</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
