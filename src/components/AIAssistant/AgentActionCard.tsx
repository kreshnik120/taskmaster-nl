import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Calendar, FileText, Loader2, Check, X, AlertCircle, Clock, User, ChevronDown, ChevronUp, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AgentActionData {
  type: 'agent_action_pending';
  action_type: 'send_email' | 'send_followup' | 'schedule_interview' | 'request_documents';
  candidate_name: string;
  candidate_email: string;
  application_id: string;
  action_description: string;
  action_preview?: string;
  missing_fields?: string[];
  custom_message?: string;
  pending_goal_id?: string;
}

interface AgentActionCardProps {
  actionData: AgentActionData;
  onConfirm: (goalId: string) => void;
  onCancel: () => void;
}

type ActionStatus = 'pending' | 'countdown' | 'confirming' | 'processing' | 'completed' | 'failed' | 'cancelled';

const UNDO_COUNTDOWN_SECONDS = 10;

const ACTION_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  send_email: { icon: Mail, label: 'Email versturen', color: 'text-blue-500' },
  send_followup: { icon: Mail, label: 'Follow-up email', color: 'text-amber-500' },
  schedule_interview: { icon: Calendar, label: 'Interview inplannen', color: 'text-green-500' },
  request_documents: { icon: FileText, label: 'Documenten opvragen', color: 'text-purple-500' },
};

