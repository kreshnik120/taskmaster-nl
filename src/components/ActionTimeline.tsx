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
  User,
  ListChecks,
  Calendar
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

// Actieve subtaak interface voor koppeling
export interface ActiveSubtaskInfo {
  id: string;
  title: string;
  assignee_name?: string;
  due_at?: string;
}

interface ActionTimelineProps {
  taskId: string;
  currentAction: string | null;
  actionHistory: ActionHistoryItem[];
  activeSubtask?: ActiveSubtaskInfo | null;
  onActionAdded?: () => void;
  onActionCompleted?: () => void;
  onSubtaskCompleted?: (subtaskId: string) => void;
  compact?: boolean;
}

export function ActionTimeline({ 
  taskId, 
  currentAction, 
  actionHistory, 
  activeSubtask,
  onActionAdded,
  onActionCompleted,
  onSubtaskCompleted,
  compact = false 
}: ActionTimelineProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completingAction, setCompletingAction] = useState<string | null>(null);
  const { toast } = useToast();

  // Combineer historie en huidige actie in één tijdlijn
  const completedActions = actionHistory
    .filter(a => a.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

  // Handler voor het voltooien van een actieve subtaak via de timeline
  const handleCompleteSubtask = async () => {
    if (!activeSubtask || !onSubtaskCompleted) return;
    
    setCompletingAction(activeSubtask.title);
    await new Promise(resolve => setTimeout(resolve, 400));
    
    onSubtaskCompleted(activeSubtask.id);
    setCompletingAction(null);
  };

  const handleCompleteCurrentAction = async () => {
    if (!currentAction || completingAction) return;
    
    // Start animatie EERST
    setCompletingAction(currentAction);
    
    // Wacht op animatie (400ms)
    await new Promise(resolve => setTimeout(resolve, 400));
    
    setIsCompleting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Check of deze actie al bestaat om duplicaten te voorkomen
      const { data: existing } = await supabase
        .from('task_action_history')
        .select('id')
        .eq('task_id', taskId)
        .eq('action_text', currentAction)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update bestaande entry
        const { error: updateError } = await supabase
          .from('task_action_history')
          .update({ 
            completed_at: new Date().toISOString(), 
            completed_by: user?.id 
          })
          .eq('id', existing[0].id);
        if (updateError) throw updateError;
      } else {
        // Nieuwe entry toevoegen
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
      }

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
      setCompletingAction(null);
    }
  };

  const handleAddAction = async () => {
    if (!newActionText.trim()) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Als er een huidige actie is, verplaats deze eerst naar historie
      // Check eerst of deze actie al bestaat om duplicaten te voorkomen
      if (currentAction) {
        const { data: existing } = await supabase
          .from('task_action_history')
          .select('id')
          .eq('task_id', taskId)
          .eq('action_text', currentAction)
          .limit(1);

        if (existing && existing.length > 0) {
          // Update bestaande entry
          await supabase
            .from('task_action_history')
            .update({ 
              completed_at: new Date().toISOString(), 
              completed_by: user?.id 
            })
            .eq('id', existing[0].id);
        } else {
          // Nieuwe entry toevoegen
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

          {/* NU ACTIEF sectie - Prioriteit: Subtaak > next_action */}
          {(activeSubtask || currentAction) && (
            <div 
              className={cn(
                "relative flex items-start gap-3 group transition-all duration-300",
                (completingAction === activeSubtask?.title || completingAction === currentAction) && "animate-complete-slide-up"
              )}
            >
              {/* Pulse/Check indicator met morphing */}
              <div className={cn(
                "relative z-10 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ring-2 ring-background transition-colors duration-300",
                (completingAction === activeSubtask?.title || completingAction === currentAction)
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-primary/10"
              )}>
                {(completingAction === activeSubtask?.title || completingAction === currentAction) ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 animate-check-pop" />
                ) : (
                  <>
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                    {activeSubtask ? (
                      <ListChecks className="h-3.5 w-3.5 text-primary relative z-10" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 text-primary relative z-10" />
                    )}
                  </>
                )}
              </div>

              {/* Content card met kleurovergang */}
              <div className="flex-1 min-w-0">
                <div className={cn(
                  "p-3 rounded-xl border transition-all duration-300",
                  (completingAction === activeSubtask?.title || completingAction === currentAction)
                    ? "bg-green-50/50 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/30" 
                    : "bg-gradient-to-r from-primary/5 via-primary/[0.03] to-transparent border-primary/15 hover:bg-primary/[0.08]"
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-[10px] font-medium uppercase tracking-wider transition-colors duration-300",
                        (completingAction === activeSubtask?.title || completingAction === currentAction)
                          ? "text-green-600 dark:text-green-400" 
                          : "text-primary/70"
                      )}>
                        {(completingAction === activeSubtask?.title || completingAction === currentAction) 
                          ? "Voltooid!" 
                          : activeSubtask 
                            ? "Actieve Subtaak" 
                            : "Nu actief"}
                      </span>
                      <p className="text-sm font-medium text-foreground leading-snug mt-0.5">
                        {activeSubtask ? activeSubtask.title : currentAction}
                      </p>
                      
                      {/* Extra context voor subtaak */}
                      {activeSubtask && (activeSubtask.assignee_name || activeSubtask.due_at) && (
                        <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                          {activeSubtask.assignee_name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {activeSubtask.assignee_name}
                            </span>
                          )}
                          {activeSubtask.due_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(parseISO(activeSubtask.due_at), "d MMM", { locale: nl })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 shrink-0 transition-all text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30",
                        (completingAction === activeSubtask?.title || completingAction === currentAction)
                          ? "opacity-100" 
                          : "opacity-0 group-hover:opacity-100"
                      )}
                      onClick={activeSubtask ? handleCompleteSubtask : handleCompleteCurrentAction}
                      disabled={isCompleting || !!completingAction}
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
          {!currentAction && !activeSubtask && completedActions.length === 0 && !isAdding && (
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
