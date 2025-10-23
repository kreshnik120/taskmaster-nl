import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Dashboard from "./Dashboard";
import { Loader2 } from "lucide-react";

const withTimeout = <T,>(promise: Promise<T>, ms = 3000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    ),
  ]);
};

const Index = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let safetyTimeout: NodeJS.Timeout;

    const initAuth = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          3000
        );

        if (!mounted) return;

        if (error) throw error;

        const session = data?.session ?? null;
        setUser(session?.user ?? null);

        if (!session) {
          navigate('/auth');
        }
      } catch (e) {
        console.warn('[AuthInit] Fallback to unauthenticated state:', e);
        
        await supabase.auth.signOut({ scope: 'local' });
        
        if (mounted) {
          setUser(null);
          navigate('/auth');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    safetyTimeout = setTimeout(async () => {
      if (loading) {
        console.warn('[AuthInit] Safety timeout triggered');
        await supabase.auth.signOut({ scope: 'local' });
        setLoading(false);
        navigate('/auth');
      }
    }, 5000);

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setUser(session?.user ?? null);
          if (!session) {
            navigate('/auth');
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [navigate, loading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-auto">
          <SidebarTrigger className="mb-4" />
          <Dashboard />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
