import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { logger } from "@/lib/logger";

const log = logger.create('DiplomaUpgrade');

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
 * NOTE: Does NOT mark notifications as read - this is handled by NotificationBell.
 * 
 * @param onApplicationClick - Optional callback when user clicks "Bekijk" in toast
 */
export function useDiplomaUpgradeNotifications(
  onApplicationClick?: (applicationId: string) => void
) {
  const notifiedIds = useRef<Set<string>>(new Set());
  const onClickRef = useRef(onApplicationClick);

  useEffect(() => {
    onClickRef.current = onApplicationClick;
  }, [onApplicationClick]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    const checkAndSubscribe = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        log.debug('No auth session, skipping subscription');
        return;
      }
      
      log.debug('Setting up realtime subscription');
      
      channel = supabase
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
            log.debug('Received notification:', notification);
            
            // Prevent duplicate notifications in same session
            if (notifiedIds.current.has(notification.id)) {
              log.debug('Duplicate notification, skipping');
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
              action: notification.application_id && onClickRef.current ? {
                label: "Bekijk",
                onClick: () => {
                  if (notification.application_id && onClickRef.current) {
                    onClickRef.current(notification.application_id);
                  }
                }
              } : undefined,
            });
          }
        )
        .subscribe((status) => {
          log.debug('Subscription status:', status);
        });
    };
    
    checkAndSubscribe();

    return () => {
      if (channel) {
        log.debug('Cleaning up subscription');
        supabase.removeChannel(channel);
      }
    };
  }, []);
}
