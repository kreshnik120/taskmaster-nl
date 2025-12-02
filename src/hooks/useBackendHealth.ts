import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type BackendStatus = 'online' | 'offline' | 'checking';

export interface BackendHealthState {
  status: BackendStatus;
  lastCheck: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

const INITIAL_RETRY_DELAY = 15000; // 15s (was 10s)
const MAX_RETRY_DELAY = 180000; // 180s (was 120s)
const HEALTHY_CHECK_INTERVAL = 90000; // 90s when healthy (was 60s)
const HEALTH_CHECK_TIMEOUT = 8000; // 8s timeout (was 5s)

export const useBackendHealth = () => {
  const [healthState, setHealthState] = useState<BackendHealthState>({
    status: 'checking',
    lastCheck: null,
    errorMessage: null,
    retryCount: 0,
  });
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    const startTime = Date.now();
    
    if (!isMountedRef.current) return false;
    
    setHealthState(prev => ({ ...prev, status: 'checking' }));
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
      
      // Simple health check - just verify we can reach DB
      const { error } = await supabase
        .from('tasks')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (!isMountedRef.current) return false;
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      console.info('[HEALTH] ✅ Online', { duration: `${duration}ms` });
      
      setHealthState({
        status: 'online',
        lastCheck: new Date(),
        errorMessage: null,
        retryCount: 0,
      });
      
      return true;
    } catch (error: any) {
      if (!isMountedRef.current) return false;
      
      const duration = Date.now() - startTime;
      
      let errorMsg = 'Backend onbereikbaar';
      
      if (error?.name === 'AbortError') {
        errorMsg = 'Database timeout';
      } else if (error?.code === '544' || error?.message?.includes('504')) {
        errorMsg = 'Database timeout (504/544)';
      } else if (error?.code === '401') {
        errorMsg = 'Authenticatie fout';
      } else if (error?.code === '403') {
        errorMsg = 'RLS policy blokkeert toegang';
      } else if (error?.code === '429') {
        errorMsg = 'Rate limit bereikt';
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      console.warn('[HEALTH] ❌ Offline', { duration: `${duration}ms`, error: errorMsg });
      
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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    checkHealth();
  }, [checkHealth]);

  // Schedule next check based on current status
  useEffect(() => {
    if (healthState.status === 'checking') return;
    
    const delay = healthState.status === 'online' 
      ? HEALTHY_CHECK_INTERVAL 
      : Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, healthState.retryCount), MAX_RETRY_DELAY);
    
    console.info('[HEALTH] Next check in', { delay: `${Math.round(delay / 1000)}s` });
    
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        checkHealth();
      }
    }, delay);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [healthState.status, healthState.retryCount, checkHealth]);

  // Initial check and browser events
  useEffect(() => {
    isMountedRef.current = true;
    
    // Initial health check
    checkHealth();

    const handleOnline = () => {
      console.info('[HEALTH] Browser online event');
      checkHealth();
    };
    
    const handleOffline = () => {
      console.info('[HEALTH] Browser offline event');
      setHealthState(prev => ({
        ...prev,
        status: 'offline',
        errorMessage: 'Geen internetverbinding',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkHealth]);

  return {
    ...healthState,
    retry,
    isHealthy: healthState.status === 'online',
  };
};
