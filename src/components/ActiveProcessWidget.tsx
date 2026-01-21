import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";
import { ProcessTimeline } from "./ProcessTimeline";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { UrgencyBadge } from "@/components/ui/urgency-badge";
import { formatDateTime } from "@/lib/dateFormatters";

interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  order: number;
  due_at: string | null;
  assignee_id: string | null;
  task_id: string;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  tasks: {
    title: string;
  };
}

export function ActiveProcessWidget() {
  const [activeSubtasks, setActiveSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadActiveSubtasks();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('active-subtasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subtasks'
        },
        () => {
          loadActiveSubtasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadActiveSubtasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('subtasks')
        .select(`
          *,
          profiles:assignee_id(name, email),
          tasks!inner(
            title,
            deleted_at,
            completed_at
          )
        `)
        .eq('status', 'active')
        .or(`assignee_id.eq.${user.id},assignee_id.is.null`)
        .is('tasks.deleted_at', null)
        .is('tasks.completed_at', null)
        .order('due_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setActiveSubtasks(data || []);
    } catch (error) {
      logger.error('Error loading active subtasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteStep = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'completed' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast({
        title: "Stap voltooid",
        description: "Processtap is afgerond"
      });
    } catch (error) {
      logger.error('Error completing step:', error);
      toast({
        title: "Fout",
        description: "Kon stap niet voltooien",
        variant: "destructive"
      });
    }
  };

  const handleSkipStep = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'skipped' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast({
        title: "Stap overgeslagen",
        description: "Processtap is overgeslagen"
      });
    } catch (error) {
      logger.error('Error skipping step:', error);
      toast({
        title: "Fout",
        description: "Kon stap niet overslaan",
        variant: "destructive"
      });
    }
  };

  // Urgency is now handled by UrgencyBadge component

  if (loading) {
    return null;
  }

  if (activeSubtasks.length === 0) {
    return null;
  }

  // Group by task
  const groupedByTask = activeSubtasks.reduce((acc, subtask) => {
    const taskId = subtask.task_id;
    if (!acc[taskId]) {
      acc[taskId] = {
        taskTitle: subtask.tasks.title,
        subtasks: []
      };
    }
    acc[taskId].subtasks.push(subtask);
    return acc;
  }, {} as Record<string, { taskTitle: string; subtasks: Subtask[] }>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Actieve Processtappen
        </CardTitle>
        <CardDescription>
          {activeSubtasks.length} actieve {activeSubtasks.length === 1 ? 'stap' : 'stappen'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groupedByTask).map(([taskId, { taskTitle, subtasks }]) => (
          <div key={taskId} className="space-y-2">
            <h3 className="font-medium text-sm">{taskTitle}</h3>
            
            {subtasks.map((subtask) => (
                <div 
                  key={subtask.id}
                  className="flex items-start gap-3 p-3 border rounded-lg bg-card"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{subtask.title}</span>
                    </div>
                    
                    {subtask.due_at && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(subtask.due_at)}
                        </span>
                        <UrgencyBadge dueAt={subtask.due_at} showDate={false} />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => handleCompleteStep(subtask.id)}
                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      Voltooid
                    </button>
                    <button
                      onClick={() => handleSkipStep(subtask.id)}
                      className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