export const AgentActionCard: React.FC<AgentActionCardProps> = ({
  actionData,
  onConfirm,
  onCancel,
}) => {
  const [status, setStatus] = useState<ActionStatus>('pending');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [goalId, setGoalId] = useState<string | null>(actionData.pending_goal_id || null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [countdownSeconds, setCountdownSeconds] = useState(UNDO_COUNTDOWN_SECONDS);
  const { toast } = useToast();

  // Refs for stable callbacks and cleanup
  const statusRef = useRef<ActionStatus>(status);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sendTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const config = ACTION_TYPE_CONFIG[actionData.action_type] || ACTION_TYPE_CONFIG.send_email;
  const IconComponent = config.icon;

  // Centralized timer cleanup helper
  const cleanupTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimers();
    };
  }, [cleanupTimers]);

  // Execute the actual send
  const executeSend = useCallback(async () => {
    setStatus('confirming');
    setStatusMessage('⏳ Bevestiging wordt verwerkt...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Niet ingelogd');
      }

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();

      const orgId = userOrg?.org_id || '550e8400-e29b-41d4-a716-446655440000';

      const { data: goal, error } = await supabase
        .from('agent_goals')
        .insert({
          org_id: orgId,
          goal_type: 'chat_triggered_followup',
          goal_description: `Chat-triggered follow-up naar ${actionData.candidate_name}`,
          status: 'pending',
          priority: 5,
          input_data: {
            application_id: actionData.application_id,
            candidate_email: actionData.candidate_email,
            candidate_name: actionData.candidate_name,
            priority_fields: actionData.missing_fields || [],
            custom_message: actionData.custom_message,
            triggered_by: 'chat',
            chat_user_id: session.user.id,
          },
        })
        .select('id')
        .single();

      if (error) throw error;

      setGoalId(goal.id);
      setStatus('processing');
      setStatusMessage('📤 Email wordt verstuurd...');
      onConfirm(goal.id);

      await supabase.functions.invoke('ai-agent-orchestrator', {
        body: { action: 'process_pending_goals' },
      });

    } catch (error: any) {
      console.error('Error confirming action:', error);
      setStatus('failed');
      setStatusMessage(`❌ ${error.message}`);
      toast({
        title: 'Fout',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [actionData, onConfirm, toast]);

  // Start countdown and schedule send
  const handleConfirm = () => {
    setStatus('countdown');
    setCountdownSeconds(UNDO_COUNTDOWN_SECONDS);
    setStatusMessage(`⏳ Wordt verstuurd over ${UNDO_COUNTDOWN_SECONDS} seconden...`);

    // Countdown interval
    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds(prev => {
        const next = prev - 1;
        if (next > 0) {
          setStatusMessage(`⏳ Wordt verstuurd over ${next} seconden...`);
        }
        return next;
      });
    }, 1000);

    // Schedule actual send
    sendTimeoutRef.current = setTimeout(() => {
      cleanupTimers();
      executeSend();
    }, UNDO_COUNTDOWN_SECONDS * 1000);

    toast({
      description: `Follow-up wordt over ${UNDO_COUNTDOWN_SECONDS} seconden verstuurd. Klik op "Ongedaan maken" om te annuleren.`,
    });
  };

  // Undo/cancel during countdown
  const handleUndo = () => {
    cleanupTimers();
    setStatus('cancelled');
    setStatusMessage('🚫 Verzending geannuleerd');
    
    toast({
      description: 'Follow-up verzending geannuleerd',
    });

    // Reset to pending after short delay
    setTimeout(() => {
      setStatus('pending');
      setStatusMessage('');
      setCountdownSeconds(UNDO_COUNTDOWN_SECONDS);
    }, 2000);
  };

  const handleCancel = () => {
    cleanupTimers();
    setStatus('pending');
    onCancel();
  };

  // Realtime subscription for goal status updates
  useEffect(() => {
    if (!goalId) return;

    console.log('🔔 Setting up realtime subscription for goal:', goalId);

    const handleGoalStatusUpdate = (goalStatus: string, outputData: unknown) => {
      console.log('📡 Goal status update:', goalStatus);
      const output = outputData as { error?: string; message?: string } | null;
      
      if (goalStatus === 'completed') {
        setStatus('completed');
        setStatusMessage('✅ Actie voltooid');
        toast({
          description: `Email succesvol verstuurd naar ${actionData.candidate_name}`,
        });
      } else if (goalStatus === 'failed') {
        setStatus('failed');
        const errorMsg = output?.error || 'Onbekende fout';
        setStatusMessage(`❌ ${errorMsg}`);
        toast({
          title: 'Actie mislukt',
          description: errorMsg,
          variant: 'destructive',
        });
      } else if (goalStatus === 'in_progress' || goalStatus === 'planned') {
        setStatus('processing');
        setStatusMessage('📤 Wordt verwerkt...');
      }
    };

    const fetchCurrentStatus = async () => {
      const { data: goal } = await supabase
        .from('agent_goals')
        .select('status, output_data')
        .eq('id', goalId)
        .single();

      if (goal) {
        handleGoalStatusUpdate(goal.status, goal.output_data);
      }
    };

    const channel = supabase
      .channel(`agent-goal-${goalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_goals',
          filter: `id=eq.${goalId}`
        },
        (payload) => {
          console.log('📡 Realtime goal update received:', payload);
          const newGoal = payload.new as { status: string; output_data: unknown };
          handleGoalStatusUpdate(newGoal.status, newGoal.output_data);
        }
      )
      .subscribe((subscriptionStatus, err) => {
        console.log('📡 Subscription status:', subscriptionStatus);
        if (subscriptionStatus === 'SUBSCRIBED') {
          fetchCurrentStatus();
        } else if (subscriptionStatus === 'CHANNEL_ERROR') {
          console.error('❌ Subscription error:', err);
          fetchCurrentStatus();
        }
      });

    const timeoutId = setTimeout(() => {
      if (statusRef.current === 'processing' || statusRef.current === 'confirming') {
        setStatus('completed');
        setStatusMessage('✅ Actie gestart (controleer email inbox)');
      }
    }, 60000);

    return () => {
      console.log('🔕 Cleaning up realtime subscription for goal:', goalId);
      supabase.removeChannel(channel);
      clearTimeout(timeoutId);
    };
  }, [goalId, actionData.candidate_name, toast]);

  const renderStatusBadge = () => {
    switch (status) {
      case 'countdown':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> {countdownSeconds}s</Badge>;
      case 'confirming':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Bevestigen...</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Verwerken...</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><Check className="w-3 h-3 mr-1" /> Voltooid</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><AlertCircle className="w-3 h-3 mr-1" /> Mislukt</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-border"><X className="w-3 h-3 mr-1" /> Geannuleerd</Badge>;
      default:
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Wacht op bevestiging</Badge>;
    }
  };

  const renderMissingFields = () => {
    if (!actionData.missing_fields || actionData.missing_fields.length === 0) return null;

    const fieldLabels: Record<string, string> = {
      functie_niveau: 'Functieniveau',
      werkvorm: 'Werkvorm (ZZP/Uitzend)',
      regio: 'Voorkeursregio',
      beschikbaarheid: 'Beschikbaarheid',
      telefoonnummer: 'Telefoonnummer',
      ervaring_sector: 'Sector ervaring',
      doelgroep_ervaring: 'Doelgroep ervaring',
      diploma: 'Diploma',
    };

    return (
      <div className="mt-2 text-sm text-muted-foreground">
        <p className="font-medium mb-1">Te vragen informatie:</p>
        <div className="flex flex-wrap gap-1">
          {actionData.missing_fields.slice(0, 5).map((field) => (
            <Badge key={field} variant="secondary" className="text-xs">
              {fieldLabels[field] || field}
            </Badge>
          ))}
          {actionData.missing_fields.length > 5 && (
            <Badge variant="secondary" className="text-xs">
              +{actionData.missing_fields.length - 5} meer
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-sm my-2">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md bg-primary/10 ${config.color}`}>
              <IconComponent className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{config.label}</p>
              <p className="text-xs text-muted-foreground">{actionData.action_description}</p>
            </div>
          </div>
          {renderStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="px-4 py-2">
        {/* Candidate Info */}
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 mb-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <div className="text-sm">
            <span className="font-medium">{actionData.candidate_name}</span>
            <span className="text-muted-foreground ml-2">({actionData.candidate_email})</span>
          </div>
        </div>

        {/* Countdown Progress Bar */}
        {status === 'countdown' && (
          <div className="mb-2">
            <Progress 
              value={(countdownSeconds / UNDO_COUNTDOWN_SECONDS) * 100} 
              className="h-1.5"
            />
          </div>
        )}

        {/* Missing Fields Preview */}
        {renderMissingFields()}

        {/* Collapsible Preview */}
        {actionData.action_preview && (
          <Collapsible open={isPreviewOpen} onOpenChange={setIsPreviewOpen} className="mt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-7">
                <span>Email preview bekijken</span>
                {isPreviewOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 rounded-md bg-muted/30 text-xs text-muted-foreground border border-border/50 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {actionData.action_preview}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Status Message */}
        {statusMessage && status !== 'pending' && (
          <div className="mt-2 text-xs text-center text-muted-foreground">
            {statusMessage}
          </div>
        )}
      </CardContent>

      {/* Actions - show when pending */}
      {status === 'pending' && (
        <CardFooter className="px-4 pb-3 pt-0 gap-2">
          <Button
            onClick={handleConfirm}
            size="sm"
            className="flex-1 h-8"
          >
            <Mail className="w-3 h-3 mr-1" />
            Verstuur
          </Button>
          <Button
            onClick={handleCancel}
            variant="ghost"
            size="sm"
            className="h-8"
          >
            <X className="w-3 h-3 mr-1" />
            Annuleer
          </Button>
        </CardFooter>
      )}

      {/* Undo button during countdown */}
      {status === 'countdown' && (
        <CardFooter className="px-4 pb-3 pt-0">
          <Button
            onClick={handleUndo}
            variant="destructive"
            size="sm"
            className="w-full h-8"
          >
            <Undo2 className="w-3 h-3 mr-1" />
            Ongedaan maken ({countdownSeconds}s)
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default AgentActionCard;
