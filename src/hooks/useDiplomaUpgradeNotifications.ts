import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";

interface DiplomaUpgradeNotification {
  id: string;
  org_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  application_id: string | null;
  metadata: {
    candidate_name?: string;
    previous_status?: string;
    new_status?: string;
    upgrade_source?: string;
  };
  created_at: string;
}

/**
 * Hook that listens to realtime diploma upgrade notifications
 * and shows toast notifications with confetti effect.
 * 
 * @param onApplicationClick - Optional callback when user clicks "Bekijk" in toast
 */
export function useDiplomaUpgradeNotifications(
  onApplicationClick?: (applicationId: string) => void
) {
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('[useDiplomaUpgradeNotifications] Setting up realtime subscription');
    
    const channel = supabase
      .channel('diploma-upgrade-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'recruiter_notifications',
          filter: 'notification_type=eq.diploma_upgrade'
        },
        async (payload) => {
          const notification = payload.new as DiplomaUpgradeNotification;
          console.log('[useDiplomaUpgradeNotifications] Received notification:', notification);
          
          // Prevent duplicate notifications in same session
          if (notifiedIds.current.has(notification.id)) {
            console.log('[useDiplomaUpgradeNotifications] Duplicate notification, skipping');
            return;
          }
          notifiedIds.current.add(notification.id);
          
          // Fire confetti celebration effect
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b'],
          });
          
          // Show toast notification
          const candidateName = notification.metadata?.candidate_name || 'Kandidaat';
          
          toast.success('🎓 Diploma Geverifieerd door DUO!', {
            description: `Het diploma van ${candidateName} is succesvol geüpgraded naar verified_duo (100% betrouwbaar)`,
            duration: 12000,
            action: notification.application_id && onApplicationClick ? {
              label: "Bekijk",
              onClick: () => {
                if (notification.application_id) {
                  onApplicationClick(notification.application_id);
                }
              }
            } : undefined,
          });
          
          // Mark notification as read after displaying
          try {
            await supabase
              .from('recruiter_notifications')
              .update({ read_at: new Date().toISOString() })
              .eq('id', notification.id);
            console.log('[useDiplomaUpgradeNotifications] Marked notification as read');
          } catch (err) {
            console.error('[useDiplomaUpgradeNotifications] Failed to mark as read:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[useDiplomaUpgradeNotifications] Subscription status:', status);
      });

    return () => {
      console.log('[useDiplomaUpgradeNotifications] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [onApplicationClick]);
}
