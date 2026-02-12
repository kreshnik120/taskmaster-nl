import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface RecruiterNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

export function useUnreadNotifications() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ["unread-notifications"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return [];

      // Personal notification types: filter strictly on user_id
      const personalTypes = ["subtask_assignment", "task_assigned"];
      // Org-wide notification types: visible to all org members
      const orgTypes = ["diploma_upgrade", "vog_verified"];

      const [personalResult, orgResult] = await Promise.all([
        supabase
          .from("recruiter_notifications")
          .select("*")
          .is("read_at", null)
          .eq("user_id", user.id)
          .in("notification_type", personalTypes)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("recruiter_notifications")
          .select("*")
          .is("read_at", null)
          .in("notification_type", orgTypes)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (personalResult.error) throw personalResult.error;
      if (orgResult.error) throw orgResult.error;

      const allNotifications = [...(personalResult.data || []), ...(orgResult.data || [])];

      // Filter out self-triggered notifications
      const filtered = allNotifications.filter((notification) => {
        const metadata = notification.metadata as Record<string, unknown> | null;
        if (!metadata) return true;
        const triggeredBy = (metadata.triggered_by ?? metadata.assigned_by) as string | undefined;
        return !(triggeredBy && triggeredBy === user.id);
      });

      // Sort by created_at descending
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return filtered.slice(0, 20) as RecruiterNotification[];
    },
    staleTime: 30000,
  });

  useEffect(() => {
    channelRef.current = supabase
      .channel("notification-bell-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "recruiter_notifications",
          filter: "notification_type=in.(diploma_upgrade,vog_verified,subtask_assignment,task_assigned)",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [queryClient]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("recruiter_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("recruiter_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
    }
  };

  return {
    notifications,
    unreadCount: notifications.length,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch,
  };
}
