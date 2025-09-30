import { useEffect, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Bell, Trash2, Mail, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Reminder {
  id: string;
  title: string | null;
  at: string;
  channel: "IN_APP" | "EMAIL";
  repeat_interval: string;
  created_at: string;
  task_id: string | null;
  subtask_id: string | null;
}

interface ReminderListProps {
  taskId?: string;
  subtaskId?: string;
  onAddClick: () => void;
}

export function ReminderList({ taskId, subtaskId, onAddClick }: ReminderListProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadReminders = async () => {
    try {
      let query = supabase
        .from("reminders")
        .select("*")
        .order("at", { ascending: true });

      if (taskId) {
        query = query.eq("task_id", taskId);
      } else if (subtaskId) {
        query = query.eq("subtask_id", subtaskId);
      } else {
        return;
      }

      const { data, error } = await query;

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error("Error loading reminders:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      const { error } = await supabase.from("reminders").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Herinnering verwijderd",
      });

      loadReminders();
    } catch (error) {
      console.error("Error deleting reminder:", error);
      toast({
        title: "Fout",
        description: "Kon herinnering niet verwijderen",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadReminders();

    // Real-time updates
    const channel = supabase
      .channel("reminders-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
          filter: taskId ? `task_id=eq.${taskId}` : `subtask_id=eq.${subtaskId}`,
        },
        () => {
          loadReminders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, subtaskId]);

  const getRepeatLabel = (interval: string) => {
    switch (interval) {
      case "DAILY":
        return "Dagelijks";
      case "WEEKLY":
        return "Wekelijks";
      case "MONTHLY":
        return "Maandelijks";
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Herinneringen
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={onAddClick}>
          + Herinnering
        </Button>
      </div>

      {reminders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen herinneringen</p>
      ) : (
        <div className="space-y-2">
          {reminders.map((reminder) => (
            <Card key={reminder.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {reminder.title && (
                    <p className="text-sm font-medium truncate">
                      {reminder.title}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(reminder.at), "PPP 'om' HH:mm", {
                      locale: nl,
                    })}
                  </p>
                  <div className="flex gap-2 mt-1">
                    {reminder.channel === "EMAIL" && (
                      <Badge variant="outline" className="text-xs">
                        <Mail className="h-3 w-3 mr-1" />
                        E-mail
                      </Badge>
                    )}
                    {reminder.repeat_interval !== "NONE" && (
                      <Badge variant="outline" className="text-xs">
                        <Repeat className="h-3 w-3 mr-1" />
                        {getRepeatLabel(reminder.repeat_interval)}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteReminder(reminder.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
