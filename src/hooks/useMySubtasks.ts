import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Subtask {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  task_id: string;
  order: number;
  task_title: string;
  task_priority: string | null;
}

export function useMySubtasks(userId: string | null) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadSubtasks = async () => {
    if (!userId) {
      setSubtasks([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("subtasks")
        .select(`
          id,
          title,
          status,
          due_at,
          task_id,
          order,
          tasks!inner(
            title,
            priority,
            deleted_at,
            completed_at
          )
        `)
        .eq("assignee_id", userId)
        .in("status", ["pending", "active"])
        .is("tasks.deleted_at", null)
        .is("tasks.completed_at", null)
        .order("due_at", { ascending: true, nullsFirst: false });

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        due_at: item.due_at,
        task_id: item.task_id,
        order: item.order,
        task_title: item.tasks?.title || "Onbekende taak",
        task_priority: item.tasks?.priority || null,
      }));

      setSubtasks(formatted);
    } catch (error) {
      console.error("Error loading my subtasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubtasks();

    // Real-time listener for subtask changes
    channelRef.current = supabase
      .channel("my-subtasks-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subtasks",
        },
        () => {
          loadSubtasks();
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId]);

  return {
    subtasks,
    loading,
    refetch: loadSubtasks,
  };
}
