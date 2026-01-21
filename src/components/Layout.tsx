import { useState, useEffect } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SecurityAlertBell } from "@/components/notifications/SecurityAlertBell";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Layout = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    });

    // Listen for auth changes (logout, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          navigate("/auth", { replace: true });
        } else {
          setIsAuthenticated(true);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleNotificationClick = (applicationId: string) => {
    navigate("/sollicitaties");
    setSearchParams({ id: applicationId });
  };

  // Show loading spinner while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Only render content if authenticated
  if (!isAuthenticated) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <SecurityAlertBell />
                <NotificationBell onNotificationClick={handleNotificationClick} />
              </div>
            </div>
            <ErrorBoundary fallbackTitle="Pagina kon niet laden">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};