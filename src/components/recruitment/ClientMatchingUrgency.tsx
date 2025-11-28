import { AlertCircle, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClientMatchingUrgencyProps {
  clientsWithoutData: number;
  onViewClick: () => void;
}

export function ClientMatchingUrgency({ 
  clientsWithoutData, 
  onViewClick 
}: ClientMatchingUrgencyProps) {
  if (clientsWithoutData === 0) return null;

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-md">
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="absolute inset-0 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          </span>
        </div>
        <span className="text-sm text-foreground">
          {clientsWithoutData} {clientsWithoutData === 1 ? "klant" : "klanten"} zonder matching data
        </span>
      </div>
      
      <button 
        onClick={onViewClick}
        className="text-sm text-primary hover:underline flex items-center gap-1"
      >
        Bekijk
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
