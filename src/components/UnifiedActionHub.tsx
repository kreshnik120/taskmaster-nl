import { useState, useEffect, useRef } from "react";
import { Zap, ListChecks, User, Loader2, Send, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseActionInput, getActionPreview, ParsedAction } from "@/lib/actionParser";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface UnifiedActionHubProps {
  taskId: string;
  teamMembers: TeamMember[];
  onActionCreated: () => void;
  onSubtaskCreated: () => void;
  className?: string;
}

export function UnifiedActionHub({
  taskId,
  teamMembers,
  onActionCreated,
  onSubtaskCreated,
  className
}: UnifiedActionHubProps) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Parse input on change
  useEffect(() => {
    if (!input.trim()) {
      setParsed(null);
      return;
    }
    
    const result = parseActionInput(input, teamMembers);
    setParsed(result);
  }, [input, teamMembers]);

  const handleSubmit = async () => {
    if (!parsed || !parsed.cleanText.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      switch (parsed.type) {
        case 'subtask':
          await createSubtask(parsed, user.id);
          break;
        case 'note':
          await createNote(parsed, user.id);
          break;
        case 'action':
          await createAction(parsed, user.id);
          break;
      }

      setInput("");
      setParsed(null);
      
    } catch (error) {
      console.error('Error creating action:', error);
      toast({
        title: "Fout",
        description: "Kon actie niet aanmaken",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createSubtask = async (parsed: ParsedAction, userId: string) => {
    // Get next order
    const { data: existingSubtasks } = await supabase
      .from('subtasks')
      .select('order')
      .eq('task_id', taskId)
      .order('order', { ascending: false })
      .limit(1);

    const nextOrder = (existingSubtasks?.[0]?.order || 0) + 1;

    const { error } = await supabase
      .from('subtasks')
      .insert({
        task_id: taskId,
        title: parsed.cleanText,
        status: 'active',
        order: nextOrder,
        assignee_id: parsed.assignee_id || userId,
        due_at: parsed.deadline?.toISOString() || null
      });

    if (error) throw error;

    toast({
      title: parsed.assignee_id ? "Subtaak toegewezen" : "Subtaak aangemaakt",
      description: parsed.assignee_name 
        ? `"${parsed.cleanText}" toegewezen aan ${parsed.assignee_name}`
        : `"${parsed.cleanText}" aan jezelf toegewezen`
    });

    onSubtaskCreated();
  };

  const createNote = async (parsed: ParsedAction, userId: string) => {
    const { error } = await supabase
      .from('task_action_history')
      .insert({
        task_id: taskId,
        action_text: parsed.cleanText,
        action_type: 'note',
        created_by: userId,
        completed_at: new Date().toISOString(),
        completed_by: userId,
        is_current: false
      });

    if (error) throw error;

    toast({
      title: "Notitie toegevoegd",
      description: "Notitie is opgeslagen in het actieverloop"
    });

    onActionCreated();
  };

  const createAction = async (parsed: ParsedAction, userId: string) => {
    // First, complete current action if exists
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('next_action')
      .eq('id', taskId)
      .single();

    if (currentTask?.next_action) {
      // Archive current action
      const { data: existing } = await supabase
        .from('task_action_history')
        .select('id')
        .eq('task_id', taskId)
        .eq('action_text', currentTask.next_action)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('task_action_history')
          .update({ 
            completed_at: new Date().toISOString(), 
            completed_by: userId 
          })
          .eq('id', existing[0].id);
      } else {
        await supabase
          .from('task_action_history')
          .insert({
            task_id: taskId,
            action_text: currentTask.next_action,
            action_type: 'followup',
            created_by: userId,
            completed_at: new Date().toISOString(),
            completed_by: userId,
            is_current: false
          });
      }
    }

    // Set new action
    const { error } = await supabase
      .from('tasks')
      .update({ next_action: parsed.cleanText })
      .eq('id', taskId);

    if (error) throw error;

    toast({
      title: "Actie ingesteld",
      description: `Nieuwe vervolgactie: "${parsed.cleanText}"`
    });

    onActionCreated();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getTypeIcon = () => {
    if (!parsed) return <Zap className="h-4 w-4 text-muted-foreground/50" />;
    
    switch (parsed.type) {
      case 'subtask':
        return <ListChecks className="h-4 w-4 text-primary" />;
      case 'note':
        return <Zap className="h-4 w-4 text-blue-500" />;
      case 'action':
        return <Zap className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Input container */}
      <div className={cn(
        "flex items-center gap-2 p-2 rounded-lg border transition-colors",
        parsed ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/30"
      )}>
        <div className="flex-shrink-0 p-1.5">
          {getTypeIcon()}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowTips(true)}
          onBlur={() => setTimeout(() => setShowTips(false), 200)}
          placeholder="Wat moet er gebeuren? (@naam, /s, #morgen)"
          className={cn(
            "flex-1 bg-transparent text-sm outline-none",
            "placeholder:text-muted-foreground/60"
          )}
          disabled={isSubmitting}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!parsed?.cleanText.trim() || isSubmitting}
          className={cn(
            "p-2 rounded-md transition-colors",
            parsed?.cleanText.trim() && !isSubmitting
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground/50 cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Live preview */}
      {parsed && parsed.cleanText && (
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <span className="text-foreground/80">
            {getActionPreview(parsed)}
          </span>
          {parsed.cleanText !== input.trim() && (
            <>
              <span>→</span>
              <span className="text-foreground font-medium truncate max-w-[200px]">
                "{parsed.cleanText}"
              </span>
            </>
          )}
        </div>
      )}

      {/* Tips (shown on focus) */}
      {showTips && !parsed?.cleanText && (
        <div className="flex items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground bg-muted/30 rounded-md animate-in fade-in-0 duration-150">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-500" />
          <div className="space-y-0.5">
            <div><span className="font-mono text-primary">@naam</span> = toewijzen aan collega</div>
            <div><span className="font-mono text-primary">/s</span> = subtaak • <span className="font-mono text-primary">/n</span> = notitie</div>
            <div><span className="font-mono text-primary">#morgen</span> = deadline morgen 17:00</div>
          </div>
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setInput(input + ' ')}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-xs",
            "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          )}
        >
          <Zap className="h-3 w-3" />
          Actie
        </button>
        <button
          type="button"
          onClick={() => setInput('/s ' + input)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-xs",
            "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          )}
        >
          <ListChecks className="h-3 w-3" />
          Subtaak
        </button>
        {teamMembers.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setInput('@');
              inputRef.current?.focus();
            }}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs",
              "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            )}
          >
            <User className="h-3 w-3" />
            Toewijzen
          </button>
        )}
      </div>
    </div>
  );
}
