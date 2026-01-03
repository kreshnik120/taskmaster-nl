import { Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SecurityAlertBell } from "@/components/notifications/SecurityAlertBell";
export const Layout = () => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const handleNotificationClick = (applicationId: string) => {
    navigate("/sollicitaties");
    setSearchParams({ id: applicationId });
  };

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
