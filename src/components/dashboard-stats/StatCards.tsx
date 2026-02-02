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
  // Glass card styles with context-colored shadows
  const variantStyles = {
    default: 'glass-card-violet glass-hover-lift',
    warning: 'bg-destructive/10 border-destructive/20 glass-hover-lift shadow-[0_2px_6px_hsla(0,84%,60%,0.08),0_8px_24px_hsla(0,84%,60%,0.12)]',
    success: 'bg-green-500/10 border-green-500/20 glass-hover-lift shadow-[0_2px_6px_hsla(142,71%,45%,0.08),0_8px_24px_hsla(142,71%,45%,0.12)]',
    info: 'bg-primary/10 border-primary/20 glass-hover-lift shadow-[0_2px_6px_hsla(221,83%,53%,0.08),0_8px_24px_hsla(221,83%,53%,0.12)]',
  };

  const iconStyles = {
    default: 'text-muted-foreground',
    warning: 'text-destructive',
    success: 'text-green-600',
    info: 'text-primary',
  };

  return (
    <Card className={cn("rounded-xl", variantStyles[variant])}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold">{value}</p>
            )}
          </div>
          <div className={cn("p-2 rounded-full glass-layer-1 backdrop-blur-sm", iconStyles[variant])}>
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
