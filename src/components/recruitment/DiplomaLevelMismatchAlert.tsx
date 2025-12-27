import { AlertTriangle, GraduationCap, FileQuestion, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';

interface DiplomaLevelMismatch {
  detected_at: string;
  cv_functie: string;
  cv_niveau: number;
  diploma_niveau: number;
  mismatch_type: 'cv_higher' | 'cv_lower' | 'unknown';
  message: string;
  status: 'pending_review' | 'accepted' | 'rejected' | 'resolved';
}

interface DiplomaLevelMismatchAlertProps {
  applicationId: string;
  mismatchData: DiplomaLevelMismatch | null | undefined;
  candidateName: string;
  candidateEmail: string;
  onResolved: () => void;
}

export function DiplomaLevelMismatchAlert({
  applicationId,
  mismatchData,
  candidateName,
  candidateEmail,
  onResolved
}: DiplomaLevelMismatchAlertProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionType, setActionType] = useState<string | null>(null);

  // Don't show if no mismatch or already resolved
  if (!mismatchData || mismatchData.status === 'resolved' || mismatchData.mismatch_type !== 'cv_higher') {
    return null;
  }

  const handleAcceptLowerLevel = async () => {
    setIsProcessing(true);
    setActionType('accept');
    
    try {
      // Update extracted_data to mark mismatch as accepted at lower level
      const { data: app, error: fetchError } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();
      
      if (fetchError) throw fetchError;

      const updatedData = {
        ...(app?.extracted_data as any),
        diploma_level_mismatch: {
          ...mismatchData,
          status: 'accepted',
          resolution: 'accepted_lower_level',
          resolved_at: new Date().toISOString()
        },
        // Update functie_niveau to match diploma
        functie_niveau: getNiveauLabel(mismatchData.diploma_niveau)
      };

      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ extracted_data: updatedData })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Log learning event
      await supabase.from('ai_learning_events').insert([{
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        event_type: 'diploma_mismatch_resolution',
        context: {
          application_id: applicationId,
          original_mismatch: JSON.parse(JSON.stringify(mismatchData)),
          resolution: 'accepted_lower_level'
        },
        outcome: 'accepted_lower_level',
        confidence_score: 1.0
      }]);

      toast.success(`Functieniveau aangepast naar niveau ${mismatchData.diploma_niveau}`);
      onResolved();
    } catch (error) {
      console.error('Error accepting lower level:', error);
      toast.error('Fout bij accepteren lager niveau');
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  const handleRequestAdditionalDiploma = async () => {
    setIsProcessing(true);
    setActionType('request');
    
    try {
      // Create AI goal to send email requesting additional diploma
      await supabase.functions.invoke('ai-agent-orchestrator', {
        body: {
          action: 'create_goal',
          goal_type: 'request_additional_diploma',
          goal_description: `Vraag ${candidateName} om aanvullend diploma dat niveau ${mismatchData.cv_niveau} bewijst`,
          org_id: '550e8400-e29b-41d4-a716-446655440000',
          input_data: {
            application_id: applicationId,
            candidate_email: candidateEmail,
            candidate_name: candidateName,
            claimed_niveau: mismatchData.cv_niveau,
            proven_niveau: mismatchData.diploma_niveau,
            claimed_functie: mismatchData.cv_functie
          }
        }
      });

      // Update mismatch status
      const { data: app } = await supabase
        .from('professional_applications')
        .select('extracted_data')
        .eq('id', applicationId)
        .single();

      const updatedData = {
        ...(app?.extracted_data as any),
        diploma_level_mismatch: {
          ...mismatchData,
          status: 'pending_review',
          additional_diploma_requested: true,
          requested_at: new Date().toISOString()
        }
      };

      await supabase
        .from('professional_applications')
        .update({ extracted_data: updatedData })
        .eq('id', applicationId);

      toast.success('Verzoek voor aanvullend diploma wordt verstuurd');
      onResolved();
    } catch (error) {
      console.error('Error requesting additional diploma:', error);
      toast.error('Fout bij versturen verzoek');
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  const handleReject = async () => {
    if (!window.confirm('Weet u zeker dat u deze sollicitant wilt afwijzen wegens onjuiste niveau claim?')) {
      return;
    }

    setIsProcessing(true);
    setActionType('reject');
    
    try {
      // Update application status
      await supabase
        .from('professional_applications')
        .update({ 
          status: 'afgewezen',
          pipeline_stage: 'afgewezen',
          rejection_reason: `Niveau discrepantie: CV vermeldt niveau ${mismatchData.cv_niveau} maar diploma bewijst niveau ${mismatchData.diploma_niveau}`
        })
        .eq('id', applicationId);

      // Log learning event
      await supabase.from('ai_learning_events').insert([{
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        event_type: 'diploma_mismatch_resolution',
        context: {
          application_id: applicationId,
          original_mismatch: JSON.parse(JSON.stringify(mismatchData)),
          resolution: 'rejected'
        },
        outcome: 'rejected',
        confidence_score: 1.0
      }]);

      toast.success('Sollicitant afgewezen');
      onResolved();
    } catch (error) {
      console.error('Error rejecting application:', error);
      toast.error('Fout bij afwijzen');
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  return (
    <Alert className="mb-4 border-orange-500 bg-orange-50 dark:bg-orange-950/30">
      <AlertTriangle className="h-5 w-5 text-orange-600" />
      <AlertTitle className="text-orange-800 dark:text-orange-400 font-semibold flex items-center gap-2">
        <GraduationCap className="h-4 w-4" />
        Diploma Niveau Discrepantie Gedetecteerd
      </AlertTitle>
      <AlertDescription className="text-orange-700 dark:text-orange-300">
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">CV vermeldt:</span>
            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
              {mismatchData.cv_functie} (Niveau {mismatchData.cv_niveau})
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Diploma bewijst:</span>
            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
              Niveau {mismatchData.diploma_niveau}
            </Badge>
          </div>
          <p className="text-sm mt-2">
            De kandidaat claimt een hoger opleidingsniveau dan het geüploade diploma aantoont.
            Controleer of er aanvullende diploma's zijn.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleRequestAdditionalDiploma}
            disabled={isProcessing}
          >
            {isProcessing && actionType === 'request' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileQuestion className="h-4 w-4 mr-2" />
            )}
            Vraag aanvullend diploma
          </Button>
          
          <Button 
            size="sm" 
            variant="secondary"
            onClick={handleAcceptLowerLevel}
            disabled={isProcessing}
          >
            {isProcessing && actionType === 'accept' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Accepteer niveau {mismatchData.diploma_niveau}
          </Button>
          
          <Button 
            size="sm" 
            variant="destructive"
            onClick={handleReject}
            disabled={isProcessing}
          >
            {isProcessing && actionType === 'reject' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Afwijzen
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

// Helper to get niveau label
function getNiveauLabel(niveau: number): string {
  const labels: Record<number, string> = {
    2: 'Helpende',
    3: 'VIG',
    4: 'Verpleegkundige MBO',
    5: 'GGZ-agoog',
    6: 'HBO-V'
  };
  return labels[niveau] || `Niveau ${niveau}`;
}
