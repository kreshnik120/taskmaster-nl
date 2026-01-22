import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, ShieldAlert, Calendar, ThumbsUp, ThumbsDown, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type PipelineStage = 'nieuw' | 'intake_verstuurd' | 'gesprek_gepland' | 'interview' | 'screening' | 'goedgekeurd' | 'geplaatst' | 'afgewezen';

interface StageTransitionButtonProps {
  applicationId: string;
  currentStage: PipelineStage;
  targetStage: PipelineStage;
  vogStatus?: string;
  diplomaStatus?: string;
  gesprekDatum?: string | null;
  gesprekFeedback?: string | null;
  onSuccess?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  nieuw: 'Nieuw',
  intake_verstuurd: 'Intake Verstuurd',
  gesprek_gepland: 'Gesprek Gepland',
  interview: 'Interview',  // Legacy
  screening: 'Screening',
  goedgekeurd: 'Goedgekeurd',
  geplaatst: 'Geplaatst',
  afgewezen: 'Afgewezen'
};

// Define which transitions require document verification
// CORRECTE FLOW (6-stage): intake_verstuurd → gesprek_gepland → screening (na positieve feedback) → goedgekeurd
const DOCUMENT_REQUIREMENTS: Partial<Record<PipelineStage, { vog?: string[]; diploma?: string[] }>> = {
  gesprek_gepland: {
    diploma: ['verified_duo', 'verified_manual', 'verified_emrex'] // Diploma moet geverifieerd zijn voor gesprek
  },
  interview: {
    diploma: ['verified_duo', 'verified_manual', 'verified_emrex'] // Legacy support
  },
  screening: {
    // VOG wordt hier pas AANGEVRAAGD, niet gecontroleerd
    diploma: ['verified_duo', 'verified_manual', 'verified_emrex']
  },
  goedgekeurd: {
    vog: ['authentic_ok', 'valid', 'verified_gaav'], // VOG must be verified for final approval
    diploma: ['verified_duo', 'verified_manual', 'verified_emrex']
  }
};

