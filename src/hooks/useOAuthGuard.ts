import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * Hook that checks if an OAuth user was blocked (no profile created)
 * and signs them out with an appropriate error message.
 */
export function useOAuthGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkOAuthAuthorization = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) return;
      
      const provider = session.user.app_metadata?.provider;
      
      // Only check for OAuth providers
      if (provider && ['google', 'github', 'azure', 'linkedin'].includes(provider)) {
        // Check if user has a profile (indicator they were authorized)
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking profile:', error);
          return;
        }
        
        if (!profile) {
          // User was blocked - no profile was created by the trigger
          logger.warn('OAuth user blocked - no profile found');
          
          // Sign out the blocked user
          await supabase.auth.signOut();
          
          toast.error(
            'Je account is niet geautoriseerd. Vraag een uitnodiging aan bij een beheerder.',
            { duration: 8000 }
          );
          
          navigate('/auth');
        }
      }
    };

    checkOAuthAuthorization();

    // Also listen for auth state changes (e.g., after OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const provider = session.user.app_metadata?.provider;
          
          if (provider && ['google', 'github', 'azure', 'linkedin'].includes(provider)) {
            // Small delay to allow trigger to complete
            setTimeout(async () => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', session.user.id)
                .maybeSingle();
              
              if (!profile) {
                await supabase.auth.signOut();
                toast.error(
                  'Je account is niet geautoriseerd. Vraag een uitnodiging aan bij een beheerder.',
                  { duration: 8000 }
                );
                navigate('/auth');
              }
            }, 500);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);
}
