import React, { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Bell, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";

interface ReminderWithTask {
  id: string;
  title: string | null;
  at: string;
  task_id: string;
  tasks: {
    id: string;
    title: string;
  };
}

export function UpcomingRemindersWidget() {
  const [reminders, setReminders] = useState<ReminderWithTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const loadReminders = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;

      const { data } = await supabase
        .from("reminders")
        .select(`
          id,
          title,
          at,
          task_id,
          tasks!inner(id, title, assignee_id)
        `)
        .eq("tasks.assignee_id", session.session.user.id)
        .gte("at", new Date().toISOString())
        .order("at", { ascending: true })
        .limit(5);

      setReminders((data as any) || []);
    } catch (error) {
      console.error("Error loading reminders:", error);
    }
  };

  useEffect(() => {
    loadReminders();

    // Real-time updates
    const channel = supabase
      .channel("upcoming-reminders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
        },
        () => {
          loadReminders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (reminders.length === 0) return null;

  return (
    <Card className="glass-layer-2 glass-light-bleed glass-hover-lift border-tab-mijn-werk-200/30 dark:border-tab-mijn-werk-800/30 shadow-[0_4px_12px_hsla(234,45%,52%,0.08),0_8px_24px_hsla(234,45%,52%,0.06)] hover:shadow-[0_8px_24px_hsla(234,45%,52%,0.12),0_16px_48px_hsla(234,45%,52%,0.08)] transition-all duration-300">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-tab-mijn-werk-50/50 dark:hover:bg-tab-mijn-werk-900/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-tab-mijn-werk-100 dark:bg-tab-mijn-werk-900/40">
                <Bell className="h-4 w-4 text-tab-mijn-werk-500" />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-sm">Aankomende herinneringen</h3>
                <p className="text-xs text-muted-foreground">
                  {reminders.length} {reminders.length === 1 ? "herinnering" : "herinneringen"}
                </p>
              </div>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-2">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm hover:bg-tab-mijn-werk-50/60 dark:hover:bg-tab-mijn-werk-900/30 border border-transparent hover:border-tab-mijn-werk-200/50 dark:hover:border-tab-mijn-werk-700/30 transition-all duration-200 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {reminder.title || reminder.tasks.title}
                  </p>
                  <Badge
                    variant="outline"
                    className="mt-1 text-xs bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border-tab-mijn-werk-300 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700"
                  >
                    <Bell className="h-3 w-3 mr-1" />
                    {formatDistanceToNow(new Date(reminder.at), {
                      locale: nl,
                      addSuffix: true,
                    })}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => navigate(`/dashboard?tab=mijn-werk&taskId=${reminder.task_id}`)}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
