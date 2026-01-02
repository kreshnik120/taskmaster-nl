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
      const { data, error } = await supabase
        .from("recruiter_notifications")
        .select("*")
        .is("read_at", null)
        .in("notification_type", ["diploma_upgrade", "vog_verified"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as RecruiterNotification[];
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
          filter: "notification_type=in.(diploma_upgrade,vog_verified)",
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
