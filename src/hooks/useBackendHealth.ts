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
    const startTime = Date.now();
    console.info('[GLOBAL_HEALTH] Check starting...', { timestamp: new Date().toISOString() });
    
    setHealthState(prev => ({ ...prev, status: 'checking' }));
    
    try {
      // Create AbortController for 5s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // Core DB reachability check with AbortSignal
      const { error } = await supabase
        .from('tasks')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = table not found (but connection works)
        throw error;
      }

      console.info('[GLOBAL_HEALTH] ✅ Success', { duration: `${duration}ms` });
      
      setHealthState({
        status: 'online',
        lastCheck: new Date(),
        errorMessage: null,
        retryCount: 0,
      });
      
      return true;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Differentiate error types
      let errorMsg = 'Backend onbereikbaar';
      let errorType = 'unknown';
      
      if (error?.name === 'AbortError') {
        errorMsg = 'Database timeout (5s)';
        errorType = 'timeout';
      } else if (error?.code === '544' || error?.message?.includes('504')) {
        errorMsg = 'Database timeout (504/544)';
        errorType = 'infra-timeout';
      } else if (error?.code === '401') {
        errorMsg = 'Authenticatie fout';
        errorType = 'auth';
      } else if (error?.code === '403') {
        errorMsg = 'RLS policy blokkeert toegang';
        errorType = 'rls';
      } else if (error?.code === '429') {
        errorMsg = 'Rate limit bereikt';
        errorType = 'rate-limit';
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      console.warn('[GLOBAL_HEALTH] ❌ Failed', {
        duration: `${duration}ms`,
        error: errorMsg,
        type: errorType,
        code: error?.code
      });
      
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

  const scheduleNextCheck = useCallback(async () => {
    await checkHealth();
    
    const delay = healthState.status === 'online' 
      ? HEALTHY_CHECK_INTERVAL 
      : getNextRetryDelay();
    
    console.info('[GLOBAL_HEALTH] Next check in', { delay: `${delay / 1000}s` });
    
    setTimeout(scheduleNextCheck, delay);
  }, [checkHealth, healthState.status, getNextRetryDelay]);

  useEffect(() => {
    // Initial check and start self-scheduling loop
    scheduleNextCheck();

    // Listen to browser online/offline events
    const handleOnline = () => {
      console.info('[GLOBAL_HEALTH] Browser online event');
      checkHealth();
    };
    
    const handleOffline = () => {
      console.info('[GLOBAL_HEALTH] Browser offline event');
      setHealthState(prev => ({
        ...prev,
        status: 'offline',
        errorMessage: 'Geen internetverbinding',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [scheduleNextCheck, checkHealth]);

  return {
    ...healthState,
    retry,
    isHealthy: healthState.status === 'online',
  };
};
