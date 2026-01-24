import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'mijn-werk-filter';

/**
 * Globale hook voor "Mijn Taken / Alle Taken" filter state
 * - Unified localStorage key voor consistentie tussen alle pagina's
 * - Default: true (toon alleen mijn taken)
 * - Automatisch current user ophalen
 */
export function useGlobalTaskFilter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true'; // Default TRUE
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        setUserId(user?.id || null);
      } catch (error) {
        console.error('[useGlobalTaskFilter] Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(showOnlyMyTasks));
    }
  }, [showOnlyMyTasks]);

  const toggleFilter = useCallback(() => {
    setShowOnlyMyTasks(prev => !prev);
  }, []);

  return { 
    showOnlyMyTasks, 
    setShowOnlyMyTasks,
    toggleFilter,
    userId,
    loading
  };
}
