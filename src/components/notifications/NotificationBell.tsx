import { Bell, CheckCheck, ExternalLink } from "lucide-react";
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
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

interface NotificationBellProps {
  onNotificationClick?: (applicationId: string) => void;
}

export function NotificationBell({ onNotificationClick }: NotificationBellProps) {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useUnreadNotifications();

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    const metadata = notification.metadata as Record<string, unknown>;
    const applicationId = metadata?.application_id as string;
    const taskId = metadata?.task_id as string;
    
    markAsRead(notification.id);
    
    // Handle task assignment - navigate to task list with task highlight
    if (notification.notification_type === 'task_assigned' && taskId) {
      navigate(`/dashboard?tab=lijst&taskId=${taskId}`);
      return;
    }
    
    // Handle subtask assignment - navigate to task list with task highlight
    if (notification.notification_type === 'subtask_assignment' && taskId) {
      navigate(`/dashboard?tab=lijst&taskId=${taskId}&highlight=subtask`);
      return;
    }
    
    if (applicationId && onNotificationClick) {
      onNotificationClick(applicationId);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "diploma_upgrade": return "🎓";
      case "vog_verified": return "📜";
      case "subtask_assignment": return "📋";
      case "task_assigned": return "📌";
      default: return "🔔";
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`${unreadCount} ongelezen notificaties`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 max-h-[70vh]" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notificaties</h4>
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

        <ScrollArea className="max-h-[calc(70vh-52px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-muted-foreground">Laden...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <span className="text-sm text-muted-foreground">
                Geen nieuwe notificaties
              </span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="mt-0.5 text-lg">
                    {getNotificationIcon(notification.notification_type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), {
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
      </PopoverContent>
    </Popover>
  );
}
