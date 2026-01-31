import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConnectionStatus } from "@/hooks/whatsapp/useWhatsAppRealtimeStatus";

interface WhatsAppConnectionStatusProps {
  status: ConnectionStatus;
  onReconnect: () => void;
  className?: string;
}

export function WhatsAppConnectionStatus({
  status,
  onReconnect,
  className,
}: WhatsAppConnectionStatusProps) {
  const statusConfig = {
    connected: {
      icon: Wifi,
      label: "Verbonden",
      description: "Realtime verbinding actief",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    connecting: {
      icon: RefreshCw,
      label: "Verbinden...",
      description: "Bezig met verbinden",
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    disconnected: {
      icon: WifiOff,
      label: "Niet verbonden",
      description: "Klik om opnieuw te verbinden",
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 rounded-full",
              config.bgColor,
              className
            )}
            onClick={status === 'disconnected' ? onReconnect : undefined}
            disabled={status === 'connecting'}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                config.color,
                status === 'connecting' && "animate-spin"
              )}
            />
            <span className="sr-only">{config.label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
