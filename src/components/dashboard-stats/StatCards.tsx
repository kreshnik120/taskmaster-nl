import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardsProps {
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'success' | 'info';
  isLoading?: boolean;
}

function StatCard({ title, value, icon, variant = 'default', isLoading }: StatCardProps) {
  // Glass liquid card styles with context-colored shadows
  const variantStyles = {
    default: 'glass-liquid-card glass-liquid-card-violet',
    warning: 'glass-liquid-card glass-liquid-card-rose bg-destructive/10 border-destructive/20',
    success: 'glass-liquid-card glass-liquid-card-emerald bg-green-500/10 border-green-500/20',
    info: 'glass-liquid-card glass-liquid-card-blue bg-primary/10 border-primary/20',
  };

  const iconStyles = {
    default: 'text-muted-foreground',
    warning: 'text-destructive',
    success: 'text-green-600',
    info: 'text-primary',
  };

  return (
    <Card className={cn("rounded-xl border-0", variantStyles[variant])}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <div className="h-6 w-12 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold">{value}</p>
            )}
          </div>
          <div className={cn("p-1.5 rounded-full glass-layer-1 backdrop-blur-sm", iconStyles[variant])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCards({ totalTasks, openTasks, completedTasks, overdueTasks, isLoading }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Totaal taken"
        value={totalTasks}
        icon={<ClipboardList className="h-5 w-5" />}
        variant="default"
        isLoading={isLoading}
      />
      <StatCard
        title="Open"
        value={openTasks}
        icon={<Clock className="h-5 w-5" />}
        variant="info"
        isLoading={isLoading}
      />
      <StatCard
        title="Afgerond"
        value={completedTasks}
        icon={<CheckCircle2 className="h-5 w-5" />}
        variant="success"
        isLoading={isLoading}
      />
      <StatCard
        title="Verlopen"
        value={overdueTasks}
        icon={<AlertTriangle className="h-5 w-5" />}
        variant="warning"
        isLoading={isLoading}
      />
    </div>
  );
}
