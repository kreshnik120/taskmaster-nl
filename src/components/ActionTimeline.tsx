import { useState } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  Plus,
  ChevronRight,
  Clock,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ActionHistoryItem {
  id: string;
  action_text: string;
  action_type: 'followup' | 'note' | 'status_change';
  created_at: string;
  created_by_name?: string;
  completed_at?: string | null;
  completed_by_name?: string;
  is_current: boolean;
}

interface ActionTimelineProps {
  taskId: string;
  currentAction: string | null;
  actionHistory: ActionHistoryItem[];
  onActionAdded?: () => void;
  onActionCompleted?: () => void;
  compact?: boolean;
}

export function ActionTimeline({ 
  taskId, 
  currentAction, 
  actionHistory, 
  onActionAdded,
  onActionCompleted,
  compact = false 
}: ActionTimelineProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const { toast } = useToast();

  // Combineer historie en huidige actie in één tijdlijn
  const completedActions = actionHistory
    .filter(a => a.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

  const handleCompleteCurrentAction = async () => {
    if (!currentAction) return;
    setIsCompleting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Voeg huidige actie toe aan historie als voltooid
      const { error: historyError } = await supabase
        .from('task_action_history')
        .insert({
          task_id: taskId,
          action_text: currentAction,
          action_type: 'followup',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
          is_current: false
        });

      if (historyError) throw historyError;

      // 2. Clear de next_action op de taak
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ next_action: null })
        .eq('id', taskId);

      if (taskError) throw taskError;

      toast({
        title: "Actie voltooid",
        description: "De vervolgactie is gemarkeerd als afgerond."
      });

      onActionCompleted?.();
    } catch (error) {
      console.error('Error completing action:', error);
      toast({
        title: "Fout",
        description: "Kon de actie niet voltooien.",
        variant: "destructive"
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleAddAction = async () => {
    if (!newActionText.trim()) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Als er een huidige actie is, verplaats deze eerst naar historie
      if (currentAction) {
        await supabase
          .from('task_action_history')
          .insert({
            task_id: taskId,
            action_text: currentAction,
            action_type: 'followup',
            completed_at: new Date().toISOString(),
            completed_by: user?.id,
            is_current: false
          });
      }

      // Stel de nieuwe actie in als next_action
      const { error } = await supabase
        .from('tasks')
        .update({ next_action: newActionText.trim() })
        .eq('id', taskId);

      if (error) throw error;

      setNewActionText("");
      setIsAdding(false);
      
      toast({
        title: "Actie toegevoegd",
        description: "De nieuwe vervolgactie is ingesteld."
      });

      onActionAdded?.();
    } catch (error) {
      console.error('Error adding action:', error);
      toast({
        title: "Fout",
        description: "Kon de actie niet toevoegen.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddAction();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewActionText("");
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {/* Compacte weergave: alleen huidige actie */}
        {currentAction && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 via-primary/[0.03] to-transparent border border-primary/15 group">
            <div className="flex items-start gap-2.5">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <ArrowRight className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70">
                  Volgende actie
                </span>
                <p className="text-sm font-medium text-foreground leading-snug mt-0.5 truncate">
                  {currentAction}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header met toevoeg-knop */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Actieverloop
        </span>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Actie
          </Button>
        )}
      </div>

      {/* Timeline container */}
      <div className="relative">
        {/* Verticale connector lijn */}
        {(completedActions.length > 0 || currentAction) && (
          <div 
            className="absolute left-[11px] top-3 bottom-3 w-px bg-border/60" 
            aria-hidden="true" 
          />
        )}

        <div className="space-y-3">
          {/* Voltooide acties */}
          {completedActions.map((action, index) => (
            <div 
              key={action.id} 
              className="relative flex items-start gap-3 group"
            >
              {/* Status icon */}
              <div className="relative z-10 h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 ring-2 ring-background">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mb-0.5">
                  <Clock className="h-3 w-3" />
                  <span>
                    {action.completed_at && format(parseISO(action.completed_at), "d MMM 'om' HH:mm", { locale: nl })}
                  </span>
                  {action.completed_by_name && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {action.completed_by_name}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-snug">
                  {action.action_text}
                </p>
              </div>
            </div>
          ))}

          {/* Huidige actie */}
          {currentAction && (
            <div className="relative flex items-start gap-3 group">
              {/* Pulse indicator */}
              <div className="relative z-10 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-background">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                <ArrowRight className="h-3.5 w-3.5 text-primary relative z-10" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 via-primary/[0.03] to-transparent border border-primary/15 hover:bg-primary/[0.08] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70">
                        Nu actief
                      </span>
                      <p className="text-sm font-medium text-foreground leading-snug mt-0.5">
                        {currentAction}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={handleCompleteCurrentAction}
                      disabled={isCompleting}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      <span className="text-xs">Voltooid</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Nieuwe actie toevoegen */}
          {isAdding && (
            <div className="relative flex items-start gap-3">
              <div className="relative z-10 h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0 ring-2 ring-background">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Input
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nieuwe vervolgactie..."
                    className="h-9 text-sm"
                    autoFocus
                    disabled={isSubmitting}
                  />
                  <Button
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={handleAddAction}
                    disabled={!newActionText.trim() || isSubmitting}
                  >
                    {isSubmitting ? "..." : "Toevoegen"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 shrink-0"
                    onClick={() => {
                      setIsAdding(false);
                      setNewActionText("");
                    }}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Lege staat */}
          {!currentAction && completedActions.length === 0 && !isAdding && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted/30 mb-2">
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground/60 mb-2">
                Nog geen vervolgacties
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Eerste actie toevoegen
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
