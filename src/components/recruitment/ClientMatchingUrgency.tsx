import { ChevronRight, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ClientMatchingUrgencyProps {
  clientsWithoutData: number;
  onViewClick: () => void;
  firstClientName?: string;
  firstClientInitials?: string;
  firstClientPhone?: string;
  firstClientEmail?: string;
}

export function ClientMatchingUrgency({ 
  clientsWithoutData, 
  onViewClick,
  firstClientName,
  firstClientInitials = "KL",
  firstClientPhone,
  firstClientEmail
}: ClientMatchingUrgencyProps) {
  if (clientsWithoutData === 0) return null;

  return (
    <div 
      className="group flex items-center gap-3 py-2 px-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-md cursor-pointer hover:bg-amber-50/70 hover:scale-[1.01] transition-all"
      onClick={onViewClick}
    >
      <Avatar className="h-8 w-8 bg-amber-600 border border-amber-200">
        <AvatarFallback className="text-white text-xs font-semibold">
          {firstClientInitials}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="absolute inset-0 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          </span>
        </div>
        <span className="text-sm text-foreground truncate">
          {clientsWithoutData} {clientsWithoutData === 1 ? "klant" : "klanten"} zonder matching data
          {firstClientName && <span className="text-muted-foreground"> · {firstClientName}</span>}
        </span>
      </div>
      
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {firstClientPhone && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `tel:${firstClientPhone}`;
            }}
          >
            <Phone className="h-3.5 w-3.5" />
          </Button>
        )}
        {firstClientEmail && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `mailto:${firstClientEmail}`;
            }}
          >
            <Mail className="h-3.5 w-3.5" />
          </Button>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-1" />
      </div>
    </div>
  );
}
