import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface SecurityAlert {
  id: string;
  notification_type: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

export function useSecurityAlerts() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { isAdmin, loading: roleLoading } = useUserRole();

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ["security-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiter_notifications")
        .select("*")
        .is("read_at", null)
        .in("notification_type", [
          "security_alert_critical",
          "security_alert_warning",
          "security_alert_info",
        ])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as SecurityAlert[];
    },
    enabled: isAdmin && !roleLoading,
    staleTime: 30000,
  });

  useEffect(() => {
    if (!isAdmin) return;

    channelRef.current = supabase
      .channel("security-alert-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "recruiter_notifications",
          filter: "notification_type=in.(security_alert_critical,security_alert_warning,security_alert_info)",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["security-alerts"] });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [queryClient, isAdmin]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("recruiter_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["security-alerts"] });
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = alerts.map((a) => a.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("recruiter_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["security-alerts"] });
    }
  };

  const criticalCount = alerts.filter(
    (a) => a.notification_type === "security_alert_critical"
  ).length;

  const warningCount = alerts.filter(
    (a) => a.notification_type === "security_alert_warning"
  ).length;

  return {
    alerts,
    unreadCount: alerts.length,
    criticalCount,
    warningCount,
    isLoading: isLoading || roleLoading,
    isAdmin,
    markAsRead,
    markAllAsRead,
    refetch,
  };
}
