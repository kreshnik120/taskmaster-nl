import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { logger } from "@/lib/logger";

const log = logger.create('VogVerification');

interface VogVerificationNotification {
  id: string;
  org_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  application_id: string | null;
  metadata: {
    candidate_name?: string;
    validation_status?: string;
    verification_source?: string;
    days_remaining?: number;
    screening_profile_valid?: boolean;
  };
  created_at: string;
}

/**
 * Hook that listens to realtime VOG verification notifications
 * and shows toast notifications with confetti effect.
 * 
 * NOTE: Does NOT mark notifications as read - this is handled by NotificationBell.
 * 
 * @param onApplicationClick - Optional callback when user clicks "Bekijk" in toast
 */
export function useVogVerificationNotifications(
  onApplicationClick?: (applicationId: string) => void
) {
  const notifiedIds = useRef<Set<string>>(new Set());

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
        .channel('vog-verification-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'recruiter_notifications',
            filter: 'notification_type=eq.vog_verified'
          },
          async (payload) => {
            const notification = payload.new as VogVerificationNotification;
            log.debug('Received notification:', notification);
            
            // Prevent duplicate notifications in same session
            if (notifiedIds.current.has(notification.id)) {
              log.debug('Duplicate notification, skipping');
              return;
            }
            notifiedIds.current.add(notification.id);
            
            // Fire confetti celebration effect with VOG-themed colors (blue/green)
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#0ea5e9', '#06b6d4', '#22d3ee', '#10b981', '#34d399'],
            });
            
            // Show toast notification
            const candidateName = notification.metadata?.candidate_name || 'Kandidaat';
            const daysRemaining = notification.metadata?.days_remaining;
            
            const description = daysRemaining 
              ? `De VOG van ${candidateName} is authentiek en geldig (nog ${daysRemaining} dagen)`
              : `De VOG van ${candidateName} is succesvol geverifieerd via GAAV`;
            
            toast.success('📜 VOG Geverifieerd via GAAV!', {
              description,
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
  }, [onApplicationClick]);
}
