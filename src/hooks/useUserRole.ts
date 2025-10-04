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
  const [role, setRole] = useState<UserRole | null>(null);
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

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user role:', error);
          setRole('user'); // default to user role
        } else {
          setRole(data.role as UserRole);
        }
      } catch (error) {
        console.error('Error in fetchUserRole:', error);
        setRole('user');
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
