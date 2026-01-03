import { Shield, CheckCheck, ExternalLink, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSecurityAlerts } from "@/hooks/useSecurityAlerts";
import { cn } from "@/lib/utils";

export function SecurityAlertBell() {
  const navigate = useNavigate();
  const {
    alerts,
    unreadCount,
    criticalCount,
    isLoading,
    isAdmin,
    markAsRead,
    markAllAsRead,
  } = useSecurityAlerts();

  if (!isAdmin) return null;

  const handleAlertClick = (alert: (typeof alerts)[0]) => {
    markAsRead(alert.id);
    navigate("/ai-training?tab=systeem-health");
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "security_alert_critical":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "security_alert_warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getAlertBadgeClass = (type: string) => {
    switch (type) {
      case "security_alert_critical":
        return "bg-destructive text-destructive-foreground";
      case "security_alert_warning":
        return "bg-amber-500 text-white";
      default:
        return "bg-blue-500 text-white";
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-9 w-9",
            criticalCount > 0 && "text-destructive hover:text-destructive"
          )}
          aria-label={`${unreadCount} security alerts`}
        >
          <Shield className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
                criticalCount > 0
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-amber-500 text-white"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security Alerts
          </h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Alles gelezen
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-muted-foreground">Laden...</span>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Shield className="mb-2 h-8 w-8 text-green-500" />
              <span className="text-sm font-medium text-green-600">
                Geen security alerts
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                Alle systemen veilig
              </span>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  onClick={() => handleAlertClick(alert)}
                >
                  <span className="mt-0.5">{getAlertIcon(alert.notification_type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded",
                          getAlertBadgeClass(alert.notification_type)
                        )}
                      >
                        {alert.notification_type === "security_alert_critical"
                          ? "CRITICAL"
                          : alert.notification_type === "security_alert_warning"
                          ? "WARNING"
                          : "INFO"}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-tight mt-1">
                      {alert.title}
                    </p>
                    {alert.message && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {alert.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(alert.created_at), {
                        addSuffix: true,
                        locale: nl,
                      })}
                    </p>
                  </div>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {alerts.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => navigate("/ai-training?tab=systeem-health")}
            >
              Bekijk Security Dashboard
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
