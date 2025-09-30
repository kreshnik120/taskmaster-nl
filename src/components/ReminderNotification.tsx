import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Bell, X, Clock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ReminderNotificationProps {
  reminder: {
    id: string;
    title: string | null;
    at: string;
    task_id: string;
    subtask_id: string | null;
  };
  onClose: () => void;
  onSnooze: (minutes: number) => void;
}

export const ReminderNotification = ({
  reminder,
  onClose,
  onSnooze,
}: ReminderNotificationProps) => {
  const navigate = useNavigate();
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [subtaskTitle, setSubtaskTitle] = useState<string>("");

  useEffect(() => {
    const loadTaskInfo = async () => {
      const { data: task } = await supabase
        .from("tasks")
        .select("title")
        .eq("id", reminder.task_id)
        .single();

      if (task) setTaskTitle(task.title);

      if (reminder.subtask_id) {
        const { data: subtask } = await supabase
          .from("subtasks")
          .select("title")
          .eq("id", reminder.subtask_id)
          .single();

        if (subtask) setSubtaskTitle(subtask.title);
      }
    };

    loadTaskInfo();
  }, [reminder]);

  const handleGoToTask = () => {
    navigate(`/kanban/${reminder.task_id}`);
    onClose();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <Card className="w-80 p-4 shadow-lg border-primary bg-background">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="font-semibold text-sm">
                  {reminder.title || "Herinnering"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {taskTitle}
                  {subtaskTitle && ` → ${subtaskTitle}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(reminder.at), "HH:mm", { locale: nl })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-1"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleGoToTask}
              >
                <ArrowRight className="h-3 w-3 mr-1" />
                Ga naar taak
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Clock className="h-3 w-3 mr-1" />
                    Snooze
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onSnooze(5)}>
                    5 minuten
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSnooze(15)}>
                    15 minuten
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSnooze(60)}>
                    1 uur
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