export function StageTransitionButton({
  applicationId,
  currentStage,
  targetStage,
  vogStatus = 'missing',
  diplomaStatus = 'missing',
  gesprekDatum = null,
  gesprekFeedback = null,
  onSuccess,
  variant = 'default',
  size = 'default',
  className,
  children
}: StageTransitionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showBlockingDialog, setShowBlockingDialog] = useState(false);
  const [blockingReason, setBlockingReason] = useState<string | null>(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  // Check if transition is blocked by document requirements
  const checkDocumentRequirements = (): { blocked: boolean; reason: string | null } => {
    const requirements = DOCUMENT_REQUIREMENTS[targetStage];
    if (!requirements) return { blocked: false, reason: null };

    // Check diploma requirements
    if (requirements.diploma && !requirements.diploma.includes(diplomaStatus)) {
      if (targetStage === 'gesprek_gepland' || targetStage === 'interview') {
        return { 
          blocked: true, 
          reason: 'Diploma moet geverifieerd zijn (DUO, EMREX of handmatig) voordat het gesprek gepland kan worden.'
        };
      }
      if (targetStage === 'goedgekeurd') {
        return { 
          blocked: true, 
          reason: 'Diploma moet geverifieerd zijn voordat de kandidaat goedgekeurd kan worden.'
        };
      }
    }

    if (requirements.vog && !requirements.vog.includes(vogStatus)) {
      if (targetStage === 'goedgekeurd') {
        return { 
          blocked: true, 
          reason: 'VOG moet geverifieerd zijn (GAAV of handmatig) voordat de kandidaat goedgekeurd kan worden.'
        };
      }
    }

    // KRITIEK: Transitie naar screening vereist positieve gesprek feedback
    if (targetStage === 'screening') {
      if (!gesprekFeedback || gesprekFeedback !== 'positive') {
        return {
          blocked: true,
          reason: 'Transitie naar screening is alleen mogelijk na een positief gesprek. Vul eerst de gesprek feedback in.'
        };
      }
    }

    // Gesprek_gepland vereist dat er een datum gezet is
    if (targetStage === 'screening' && currentStage === 'gesprek_gepland') {
      if (!gesprekDatum) {
        return {
          blocked: true,
          reason: 'Er is nog geen gesprek datum ingevuld. Plan eerst een gesprek voordat je naar screening kunt gaan.'
        };
      }
    }

    return { blocked: false, reason: null };
  };

  // Handle transition to screening - requires feedback first
  const handleTransitionToScreening = () => {
    if (currentStage === 'gesprek_gepland' || currentStage === 'interview') {
      // Show feedback dialog if no feedback yet
      if (!gesprekFeedback || gesprekFeedback === 'pending') {
        setShowFeedbackDialog(true);
        return;
      }
    }
    handleTransition();
  };

  const handleFeedbackSubmit = async (feedback: 'positive' | 'negative' | 'no_show') => {
    setIsLoading(true);
    try {
      // Update gesprek_feedback on application
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          gesprek_feedback: feedback,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      if (feedback === 'positive') {
        // Proceed to screening + trigger VOG request
        const { error } = await supabase.rpc('transition_application_stage', {
          p_application_id: applicationId,
          p_to_stage: 'screening',
          p_reason: `Gesprek positief afgerond - transitie naar screening + VOG aanvraag`,
          p_metadata: {
            source: 'ui_feedback_button',
            gesprek_feedback: feedback,
            vog_status: vogStatus,
            diploma_status: diplomaStatus,
            trigger_vog_request: true,
            timestamp: new Date().toISOString()
          }
        });

        if (error) throw error;

        // Create VOG request goal
        await supabase.from('agent_goals').insert({
          org_id: '650e8400-e29b-41d4-a716-446655440001', // Default to CitoZorg
          goal_type: 'request_vog',
          goal_description: 'VOG aanvragen na positief gesprek (max 3 maanden oud)',
          priority: 90,
          input_data: {
            application_id: applicationId,
            vog_max_age_months: 3,
            trigger_source: 'positive_interview_feedback'
          },
          status: 'pending'
        });

        toast.success('Gesprek positief! Kandidaat naar screening, VOG wordt aangevraagd');
        onSuccess?.();
      } else if (feedback === 'negative') {
        // Update application with pending review status
        await supabase
          .from('professional_applications')
          .update({ 
            pending_human_review: true,
            gesprek_feedback: 'negative',
            updated_at: new Date().toISOString()
          })
          .eq('id', applicationId);

        toast.warning('Negatieve feedback opgeslagen. Afwijzing wacht op goedkeuring.');
        onSuccess?.();
      } else if (feedback === 'no_show') {
        toast.info('No-show geregistreerd. Plan evt. een nieuwe afspraak.');
        onSuccess?.();
      }
    } catch (error) {
      console.error('Feedback error:', error);
      toast.error('Fout bij opslaan feedback');
    } finally {
      setIsLoading(false);
      setShowFeedbackDialog(false);
    }
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
          gesprek_datum: gesprekDatum,
          gesprek_feedback: gesprekFeedback,
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
        if (result.error?.includes('VOG') || result.error?.includes('document') || result.error?.includes('gesprek')) {
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

  // Determine which handler to use
  const handleClick = () => {
    if (targetStage === 'screening' && (currentStage === 'gesprek_gepland' || currentStage === 'interview')) {
      handleTransitionToScreening();
    } else {
      handleTransition();
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
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

      {/* Gesprek Feedback Dialog - KRITIEK voor transitie naar screening */}
      <AlertDialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Gesprek Feedback Invullen
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Hoe is het sollicitatiegesprek verlopen?</p>
              <p className="text-sm text-muted-foreground">
                Bij een positieve beoordeling wordt de kandidaat naar de screening fase verplaatst en wordt automatisch een VOG aangevraagd (max 3 maanden oud).
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button 
              variant="default" 
              className="w-full justify-start gap-3 bg-green-600 hover:bg-green-700"
              onClick={() => handleFeedbackSubmit('positive')}
              disabled={isLoading}
            >
              <ThumbsUp className="h-5 w-5" />
              <span>Positief - Doorgaan naar screening</span>
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => handleFeedbackSubmit('negative')}
              disabled={isLoading}
            >
              <ThumbsDown className="h-5 w-5" />
              <span>Negatief - Afwijzing starten</span>
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3"
              onClick={() => handleFeedbackSubmit('no_show')}
              disabled={isLoading}
            >
              <UserX className="h-5 w-5" />
              <span>No-show - Niet verschenen</span>
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Annuleren</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Blocking Dialog */}
      <AlertDialog open={showBlockingDialog} onOpenChange={setShowBlockingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Transitie Geblokkeerd
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>{blockingReason}</p>
              
              <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Gesprek Feedback:</span>
                  <Badge variant={gesprekFeedback === 'positive' ? 'default' : 'secondary'}>
                    {!gesprekFeedback && '⏳ Nog niet ingevuld'}
                    {gesprekFeedback === 'pending' && '⏳ Wachtend'}
                    {gesprekFeedback === 'positive' && '✅ Positief'}
                    {gesprekFeedback === 'negative' && '❌ Negatief'}
                    {gesprekFeedback === 'no_show' && '👤 No-show'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">VOG Status:</span>
                  <Badge variant={vogStatus === 'authentic_ok' || vogStatus === 'valid' ? 'default' : 'secondary'}>
                    {vogStatus === 'missing' && '❌ Ontbreekt'}
                    {vogStatus === 'received' && '📥 Ontvangen'}
                    {vogStatus === 'validating' && '⏳ Valideren...'}
                    {(vogStatus === 'authentic_ok' || vogStatus === 'valid' || vogStatus === 'verified_gaav') && '✅ Geverifieerd'}
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
                    {diplomaStatus === 'verified_duo' && '✅ DUO Geverifieerd'}
                    {diplomaStatus === 'verified_emrex' && '✅ EMREX'}
                    {diplomaStatus === 'verified_manual' && '✅ Handmatig'}
                    {diplomaStatus === 'manual_review' && '👁️ Controle'}
                    {diplomaStatus === 'duo_invalid' && '⚠️ DUO Ongeldig'}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {targetStage === 'screening' 
                  ? 'Vul eerst de gesprek feedback in via de knop hierboven.'
                  : 'Upload het benodigde document of verifieer het handmatig in het Document tab.'}
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
