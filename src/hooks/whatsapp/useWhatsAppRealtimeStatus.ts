import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface UseWhatsAppRealtimeStatusReturn {
  status: ConnectionStatus;
  lastConnected: Date | null;
  reconnect: () => void;
}

export function useWhatsAppRealtimeStatus(): UseWhatsAppRealtimeStatusReturn {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastConnected, setLastConnected] = useState<Date | null>(null);
  const [channelRef, setChannelRef] = useState<ReturnType<typeof supabase.channel> | null>(null);

  const setupChannel = useCallback(() => {
    // Remove existing channel if any
    if (channelRef) {
      supabase.removeChannel(channelRef);
    }

    const channel = supabase
      .channel('whatsapp-status-monitor')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_chats',
      }, () => {
        // Just listening for connection status
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setStatus('connected');
          setLastConnected(new Date());
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setStatus('disconnected');
        } else if (status === 'TIMED_OUT') {
          setStatus('disconnected');
        }
      });

    setChannelRef(channel);

    return channel;
  }, []);

  const reconnect = useCallback(() => {
    setStatus('connecting');
    setupChannel();
  }, [setupChannel]);

  useEffect(() => {
    const channel = setupChannel();

    // Check connection periodically
    const interval = setInterval(() => {
      if (channel.state !== 'joined') {
        setStatus('disconnected');
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [setupChannel]);

  return {
    status,
    lastConnected,
    reconnect,
  };
}
