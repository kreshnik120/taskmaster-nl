import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { KPICard } from "@/components/ui/kpi-card";

interface StatCardsProps {
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  isLoading?: boolean;
}

export function StatCards({ totalTasks, openTasks, completedTasks, overdueTasks, isLoading }: StatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Totaal taken"
        value={totalTasks}
        icon={ClipboardList}
        variant="violet"
      />
      <KPICard
        title="Open"
        value={openTasks}
        icon={Clock}
        variant="blue"
      />
      <KPICard
        title="Afgerond"
        value={completedTasks}
        icon={CheckCircle2}
        variant="emerald"
      />
      <KPICard
        title="Verlopen"
        value={overdueTasks}
        icon={AlertTriangle}
        variant="rose"
      />
    </div>
  );
}
