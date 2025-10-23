import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type BackendStatus = 'online' | 'offline' | 'checking';

export interface BackendHealthState {
  status: BackendStatus;
  lastCheck: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

const INITIAL_RETRY_DELAY = 10000; // 10s
const MAX_RETRY_DELAY = 120000; // 120s
const HEALTHY_CHECK_INTERVAL = 60000; // 60s when healthy

export const useBackendHealth = () => {
  const [healthState, setHealthState] = useState<BackendHealthState>({
    status: 'checking',
    lastCheck: null,
    errorMessage: null,
    retryCount: 0,
  });

  const checkHealth = useCallback(async () => {
    setHealthState(prev => ({ ...prev, status: 'checking' }));
    
    try {
      // Simple reachability check using Supabase REST endpoint
      const { error } = await supabase.from('autonomous_system_status').select('count').limit(1).maybeSingle();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = table not found (but connection works)
        throw error;
      }

      setHealthState({
        status: 'online',
        lastCheck: new Date(),
        errorMessage: null,
        retryCount: 0,
      });
      
      return true;
    } catch (error: any) {
      const errorMsg = error?.message || 'Backend onbereikbaar';
      
      setHealthState(prev => ({
        status: 'offline',
        lastCheck: new Date(),
        errorMessage: errorMsg,
        retryCount: prev.retryCount + 1,
      }));
      
      return false;
    }
  }, []);

  const retry = useCallback(() => {
    checkHealth();
  }, [checkHealth]);

  const getNextRetryDelay = useCallback(() => {
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, healthState.retryCount),
      MAX_RETRY_DELAY
    );
    return delay;
  }, [healthState.retryCount]);

  useEffect(() => {
    // Initial check
    checkHealth();

    // Set up periodic checks
    const interval = setInterval(() => {
      if (healthState.status === 'online') {
        checkHealth();
      } else {
        const delay = getNextRetryDelay();
        setTimeout(checkHealth, delay);
      }
    }, healthState.status === 'online' ? HEALTHY_CHECK_INTERVAL : getNextRetryDelay());

    // Listen to browser online/offline events
    const handleOnline = () => checkHealth();
    const handleOffline = () => {
      setHealthState(prev => ({
        ...prev,
        status: 'offline',
        errorMessage: 'Geen internetverbinding',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkHealth, getNextRetryDelay, healthState.status]);

  return {
    ...healthState,
    retry,
    isHealthy: healthState.status === 'online',
  };
};
