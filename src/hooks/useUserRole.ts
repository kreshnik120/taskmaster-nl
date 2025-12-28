import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = 'admin' | 'manager' | 'user';

interface UseUserRoleReturn {
  role: UserRole | null;
  loading: boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canEdit: () => boolean;
}

export function useUserRole(): UseUserRoleReturn {
  // ⚡ CACHED ROLE: Init from localStorage to prevent flickering
  const [role, setRole] = useState<UserRole | null>(() => {
    const cached = localStorage.getItem('user_role_cache');
    return cached ? (cached as UserRole) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRole(null);
          setLoading(false);
          return;
        }

        // ⚡ TIMEOUT: Prevent infinite loading (5s max)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .abortSignal(controller.signal)
          .maybeSingle();

        clearTimeout(timeout);

        if (error) {
          console.error('⚠️ Error fetching user role:', error.code, error.message);
          // Keep cached role on error
        } else {
          // Default to 'user' if no role found
          const newRole = (data?.role as UserRole) || 'user';
          setRole(newRole);
          localStorage.setItem('user_role_cache', newRole);
        }
      } catch (error) {
        console.error('⚠️ Error in fetchUserRole:', error);
        // ⚡ KEEP CACHED ROLE: Don't override with 'user'
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();

    // Subscribe to role changes
    const channel = supabase
      .channel('user_roles_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
        },
        () => {
          fetchUserRole();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    role,
    loading,
    isAdmin: () => role === 'admin',
    isManager: () => role === 'manager',
    canEdit: () => role === 'admin' || role === 'manager',
  };
}
