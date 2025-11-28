import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  icon: string;
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: number | "good" | "warning";
  gradient: string;
  onClick?: () => void;
}

export function KPICard({ icon, title, value, subtitle, trend, gradient, onClick }: KPICardProps) {
  const getTrendDisplay = () => {
    if (typeof trend === "number") {
      if (trend === 0) return null;
      
      return (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          trend > 0 ? "text-green-600" : "text-red-600"
        )}>
          {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span>{Math.abs(trend)}</span>
        </div>
      );
    }
    
    if (trend === "good") {
      return <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Goed</Badge>;
    }
    
    if (trend === "warning") {
      return (
        <div className="flex items-center gap-1 text-xs font-medium text-orange-600">
          <AlertCircle className="h-3 w-3" />
          <span>Let op</span>
        </div>
      );
    }
    
    return null;
  };

  return (
    <Card
      className={cn(
        "border-primary/10 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br",
        gradient,
        onClick && "cursor-pointer hover:scale-[1.02]"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-2xl">{icon}</span>
          {getTrendDisplay()}
        </div>
        
        <div className="space-y-1">
          <div className="text-3xl font-bold text-foreground">{value}</div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground/80">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
