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
    <div className="bg-amber-600/10 border border-amber-600/30 rounded-lg p-4 flex items-center gap-4">
      <div className="flex items-center gap-3 flex-1">
        <div className="relative">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        </div>
        
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {clientsWithoutData} {clientsWithoutData === 1 ? "klant" : "klanten"} zonder matching data
          </p>
          <p className="text-xs text-muted-foreground">
            Voeg regio's, sectoren en doelgroepen toe voor betere matching
          </p>
        </div>
      </div>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={onViewClick}
        className="shrink-0 hover:bg-amber-600/10 hover:border-amber-600/50"
      >
        Bekijk klanten
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}
