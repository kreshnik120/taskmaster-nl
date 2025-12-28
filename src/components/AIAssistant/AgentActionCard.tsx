import React, { useState, useEffect } from 'react';
import { Mail, Calendar, FileText, Loader2, Check, X, AlertCircle, Clock, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

type ActionStatus = 'pending' | 'confirming' | 'processing' | 'completed' | 'failed';

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
  const { toast } = useToast();

  const config = ACTION_TYPE_CONFIG[actionData.action_type] || ACTION_TYPE_CONFIG.send_email;
  const IconComponent = config.icon;

  // Poll goal status when confirming/processing
  useEffect(() => {
    if (!goalId || (status !== 'confirming' && status !== 'processing')) return;

    const pollInterval = setInterval(async () => {
      const { data: goal } = await supabase
        .from('agent_goals')
        .select('status, output_data')
        .eq('id', goalId)
        .single();

      if (goal) {
        console.log('🔄 Agent goal status:', goal.status);
        
        if (goal.status === 'completed') {
          setStatus('completed');
          setStatusMessage('✅ Actie voltooid');
          clearInterval(pollInterval);
          toast({
            description: `Email succesvol verstuurd naar ${actionData.candidate_name}`,
          });
        } else if (goal.status === 'failed') {
          setStatus('failed');
          const errorMsg = (goal.output_data as any)?.error || 'Onbekende fout';
          setStatusMessage(`❌ ${errorMsg}`);
          clearInterval(pollInterval);
          toast({
            title: 'Actie mislukt',
            description: errorMsg,
            variant: 'destructive',
          });
        } else if (goal.status === 'in_progress' || goal.status === 'planned') {
          setStatus('processing');
          setStatusMessage('📤 Wordt verwerkt...');
        }
      }
    }, 2000);

    // Cleanup and timeout
    const timeoutId = setTimeout(() => {
      clearInterval(pollInterval);
      if (status === 'processing' || status === 'confirming') {
        setStatus('completed');
        setStatusMessage('✅ Actie gestart (check email)');
      }
    }, 30000); // 30 second timeout

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeoutId);
    };
  }, [goalId, status, actionData.candidate_name, toast]);

  const handleConfirm = async () => {
    setStatus('confirming');
    setStatusMessage('⏳ Bevestiging wordt verwerkt...');

    try {
      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Niet ingelogd');
      }

      // Create agent goal for chat-triggered followup
      const { data: goal, error } = await supabase
        .from('agent_goals')
        .insert({
          org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg org_id
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

      // Trigger orchestrator to process the goal
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
  };

  const handleCancel = () => {
    setStatus('pending');
    onCancel();
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'confirming':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Bevestigen...</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Verwerken...</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><Check className="w-3 h-3 mr-1" /> Voltooid</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><AlertCircle className="w-3 h-3 mr-1" /> Mislukt</Badge>;
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

      {/* Actions - only show when pending */}
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
    </Card>
  );
};

export default AgentActionCard;
