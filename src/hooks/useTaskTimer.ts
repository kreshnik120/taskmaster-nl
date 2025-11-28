import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  start: string;
  end: string | null;
  duration_min: number | null;
  note: string | null;
}

export function useTaskTimer(taskId: string | null) {
  const [activeTimer, setActiveTimer] = useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("0u 0m 0s");

  // Check if timer is active for this task
  useEffect(() => {
    if (!taskId) return;

    const checkTimer = async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("task_id", taskId)
        .is("end", null)
        .maybeSingle();

      setActiveTimer(data);
    };

    checkTimer();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`timer-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          checkTimer();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  // Update elapsed time every second
  useEffect(() => {
    if (!activeTimer) {
      setElapsedTime("0u 0m 0s");
      return;
    }

    const updateTime = () => {
      const now = new Date();
      const start = new Date(activeTimer.start);
      const totalSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setElapsedTime(`${hours}u ${minutes}m ${seconds}s`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [activeTimer]);

  const startTimer = useCallback(
    async (note?: string) => {
      if (!taskId) {
        toast.error("Geen taak geselecteerd");
        return;
      }

      setIsLoading(true);
      try {
        // Check if any other timer is running
        const { data: existingTimer } = await supabase
          .from("time_entries")
          .select("*")
          .is("end", null)
          .maybeSingle();

        if (existingTimer) {
          toast.error("Er loopt al een timer voor een andere taak");
          return;
        }

        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          toast.error("Niet ingelogd");
          return;
        }

        const { data, error } = await supabase
          .from("time_entries")
          .insert({
            task_id: taskId,
            user_id: session.session.user.id,
            start: new Date().toISOString(),
            note: note || null,
          })
          .select()
          .single();

        if (error) throw error;

        setActiveTimer(data);
        toast.success("Timer gestart");
      } catch (error) {
        console.error("Error starting timer:", error);
        toast.error("Fout bij starten timer");
      } finally {
        setIsLoading(false);
      }
    },
    [taskId]
  );

  const stopTimer = useCallback(async () => {
    if (!activeTimer) return;

    setIsLoading(true);
    try {
      const endTime = new Date();
      const startTime = new Date(activeTimer.start);
      const durationMin = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 60000
      );

      const { error } = await supabase
        .from("time_entries")
        .update({
          end: endTime.toISOString(),
          duration_min: durationMin,
        })
        .eq("id", activeTimer.id);

      if (error) throw error;

      setActiveTimer(null);
      
      const hours = Math.floor(durationMin / 60);
      const mins = durationMin % 60;
      toast.success(`Timer gestopt: ${hours}u ${mins}m`);
    } catch (error) {
      console.error("Error stopping timer:", error);
      toast.error("Fout bij stoppen timer");
    } finally {
      setIsLoading(false);
    }
  }, [activeTimer]);

  return {
    activeTimer,
    isLoading,
    elapsedTime,
    startTimer,
    stopTimer,
    isTimerActive: !!activeTimer,
  };
}
